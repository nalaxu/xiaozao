import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { dailySpend, dishAliases, dishes, events, jobs, modelCalls, sessions, tutorials, usageDaily, users } from "./db/schema";
import {
  imageStats,
  listAccounts,
  mergeDishes,
  regenerateImage,
  setAccountStatus,
  spendOverview,
  weekStart,
  weeklyMetrics,
} from "./admin-stats";
import { logEvent, touchVisit } from "./events";
import { at, testDb } from "./test-utils";

let db: Db;
let adminId: string;
let userId: string;
const now = at("2026-11-18T10:00:00Z"); // 周三

beforeEach(async () => {
  db = await testDb();
  [{ id: adminId }] = await db.insert(users).values({ email: "admin@example.test", role: "admin" }).returning();
  [{ id: userId }] = await db.insert(users).values({ email: "cook@example.test" }).returning();
});

describe("spend overview", () => {
  it("summarises today by feature, a 30-day trend and top accounts", async () => {
    await db.insert(dailySpend).values([
      { day: "2026-11-18", actualUsd: 12.5, reservedUsd: 0.5, alertsSent: [] },
      { day: "2026-11-10", actualUsd: 3 },
    ]);
    await db.insert(modelCalls).values([
      { userId, feature: "tutorial", model: "m", status: "ok", costUsd: 0.02, latencyMs: 2000, createdAt: now },
      { userId, feature: "tutorial", model: "m", status: "error", costUsd: 0, latencyMs: 4000, createdAt: now },
      { userId, feature: "image", model: "i", status: "ok", costUsd: 0.04, imageCount: 1, createdAt: now },
    ]);
    await db.insert(usageDaily).values({ userId, day: "2026-11-18", tutorial: 2, spendUsd: 0.06 });
    const s = await spendOverview(db, now);
    expect(s.spent).toBeCloseTo(13);
    expect(s.tier).toBe("normal");
    expect(s.byFeature.find((f) => f.feature === "tutorial")).toMatchObject({ calls: 2, errors: 1, latency: 3000 });
    expect(s.trend).toHaveLength(30);
    expect(s.trend.at(-1)).toEqual({ day: "2026-11-18", usd: 12.5 });
    expect(s.trend.find((t) => t.day === "2026-11-10")?.usd).toBe(3);
    expect(s.topAccounts[0]).toMatchObject({ email: "cook@example.test", tutorial: 2 });
  });
});

describe("accounts", () => {
  it("searches by email and shows usage", async () => {
    await db.insert(usageDaily).values({ userId, day: "2026-11-18", recommend: 3, spendUsd: 0.2 });
    await touchVisit(db, userId, now);
    const rows = await listAccounts(db, "COOK", now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "cook@example.test", today: { recommend: 3 }, spend30: 0.2 });
    expect(rows[0].lastVisit).not.toBeNull();
    expect(await listAccounts(db, "%", now)).toHaveLength(0);
  });

  it("disabling signs the account out and cannot target yourself", async () => {
    await db.insert(sessions).values({ userId, tokenHash: "h", expiresAt: new Date(now.getTime() + 86400_000) });
    expect(await setAccountStatus(db, adminId, adminId, "disabled")).toBe(false);
    expect(await setAccountStatus(db, adminId, userId, "disabled")).toBe(true);
    expect(await db.select().from(sessions)).toHaveLength(0);
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    expect(u.status).toBe("disabled");
    await setAccountStatus(db, adminId, userId, "active");
    expect((await db.select().from(users).where(eq(users.id, userId)))[0].status).toBe("active");
  });
});

