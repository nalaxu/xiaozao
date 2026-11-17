// 个人额度（技术方案 9.1）与全站预算预占、记账（9.2、7.1）。
import { and, eq, sql } from "drizzle-orm";
import { budget, quota } from "@config/limits";
import { estimateUsd, textCostUsd, type Feature } from "@config/models";
import type { Db } from "./db/client";
import { dailySpend, modelCalls, usageDaily } from "./db/schema";
import type { Usage } from "./ai/types";

export type QuotaKind = "recommend" | "tutorial" | "recognize";

export const QUOTA_LIMITS: Record<QuotaKind, number> = {
  recommend: quota.recommendPerDay,
  tutorial: quota.tutorialPerDay,
  recognize: quota.recognizePerDay,
};

/** UTC 日期，YYYY-MM-DD */
export const utcDay = (now: Date) => now.toISOString().slice(0, 10);

/** 下一个 UTC 零点，即额度恢复时间 */
export const nextReset = (now: Date) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));

interface QuotaUser {
  id: string;
  role: "user" | "admin";
}

const column = { recommend: usageDaily.recommend, tutorial: usageDaily.tutorial, recognize: usageDaily.recognize };

async function ensureRow(db: Db, userId: string, day: string) {
  await db.insert(usageDaily).values({ userId, day }).onConflictDoNothing();
}

/** 预占一次额度；管理员不受限制但照常计数 */
export async function reserveQuota(
  db: Db,
  user: QuotaUser,
  kind: QuotaKind,
  now = new Date(),
): Promise<{ ok: boolean; remaining: number }> {
  const day = utcDay(now);
  const limit = QUOTA_LIMITS[kind];
  const col = column[kind];
  await ensureRow(db, user.id, day);
  const where = and(eq(usageDaily.userId, user.id), eq(usageDaily.day, day));
  const [row] = await db
    .update(usageDaily)
    .set({ [kind]: sql`${col} + 1` })
    .where(user.role === "admin" ? where : and(where, sql`${col} < ${limit}`))
    .returning({ used: col });
  if (!row) return { ok: false, remaining: 0 };
  return { ok: true, remaining: Math.max(0, limit - row.used) };
}

/** 调用失败时退还（技术方案 9.1） */
export async function refundQuota(db: Db, userId: string, kind: QuotaKind, now = new Date()) {
  const col = column[kind];
  await db
    .update(usageDaily)
    .set({ [kind]: sql`greatest(${col} - 1, 0)` })
    .where(and(eq(usageDaily.userId, userId), eq(usageDaily.day, utcDay(now))));
}

export interface QuotaStatus {
  remaining: Record<QuotaKind, number>;
  limits: Record<QuotaKind, number>;
  unlimited: boolean;
  resetAt: string;
}

export async function quotaStatus(db: Db, user: QuotaUser, now = new Date()): Promise<QuotaStatus> {
  const [row] = await db
    .select()
    .from(usageDaily)
    .where(and(eq(usageDaily.userId, user.id), eq(usageDaily.day, utcDay(now))));
  const left = (k: QuotaKind) => Math.max(0, QUOTA_LIMITS[k] - (row?.[k] ?? 0));
  return {
    remaining: { recommend: left("recommend"), tutorial: left("tutorial"), recognize: left("recognize") },
    limits: QUOTA_LIMITS,
    unlimited: user.role === "admin",
    resetAt: nextReset(now).toISOString(),
  };
}

// ─── 全站预算 ───────────────────────────────────────────────

/**
 * 按预估成本预占当日预算。已达上限（$100）时返回 null，调用方应返回 budget_paused。
 * 告警（$50）与降级档位在 M6 接入。
 */
export async function reserveBudget(db: Db, feature: Feature, now = new Date()): Promise<number | null> {
  const amount = estimateUsd[feature];
  const day = utcDay(now);
  const rows = await db
    .insert(dailySpend)
    .values({ day, reservedUsd: amount })
    .onConflictDoUpdate({
      target: dailySpend.day,
      set: { reservedUsd: sql`${dailySpend.reservedUsd} + ${amount}` },
      setWhere: sql`${dailySpend.reservedUsd} + ${dailySpend.actualUsd} < ${budget.hardCapUsd}`,
    })
    .returning({ day: dailySpend.day });
  return rows.length ? amount : null;
}

export async function spentToday(db: Db, now = new Date()): Promise<number> {
  const [row] = await db.select().from(dailySpend).where(eq(dailySpend.day, utcDay(now)));
  return row ? row.reservedUsd + row.actualUsd : 0;
}

export interface CallRecord {
  userId: string | null;
  feature: Feature;
  model: string;
  usage: Usage;
  latencyMs: number;
  status: "ok" | "error" | "timeout" | "rejected";
  error?: string;
  /** reserveBudget 预占的金额，记账时释放 */
  reserved: number;
  /** 非文字模型（图片）直接给出成本 */
  costUsd?: number;
  imageCount?: number;
}

/** 每次模型调用结束（成功或失败）写一行 model_calls，并用实际成本替换预占（技术方案 7.1、9.2） */
export async function recordCall(db: Db, rec: CallRecord, now = new Date()): Promise<number> {
  let cost = rec.costUsd ?? 0;
  if (rec.costUsd === undefined) {
    try {
      cost = textCostUsd(rec.model, rec.usage);
    } catch {
      cost = 0; // 未配置单价的模型：成本记 0，并在 error 中注明
      rec.error = [rec.error, `未配置单价: ${rec.model}`].filter(Boolean).join("; ");
    }
  }
  const day = utcDay(now);
  await db.insert(modelCalls).values({
    userId: rec.userId,
    feature: rec.feature,
    model: rec.model,
    inputTokens: rec.usage.inputTokens,
    cachedTokens: rec.usage.cachedTokens,
    outputTokens: rec.usage.outputTokens,
    imageCount: rec.imageCount ?? 0,
    costUsd: cost,
    latencyMs: rec.latencyMs,
    status: rec.status,
    error: rec.error?.slice(0, 1000),
  });
  await db
    .insert(dailySpend)
    .values({ day, actualUsd: cost })
    .onConflictDoUpdate({
      target: dailySpend.day,
      set: {
        reservedUsd: sql`greatest(${dailySpend.reservedUsd} - ${rec.reserved}, 0)`,
        actualUsd: sql`${dailySpend.actualUsd} + ${cost}`,
      },
    });
  if (rec.userId) {
    await db
      .insert(usageDaily)
      .values({ userId: rec.userId, day, spendUsd: cost })
      .onConflictDoUpdate({
        target: [usageDaily.userId, usageDaily.day],
        set: { spendUsd: sql`${usageDaily.spendUsd} + ${cost}` },
      });
  }
  return cost;
}
