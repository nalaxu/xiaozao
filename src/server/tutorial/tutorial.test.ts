import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budget } from "@config/limits";
import type { RecommendedDish } from "@/lib/recommend-types";
import type { TutorialContent, TutorialEvent } from "@/lib/tutorial-types";
import { setModelClientForTests } from "../ai/call";
import { ModelError, type ModelClient, type ModelRequest } from "../ai/types";
import type { Db } from "../db/client";
import { dailySpend, dishes, followups, preferences, recommendationRuns, tutorials, users } from "../db/schema";
import { testDb } from "../test-utils";
import { quotaStatus, utcDay } from "../usage";
import { askFollowup } from "./followup";
import { existingTutorial, findRunDish, runTutorial } from "./run";

const content = (over: Partial<TutorialContent> = {}): TutorialContent => ({
  overview: {
    name_zh: "番茄炒蛋",
    name_en: "Tomato and egg stir-fry",
    name_original: null,
    cuisine_id: "northern-home",
    flavor_desc: "酸甜",
    total_minutes: 15,
    active_minutes: 10,
    difficulty: 1,
    servings: 2,
  },
  ingredients: [
    { group: "main", name_zh: "番茄", name_en: "tomato", amount: 300, unit: "g", prep: "切块", optional: false },
    { group: "main", name_zh: "鸡蛋", name_en: "eggs", amount: 3, unit: "piece", prep: null, optional: false },
  ],
  substitutions: [],
  equipment: ["炒锅"],
  steps: [{ action: "炒蛋", heat: "medium_high", oven_c: null, timer_seconds: null, cue: "蛋液刚凝固", warning: null }],
  key_points: ["蛋别炒老"],
  background: "北方家常菜",
  safety_notes: [],
  ...over,
});

function scripted(responses: (unknown | Error)[]) {
  const calls: ModelRequest[] = [];
  const client: ModelClient = {
    async run(req, onDelta) {
      calls.push(req);
      const next = responses.shift();
      if (next === undefined) throw new Error("no more responses");
      if (next instanceof Error) throw next;
      const text = JSON.stringify(next);
      for (let i = 0; i < text.length; i += 40) onDelta?.(text.slice(i, i + 40));
      return { text, usage: { inputTokens: 2000, cachedTokens: 0, outputTokens: 1500 } };
    },
  };
  return { client, calls };
}

let db: Db;
let user: { id: string; role: "user" | "admin" };
let runId: string;
let dish: RecommendedDish;

async function generate() {
  const events: TutorialEvent[] = [];
  await runTutorial(db, user, { runId, dish, scene: null }, (e) => events.push(e));
  return events;
}

beforeEach(async () => {
  db = await testDb();
  const [u] = await db.insert(users).values({ email: "cook@example.test" }).returning();
  user = { id: u.id, role: "user" };
  const [d] = await db
    .insert(dishes)
    .values({ cuisineId: "northern-home", nameZh: "番茄炒蛋", nameZhNorm: "番茄炒蛋", nameEn: "Tomato egg" })
    .returning();
  dish = {
    dishId: d.id,
    nameZh: "番茄炒蛋",
    nameEn: "Tomato egg",
    nameOriginal: null,
    cuisineId: "northern-home",
    flavorTags: ["sweet"],
    summary: "酸甜下饭",
    totalMinutes: 15,
    difficulty: 1,
    uses: ["番茄", "鸡蛋"],
    toBuy: [],
    imageUrl: null,
  };
  const [r] = await db
    .insert(recommendationRuns)
    .values({ userId: u.id, input: { scene: null }, cacheKey: "k", dishIds: [d.id], dishes: [dish] })
    .returning();
  runId = r.id;
});

afterEach(() => setModelClientForTests(undefined));