describe("image library", () => {
  async function dish(name: string, over: Partial<typeof dishes.$inferInsert> = {}) {
    const [d] = await db
      .insert(dishes)
      .values({ cuisineId: "northern-home", nameZh: name, nameZhNorm: name, nameEn: name, ...over })
      .returning();
    return d;
  }

  it("reports hit rate from recommend events and requeues failed images", async () => {
    await logEvent(db, userId, "recommend_run", { runId: "r1", dishes: 5, withImage: 2 }, now);
    await logEvent(db, userId, "recommend_run", { runId: "r2", dishes: 5, withImage: 3 }, now);
    const failed = await dish("坏图", { imageStatus: "failed", imageAttempts: 3 });
    await dish("好图", { imageStatus: "ready", imageKey: "dishes/x" });
    const s = await imageStats(db, now);
    expect(s.hit7).toEqual({ total: 10, withImage: 5, rate: 0.5 });
    expect(s.byStatus).toMatchObject({ failed: 1, ready: 1 });
    expect(s.failed.map((f) => f.nameZh)).toEqual(["坏图"]);
    expect(await regenerateImage(db, failed.id, now)).toBe(true);
    const [d] = await db.select().from(dishes).where(eq(dishes.id, failed.id));
    expect(d).toMatchObject({ imageStatus: "queued", imageAttempts: 0 });
    expect(await db.select().from(jobs)).toHaveLength(1);
  });

  it("merges duplicates into the one with an image and keeps tutorials", async () => {
    const plain = await dish("番茄炒蛋", { timesRecommended: 2 });
    const pictured = await dish("西红柿炒鸡蛋", { imageStatus: "ready", imageKey: "dishes/y", timesRecommended: 5 });
    const other = await dish("冬阴功", { cuisineId: "thai" });
    const [t] = await db.insert(tutorials).values({ userId, dishId: plain.id, params: {}, model: "m" }).returning();
    expect(await mergeDishes(db, plain.id, other.id)).toMatchObject({ ok: false });
    // 选反了也会保留有图的那条
    expect(await mergeDishes(db, pictured.id, plain.id)).toEqual({ ok: true, kept: "西红柿炒鸡蛋", dropped: "番茄炒蛋" });
    expect(await db.select().from(dishes).where(eq(dishes.id, plain.id))).toHaveLength(0);
    const [alias] = await db.select().from(dishAliases);
    expect(alias).toMatchObject({ aliasNorm: "番茄炒蛋", dishId: pictured.id });
    expect((await db.select().from(tutorials).where(eq(tutorials.id, t.id)))[0].dishId).toBe(pictured.id);
    expect((await db.select().from(dishes).where(eq(dishes.id, pictured.id)))[0].timesRecommended).toBe(7);
  });
});

describe("weekly metrics", () => {
  it("computes funnel ratios per UTC week", async () => {
    expect(weekStart(now).toISOString()).toBe("2026-11-16T00:00:00.000Z");
    const lastWeek = at("2026-11-10T10:00:00Z");
    // 上周：两个账号来过，其中一个本周又来了
    await touchVisit(db, userId, lastWeek);
    await touchVisit(db, adminId, lastWeek);
    await touchVisit(db, userId, now);
    // 本周：2 次推荐，1 次打开了教程，进了烹饪模式并做完，好评
    await logEvent(db, userId, "recommend_run", { runId: "a", dishes: 4, withImage: 1 }, now);
    await logEvent(db, userId, "recommend_run", { runId: "b", dishes: 4, withImage: 3 }, now);
    await logEvent(db, userId, "tutorial_open", { runId: "a", tutorialId: "t1" }, now);
    await logEvent(db, userId, "cook_start", { tutorialId: "t1" }, now);
    await logEvent(db, userId, "cook_start", { tutorialId: "t1" }, now);
    await logEvent(db, userId, "cook_complete", { tutorialId: "t1" }, now);
    await logEvent(db, userId, "rating", { verdict: "good" }, now);
    await logEvent(db, userId, "recognize_edit", { recognized: 4, removed: 1 }, now);
    await logEvent(db, null, "signup_pending", { pendingId: "p1" }, now);
    await logEvent(db, null, "signup_pending", { pendingId: "p2" }, now);
    await logEvent(db, userId, "signup_complete", { pendingId: "p1" }, now);
    await db.insert(usageDaily).values([
      { userId, day: "2026-11-17", recommend: 3 },
      { userId: adminId, day: "2026-11-17", recommend: 1 },
    ]);
    await db.insert(modelCalls).values({ userId, feature: "tutorial", model: "m", status: "ok", costUsd: 1.5, createdAt: now });

    const { weeks, monthly } = await weeklyMetrics(db, 2, now);
    const [thisWeek, prev] = weeks;
    expect(thisWeek.week).toBe("2026-11-16");
    expect(thisWeek.recommendToTutorial).toEqual({ n: 1, d: 2 });
    expect(thisWeek.tutorialToCook).toEqual({ n: 1, d: 1 });
    expect(thisWeek.cookCompletion).toEqual({ n: 1, d: 1 });
    expect(thisWeek.goodRate).toEqual({ n: 1, d: 1 });
    expect(thisWeek.recognizeEdit).toEqual({ n: 1, d: 4 });
    expect(thisWeek.imageHit).toEqual({ n: 4, d: 8 });
    expect(thisWeek.inviteToSignup).toEqual({ n: 1, d: 2 });
    expect(thisWeek.quotaExhausted).toEqual({ n: 1, d: 2 });
    expect(thisWeek.nextWeekReturn).toBeNull();
    expect(prev.nextWeekReturn).toEqual({ n: 1, d: 2 });
    expect(monthly).toEqual({ cost: 1.5, activeUsers: 2 });
  });

  it("records at most one visit per account per UTC day", async () => {
    await touchVisit(db, userId, now);
    await touchVisit(db, userId, new Date(now.getTime() + 3600_000));
    await touchVisit(db, userId, at("2026-11-19T01:00:00Z"));
    expect(await db.select().from(events).where(eq(events.name, "visit"))).toHaveLength(2);
  });
});
