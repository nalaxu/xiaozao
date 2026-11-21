import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budget } from "@config/limits";
import type { RecommendEvent, RecommendInput } from "@/lib/recommend-types";
import { setModelClientForTests } from "../ai/call";
import { ModelError, type ModelClient, type ModelRequest } from "../ai/types";
import type { Db } from "../db/client";
import { dailySpend, dishes, modelCalls, preferences, privacySettings as privacySettingsTable, recommendationRuns, users } from "../db/schema";
import { testDb } from "../test-utils";
import { quotaStatus, utcDay } from "../usage";
import { pickCuisines } from "./candidates";
import { checkDish, type RawDish } from "./model";
import { clipName, runRecommend } from "./run";

const dish = (over: Partial<RawDish>): RawDish => ({
  name_zh: "酸辣土豆丝",
  name_en: "Hot and sour potato",
  name_original: null,
  cuisine_id: "sichuan",
  flavor_tags: ["sour-spicy"],
  summary: "酸辣爽脆",
  total_minutes: 15,
  difficulty: 1,
  uses: ["土豆"],
  key_ingredients: ["土豆", "干辣椒", "醋"],
  to_buy: [],
  nutrition: null,
  visual: "shredded potato",
  ...over,
});

/** 假模型：按顺序返回预置的结果，并分小块流式输出 */
function scripted(responses: (RawDish[] | Error)[]) {
  const calls: ModelRequest[] = [];
  const client: ModelClient = {
    async run(req, onDelta) {
      calls.push(req);
      const next = responses.shift();
      if (!next) throw new Error("no more scripted responses");
      if (next instanceof Error) throw next;
      const text = JSON.stringify({ dishes: next });
      for (let i = 0; i < text.length; i += 17) onDelta?.(text.slice(i, i + 17));
      return { text, usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 400 } };
    },
  };
  return { client, calls };
}

const input: RecommendInput = {
  main: ["土豆", "鸡肉"],
  other: [],
  flavors: ["sour-spicy"],
  scene: null,
  cuisines: [],
  servings: null,
  exclude: [],
};

let db: Db;
let user: { id: string; role: "user" | "admin" };

async function collect(i = input) {
  const events: RecommendEvent[] = [];
  await runRecommend(db, user, i, (e) => events.push(e));
  return events;
}

beforeEach(async () => {
  db = await testDb();
  const [u] = await db.insert(users).values({ email: "cook@example.test" }).returning();
  user = { id: u.id, role: "user" };
});

afterEach(() => setModelClientForTests(undefined));

describe("runRecommend", () => {
  it("streams accepted dishes, records the run and caches the result", async () => {
    const { client, calls } = scripted([
      [
        dish({}),
        dish({ name_zh: "酸汤肥牛", cuisine_id: "hunan" }),
        dish({ name_zh: "冬阴功汤", cuisine_id: "thai", name_original: "Tom Yum" }),
      ],
    ]);
    setModelClientForTests(client);
    const events = await collect();
    expect(events.map((e) => e.type)).toEqual(["start", "dish", "dish", "dish", "done"]);
    expect(calls).toHaveLength(1);
    expect(await db.select().from(dishes)).toHaveLength(3);
    expect(await db.select().from(recommendationRuns)).toHaveLength(1);
    expect(await db.select().from(modelCalls)).toHaveLength(1);
    expect((await quotaStatus(db, user)).remaining.recommend).toBe(2);
    // 记住口味，下次默认带出（F13）
    const [pref] = await db.select().from(preferences).where(eq(preferences.userId, user.id));
    expect(pref.lastFlavors).toEqual(["sour-spicy"]);
  });

  it("serves the same input from cache without calling the model, but still uses quota", async () => {
    const { client, calls } = scripted([
      [dish({}), dish({ name_zh: "酸汤肥牛", cuisine_id: "hunan" }), dish({ name_zh: "冬阴功汤", cuisine_id: "thai" })],
    ]);
    setModelClientForTests(client);
    await collect();
    // 关掉历史记录，否则第二次会排除刚推荐过的菜，缓存键不同
    const second = await runRecommendWithoutHistory();
    expect(second[0]).toMatchObject({ type: "start", cached: true });
    expect(second.filter((e) => e.type === "dish")).toHaveLength(3);
    expect(calls).toHaveLength(1);
    expect((await quotaStatus(db, user)).remaining.recommend).toBe(1);
  });

  it("drops dishes that hit an avoided ingredient and tops up once without extra quota", async () => {
    await db.insert(preferences).values({ userId: user.id, avoid: ["香菜"] });
    const { client, calls } = scripted([
      [
        dish({ name_zh: "凉拌黄瓜", key_ingredients: ["黄瓜", "芫荽"] }), // 香菜的别名
        dish({ name_zh: "酸汤肥牛", cuisine_id: "hunan" }),
      ],
      [dish({ name_zh: "冬阴功汤", cuisine_id: "thai", key_ingredients: ["cilantro"] })],
    ]);
    setModelClientForTests(client);
    const events = await collect();
    const names = events.flatMap((e) => (e.type === "dish" ? [e.dish.nameZh] : []));
    expect(names).toEqual(["酸汤肥牛"]);
    expect(calls).toHaveLength(2);
    // 补的那次把已出现和被去掉的菜都列为“不要推荐”
    const retryText = calls[1].user.map((c) => (c.type === "text" ? c.text : "")).join("");
    expect(retryText).toContain("凉拌黄瓜");
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "done", note: "考虑到你的忌口，这次只找到 1 道合适的。" });
    expect((await quotaStatus(db, user)).remaining.recommend).toBe(2);
  });

  it("refunds the quota when the model fails before any dish", async () => {
    const { client } = scripted([new ModelError("boom", "error")]);
    setModelClientForTests(client);
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "error", code: "model", refunded: true });
    expect((await quotaStatus(db, user)).remaining.recommend).toBe(3);
    const [call] = await db.select().from(modelCalls);
    expect(call.status).toBe("error");
  });

  it("refuses and refunds when the site budget is exhausted", async () => {
    await db.insert(dailySpend).values({ day: utcDay(new Date()), actualUsd: budget.hardCapUsd });
    const { client, calls } = scripted([]);
    setModelClientForTests(client);
    const events = await collect();
    expect(events.at(-1)).toMatchObject({ type: "error", code: "budget_paused", refunded: true });
    expect(calls).toHaveLength(0);
    expect((await quotaStatus(db, user)).remaining.recommend).toBe(3);
  });

  it("stops at the daily quota", async () => {
    const { client } = scripted([
      [dish({}), dish({ name_zh: "a", cuisine_id: "hunan" }), dish({ name_zh: "b", cuisine_id: "thai" })],
      [dish({ name_zh: "c" }), dish({ name_zh: "d", cuisine_id: "hunan" }), dish({ name_zh: "e", cuisine_id: "thai" })],
      [dish({ name_zh: "f" }), dish({ name_zh: "g", cuisine_id: "hunan" }), dish({ name_zh: "h", cuisine_id: "thai" })],
    ]);
    setModelClientForTests(client);
    await collect();
    await collect({ ...input, exclude: ["x"] });
    await collect({ ...input, exclude: ["y"] });
    const events = await collect({ ...input, exclude: ["z"] });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "error", code: "quota" });
  });
});

