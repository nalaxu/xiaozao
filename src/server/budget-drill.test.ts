// 预算阈值演练（M6 完成标志）：从 $0 一路推到 $100，检查每一档的行为。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { budget, budgetTier } from "@config/limits";
import { processAlertJobs } from "./alerts";
import { BudgetPausedError, callModel, setModelClientForTests } from "./ai/call";
import type { ModelRequest } from "./ai/types";
import type { Db } from "./db/client";
import { dailySpend, dishes, jobs, users } from "./db/schema";
import { setImageGeneratorForTests } from "./images/generate";
import { processImageJobs } from "./images/jobs";
import { enqueueImage } from "./images/queue";
import { setStorageForTests } from "./images/storage";
import type { Mail } from "./mail";
import { testDb } from "./test-utils";
import { spentToday, utcDay } from "./usage";

let db: Db;
let userId: string;
const req: ModelRequest = {
  feature: "followup",
  model: "gpt-6.1-terra",
  system: "s",
  user: [{ type: "text", text: "q" }],
  schema: { name: "x", schema: {} },
  timeoutMs: 1000,
};

/** 把当日已花费设成 usd（模拟一天里其他调用累计的花费） */
async function setSpent(usd: number) {
  await db
    .insert(dailySpend)
    .values({ day: utcDay(new Date()), actualUsd: usd })
    .onConflictDoUpdate({ target: dailySpend.day, set: { actualUsd: usd } });
}

const budgetAlerts = async () =>
  (await db.select().from(jobs).where(eq(jobs.type, "alert")))
    .map((j) => j.payload as { kind: string; threshold?: number })
    .filter((p) => p.kind === "budget")
    .map((p) => p.threshold ?? 0)
    .sort((a, b) => a - b);

const collect = (sent: Mail[]) => async (m: Mail) => {
  sent.push(m);
};

beforeEach(async () => {
  db = await testDb();
  [{ id: userId }] = await db.insert(users).values({ email: "drill@example.test" }).returning();
  setModelClientForTests({
    run: async () => ({ text: "{}", usage: { inputTokens: 1000, cachedTokens: 0, outputTokens: 500 } }),
  });
  setStorageForTests({ put: async () => {} });
  setImageGeneratorForTests(async () => ({
    png: await sharp({ create: { width: 8, height: 8, channels: 3, background: "#fff" } }).png().toBuffer(),
    model: "gpt-image-2",
    usage: { inputTokens: 10, outputTokens: 10 },
  }));
  process.env.ADMIN_EMAILS = "boss@example.test";
});

afterEach(() => {
  setModelClientForTests(undefined);
  setStorageForTests(undefined);
  setImageGeneratorForTests(undefined);
  delete process.env.ADMIN_EMAILS;
});

describe("budget drill", () => {
  it("walks through every threshold once", async () => {
    // $0：正常
    await callModel(db, userId, req);
    expect(budgetTier(await spentToday(db))).toBe("normal");
    expect(await budgetAlerts()).toEqual([]);

    // 跨过 $50：通知一次，再调用不重复
    await setSpent(budget.notifyUsd);
    await callModel(db, userId, req);
    await callModel(db, userId, req);
    expect(await budgetAlerts()).toEqual([budget.notifyUsd]);
    expect(budgetTier(await spentToday(db))).toBe("notified");

    // 跨过 $80：通知，新图片推迟到次日
    await setSpent(budget.stopImagesUsd);
    await callModel(db, userId, req);
    expect(await budgetAlerts()).toEqual([budget.notifyUsd, budget.stopImagesUsd]);
    const [d] = await db
      .insert(dishes)
      .values({ cuisineId: "thai", nameZh: "冬阴功", nameZhNorm: "冬阴功", nameEn: "Tom yum" })
      .returning();
    await enqueueImage(db, d.id);
    expect(await processImageJobs(db)).toMatchObject({ postponed: 1, done: 0 });

    // 跨过 $95：通知，教程降级（模型选择见 tutorial.test.ts）
    await setSpent(budget.downgradeTutorialUsd);
    await callModel(db, userId, req);
    expect(budgetTier(await spentToday(db))).toBe("tutorial-downgraded");
    expect(await budgetAlerts()).toEqual([budget.notifyUsd, budget.stopImagesUsd, budget.downgradeTutorialUsd]);

    // 到 $100：越线的那次调用触发 $100 通知，之后拒绝新调用
    await setSpent(budget.hardCapUsd - 0.001);
    await callModel(db, userId, req);
    expect(budgetTier(await spentToday(db))).toBe("paused");
    await expect(callModel(db, userId, req)).rejects.toBeInstanceOf(BudgetPausedError);
    expect(await budgetAlerts()).toEqual([
      budget.notifyUsd,
      budget.stopImagesUsd,
      budget.downgradeTutorialUsd,
      budget.hardCapUsd,
    ]);

    // 告警邮件：每档一封，发给 ADMIN_EMAILS，发过不再发
    const sent: Mail[] = [];
    expect(await processAlertJobs(db, { send: collect(sent) })).toBe(4);
    expect(sent.every((m) => m.to === "boss@example.test")).toBe(true);
    const capMail = sent.find((m) => m.subject === `小灶今日花费已达 $${budget.hardCapUsd.toFixed(2)}`);
    expect(capMail?.text).toContain("已暂停新的推荐");
    expect(await processAlertJobs(db, { send: collect(sent) })).toBe(0);
  });

  it("alerts once per account above $1 a day and retries failed sends", async () => {
    // 一次高成本调用让这个账号当天超过 $1
    setModelClientForTests({
      run: async () => ({ text: "{}", usage: { inputTokens: 0, cachedTokens: 0, outputTokens: 400_000 } }),
    });
    await callModel(db, userId, req);
    await callModel(db, userId, req);
    const accountJobs = (await db.select().from(jobs)).filter((j) => (j.payload as { kind: string }).kind === "account");
    expect(accountJobs).toHaveLength(1);

    const later = new Date(Date.now() + 1000);
    const down = async () => {
      throw new Error("smtp down");
    };
    expect(await processAlertJobs(db, { now: later, send: down })).toBe(0);
    const [failed] = await db.select().from(jobs).where(eq(jobs.id, accountJobs[0].id));
    expect(failed).toMatchObject({ status: "pending", lastError: "smtp down" });

    const sent: Mail[] = [];
    const retry = new Date(later.getTime() + 6 * 60_000);
    expect(await processAlertJobs(db, { now: retry, send: collect(sent) })).toBe(1);
    expect(sent[0].text).toContain("drill@example.test");
  });
});
