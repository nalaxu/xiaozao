import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { budget } from "@config/limits";
import type { Db } from "./db/client";
import { dailySpend, modelCalls, usageDaily, users } from "./db/schema";
import { at, testDb } from "./test-utils";
import { quotaStatus, recordCall, refundQuota, reserveBudget, reserveQuota, spentToday, utcDay } from "./usage";

let db: Db;
let userId: string;
const now = at("2026-11-17T10:00:00Z");

beforeEach(async () => {
  db = await testDb();
  const [u] = await db.insert(users).values({ email: "a@example.test" }).returning();
  userId = u.id;
});

describe("personal quota", () => {
  it("allows 3 recommendations per UTC day and refunds on failure", async () => {
    const user = { id: userId, role: "user" as const };
    expect(await reserveQuota(db, user, "recommend", now)).toEqual({ ok: true, remaining: 2 });
    expect(await reserveQuota(db, user, "recommend", now)).toEqual({ ok: true, remaining: 1 });
    expect(await reserveQuota(db, user, "recommend", now)).toEqual({ ok: true, remaining: 0 });
    expect((await reserveQuota(db, user, "recommend", now)).ok).toBe(false);

    await refundQuota(db, userId, "recommend", now);
    expect((await quotaStatus(db, user, now)).remaining.recommend).toBe(1);

    // 其他种类的额度独立计算；第二天重新计数
    expect((await reserveQuota(db, user, "recognize", now)).ok).toBe(true);
    expect((await reserveQuota(db, user, "recommend", at("2026-11-18T00:00:01Z"))).remaining).toBe(2);
  });

  it("does not limit admins but still counts", async () => {
    const admin = { id: userId, role: "admin" as const };
    for (let i = 0; i < 5; i++) expect((await reserveQuota(db, admin, "recommend", now)).ok).toBe(true);
    const [row] = await db.select().from(usageDaily).where(eq(usageDaily.userId, userId));
    expect(row.recommend).toBe(5);
    expect((await quotaStatus(db, admin, now)).unlimited).toBe(true);
  });

  it("reports the next UTC midnight as reset time", async () => {
    const s = await quotaStatus(db, { id: userId, role: "user" }, now);
    expect(s.resetAt).toBe("2026-11-18T00:00:00.000Z");
  });
});

describe("site budget", () => {
  it("reserves, then replaces the reservation with the actual cost", async () => {
    const reserved = await reserveBudget(db, "recommend", now);
    expect(reserved).toBeGreaterThan(0);
    await recordCall(
      db,
      {
        userId,
        feature: "recommend",
        model: "gpt-6.1-terra",
        usage: { inputTokens: 3000, cachedTokens: 1000, outputTokens: 800 },
        latencyMs: 1200,
        status: "ok",
        reserved: reserved!,
      },
      now,
    );
    // (2000 × $1 + 1000 × $0.05 + 800 × $5) / 1e6
    const expected = 0.00605;
    const [spend] = await db.select().from(dailySpend).where(eq(dailySpend.day, utcDay(now)));
    expect(spend.reservedUsd).toBeCloseTo(0, 6);
    expect(spend.actualUsd).toBeCloseTo(expected, 6);
    const [usage] = await db.select().from(usageDaily).where(eq(usageDaily.userId, userId));
    expect(usage.spendUsd).toBeCloseTo(expected, 6);
    const calls = await db.select().from(modelCalls);
    expect(calls).toHaveLength(1);
    expect(calls[0].costUsd).toBeCloseTo(expected, 6);
  });

  it("refuses new calls once the daily cap is reached", async () => {
    await db.insert(dailySpend).values({ day: utcDay(now), actualUsd: budget.hardCapUsd });
    expect(await reserveBudget(db, "recommend", now)).toBeNull();
    expect(await spentToday(db, now)).toBe(budget.hardCapUsd);
  });
});