async function runRecommendWithoutHistory() {
  const { privacySettings } = await import("../db/schema");
  await db.insert(privacySettings).values({ userId: user.id, recordHistory: false });
  return collect();
}

describe("cooking habits", () => {
  it("passes habits to the model and keys the cache on them", async () => {
    await db.insert(preferences).values({ userId: user.id, skill: "beginner", timeBudget: 30 });
    // 关掉历史记录，两次请求除了习惯完全相同
    await db.insert(privacySettingsTable).values({ userId: user.id, recordHistory: false });
    const three = () => [dish({}), dish({ name_zh: "酸汤肥牛", cuisine_id: "hunan" }), dish({ name_zh: "冬阴功汤", cuisine_id: "thai" })];
    const { client, calls } = scripted([three(), three()]);
    setModelClientForTests(client);
    await collect();
    const text = calls[0].user.map((c) => (c.type === "text" ? c.text : "")).join("");
    expect(text).toContain("做饭经验：刚开始学做饭");
    expect(text).toContain("不超过 30 分钟");
    // 改了习惯，同样的输入不再命中缓存
    await db.update(preferences).set({ skill: "seasoned" }).where(eq(preferences.userId, user.id));
    const second = await collect();
    expect(second[0]).toMatchObject({ type: "start", cached: false });
    expect(calls).toHaveLength(2);
  });
});

describe("checkDish", () => {
  const ctx = { candidates: ["sichuan", "thai"], scene: null, keywords: [], seen: new Set<string>() };
  it("rejects cuisines outside the candidates and duplicates", () => {
    expect(checkDish(dish({ cuisine_id: "french" }), ctx)).toBe("cuisine");
    expect(checkDish(dish({}), { ...ctx, seen: new Set(["酸辣土豆丝"]) })).toBe("duplicate");
  });
  it("enforces scene time and no-shopping constraints", () => {
    expect(checkDish(dish({ total_minutes: 25 }), { ...ctx, scene: "quick" })).toBe("scene");
    expect(checkDish(dish({ total_minutes: 20 }), { ...ctx, scene: "quick" })).toBeNull();
    expect(checkDish(dish({ to_buy: [{ name: "泡椒", required: true }] }), { ...ctx, scene: "clear-fridge" })).toBe("scene");
    expect(checkDish(dish({ to_buy: [{ name: "香菜", required: false }] }), { ...ctx, scene: "clear-fridge" })).toBeNull();
  });
});

describe("pickCuisines", () => {
  it("uses only the chosen cuisine when one is specified", () => {
    expect(pickCuisines({ main: [], flavors: ["sour-spicy"], cuisines: ["thai"] })).toEqual(["thai"]);
  });
  it("uses exactly the chosen cuisines when several are specified", () => {
    expect(pickCuisines({ main: [], flavors: ["sour-spicy"], cuisines: ["thai", "sichuan", "nope"] })).toEqual([
      "thai",
      "sichuan",
    ]);
  });
  it("ranks cuisines by flavor matches and keeps at least two", () => {
    const sourSpicy = pickCuisines({ main: [], flavors: ["sour-spicy"], cuisines: [] });
    expect(sourSpicy[0]).toBe("hunan");
    expect(sourSpicy.length).toBeLessThanOrEqual(6);
    const numbing = pickCuisines({ main: [], flavors: ["numbing-spicy"], cuisines: [] });
    expect(numbing[0]).toBe("sichuan");
    expect(numbing.length).toBeGreaterThanOrEqual(2);
  });
  it("picks six cuisines when nothing is chosen", () => {
    expect(pickCuisines({ main: [], flavors: [], cuisines: [], random: () => 0.5 })).toHaveLength(6);
  });
});

describe("clipName", () => {
  it("drops parenthetical notes and caps length for display", () => {
    expect(clipName("勃艮第红酒（或其他干红葡萄酒，约 750ml）")).toBe("勃艮第红酒");
    expect(clipName("a".repeat(40)).length).toBe(24);
  });
});