describe("runTutorial", () => {
  it("streams, saves the content and uses one tutorial quota", async () => {
    const { client, calls } = scripted([content()]);
    setModelClientForTests(client);
    const events = await generate();
    expect(events[0].type).toBe("start");
    expect(events.filter((e) => e.type === "delta").length).toBeGreaterThan(3);
    expect(events.at(-1)?.type).toBe("done");
    const [t] = await db.select().from(tutorials);
    expect(t.status).toBe("done");
    expect((t.content as TutorialContent).ingredients).toHaveLength(2);
    expect(calls[0].model).toBe("gpt-6.1-sol");
    expect((await quotaStatus(db, user)).remaining.tutorial).toBe(2);
    // 同一推荐里的同一道菜再打开，直接复用
    expect(await existingTutorial(db, user.id, runId, dish.dishId)).toBe(t.id);
  });

  it("regenerates once when an ingredient hits the avoid list, then fails and refunds", async () => {
    await db.insert(preferences).values({ userId: user.id, avoid: ["鸡蛋"] });
    const { client, calls } = scripted([content(), content()]);
    setModelClientForTests(client);
    const events = await generate();
    expect(events.map((e) => e.type)).toContain("reset");
    expect(events.at(-1)).toMatchObject({ type: "error", code: "restricted", refunded: true });
    expect(calls).toHaveLength(2);
    expect(JSON.stringify(calls[1].user)).toContain("鸡蛋");
    expect((await quotaStatus(db, user)).remaining.tutorial).toBe(3);
    const [t] = await db.select().from(tutorials);
    expect(t.status).toBe("failed");
  });

  it("accepts the regenerated version when it avoids the ingredient", async () => {
    await db.insert(preferences).values({ userId: user.id, avoid: ["eggs"] });
    const safe = content({
      ingredients: [{ group: "main", name_zh: "番茄", name_en: "tomato", amount: 300, unit: "g", prep: null, optional: false }],
    });
    const { client } = scripted([content(), safe]);
    setModelClientForTests(client);
    const events = await generate();
    expect(events.at(-1)?.type).toBe("done");
  });

  it("refunds when the model fails or the output is invalid", async () => {
    const { client } = scripted([new ModelError("timeout", "timeout")]);
    setModelClientForTests(client);
    expect((await generate()).at(-1)).toMatchObject({ type: "error", code: "model", refunded: true });

    const bad = scripted([{ overview: {} }]);
    setModelClientForTests(bad.client);
    expect((await generate()).at(-1)).toMatchObject({ type: "error", code: "model" });
    expect((await quotaStatus(db, user)).remaining.tutorial).toBe(3);
  });

  it("switches to the fallback model past the downgrade threshold", async () => {
    await db.insert(dailySpend).values({ day: utcDay(new Date()), actualUsd: budget.downgradeTutorialUsd });
    const { client, calls } = scripted([content()]);
    setModelClientForTests(client);
    await generate();
    expect(calls[0].model).toBe("gpt-6.1-terra");
  });

  it("only finds dishes from the user's own runs", async () => {
    const [other] = await db.insert(users).values({ email: "other@example.test" }).returning();
    expect(await findRunDish(db, other.id, runId, dish.dishId)).toBeNull();
    expect(await findRunDish(db, user.id, runId, dish.dishId)).not.toBeNull();
  });
});

describe("askFollowup", () => {
  it("answers up to 5 questions per tutorial and refunds failures", async () => {
    const { client } = scripted([content()]);
    setModelClientForTests(client);
    await generate();
    const [t] = await db.select().from(tutorials);

    const answers = Array.from({ length: 6 }, (_, i) => ({ answer: `回答 ${i}`, on_topic: true }));
    const ask = scripted([new ModelError("boom", "error"), ...answers]);
    setModelClientForTests(ask.client);

    expect(await askFollowup(db, user.id, t.id, "失败的问题")).toMatchObject({ ok: false, code: "model" });
    for (let i = 0; i < 5; i++) {
      expect(await askFollowup(db, user.id, t.id, `问题 ${i}`)).toMatchObject({ ok: true, remaining: 4 - i });
    }
    expect(await askFollowup(db, user.id, t.id, "第六个")).toMatchObject({ ok: false, code: "quota" });
    expect(await db.select().from(followups).where(eq(followups.tutorialId, t.id))).toHaveLength(5);
    // 最近 3 轮作为上下文
    expect(JSON.stringify(ask.calls.at(-1)!.user)).toContain("问题 3");
    expect(JSON.stringify(ask.calls.at(-1)!.user)).not.toContain("问题 0");
  });

  it("refuses other users' tutorials", async () => {
    const { client } = scripted([content()]);
    setModelClientForTests(client);
    await generate();
    const [t] = await db.select().from(tutorials);
    const [other] = await db.insert(users).values({ email: "x@example.test" }).returning();
    expect(await askFollowup(db, other.id, t.id, "hi")).toMatchObject({ ok: false, status: 404 });
  });
});
