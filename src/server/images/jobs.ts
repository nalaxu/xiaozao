// 图片任务的处理（技术方案 8.2）：推荐后用 after() 立即处理，每分钟的巡检接手遗漏或失败的任务。
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import { budget } from "@config/limits";
import { imageCostUsd } from "@config/models";
import type { Db } from "../db/client";
import { dishes, jobs } from "../db/schema";
import { nextReset, recordCall, reserveBudget, spentToday } from "../usage";
import { ZERO_USAGE } from "../ai/types";
import { getImageGenerator, imagePrompt, toWebpSizes } from "./generate";
import { getStorage } from "./storage";

export const MAX_IMAGE_ATTEMPTS = 3; // 首次 + 重试 2 次
const LEASE_MS = 5 * 60_000;

export interface ProcessResult {
  done: number;
  failed: number;
  postponed: number;
}

export async function processImageJobs(
  db: Db,
  opts: { limit?: number; dishIds?: string[]; now?: Date } = {},
): Promise<ProcessResult> {
  const now = opts.now ?? new Date();
  const result: ProcessResult = { done: 0, failed: 0, postponed: 0 };

  // 当日花费达到 $80 后不生成新图，任务顺延到次日（PRD 6.3）
  if ((await spentToday(db, now)) >= budget.stopImagesUsd) {
    const moved = await db
      .update(jobs)
      .set({ runAfter: nextReset(now) })
      .where(and(eq(jobs.type, "image"), eq(jobs.status, "pending"), lte(jobs.runAfter, now)))
      .returning({ id: jobs.id });
    result.postponed = moved.length;
    return result;
  }

  const filters = [eq(jobs.type, "image"), eq(jobs.status, "pending"), lte(jobs.runAfter, now)];
  if (opts.dishIds?.length) filters.push(inArray(sql`${jobs.payload}->>'dishId'`, opts.dishIds));
  const pending = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(and(...filters))
    .orderBy(jobs.runAfter)
    .limit(opts.limit ?? 4);

  await Promise.all(
    pending.map(async ({ id }) => {
      // 抢占任务：同一任务只会被一个进程处理；runAfter 作为租约，超时由巡检收回
      const [job] = await db
        .update(jobs)
        .set({ status: "running", attempts: sql`${jobs.attempts} + 1`, runAfter: new Date(now.getTime() + LEASE_MS) })
        .where(and(eq(jobs.id, id), eq(jobs.status, "pending")))
        .returning();
      if (!job) return;
      const outcome = await generateForDish(db, job.id, (job.payload as { dishId: string }).dishId, now);
      result[outcome]++;
    }),
  );
  return result;
}

async function generateForDish(
  db: Db,
  jobId: string,
  dishId: string,
  now: Date,
): Promise<keyof ProcessResult> {
  // 同一道菜同时只有一个任务在生成
  const [dish] = await db
    .update(dishes)
    .set({ imageStatus: "generating" })
    .where(and(eq(dishes.id, dishId), inArray(dishes.imageStatus, ["none", "queued", "failed"])))
    .returning();
  if (!dish) {
    await db.update(jobs).set({ status: "done" }).where(eq(jobs.id, jobId));
    return "done";
  }

  const reserved = await reserveBudget(db, "image", now);
  if (reserved === null) {
    await db.update(dishes).set({ imageStatus: "queued" }).where(eq(dishes.id, dishId));
    await db.update(jobs).set({ status: "pending", runAfter: nextReset(now) }).where(eq(jobs.id, jobId));
    return "postponed";
  }

  const started = Date.now();
  let model = "image";
  try {
    const img = await getImageGenerator()(imagePrompt(dish), { nameZh: dish.nameZh });
    model = img.model;
    const sizes = await toWebpSizes(img.png);
    const key = `dishes/${dish.id}`;
    const storage = getStorage();
    await Promise.all([
      storage.put(`${key}/768.webp`, sizes[768], "image/webp"),
      storage.put(`${key}/384.webp`, sizes[384], "image/webp"),
    ]);
    await db
      .update(dishes)
      .set({ imageStatus: "ready", imageKey: key, imageAttempts: dish.imageAttempts + 1 })
      .where(eq(dishes.id, dish.id));
    await db.update(jobs).set({ status: "done", lastError: null }).where(eq(jobs.id, jobId));
    await recordCall(
      db,
      {
        userId: null,
        feature: "image",
        model,
        usage: { inputTokens: img.usage?.inputTokens ?? 0, cachedTokens: 0, outputTokens: img.usage?.outputTokens ?? 0 },
        latencyMs: Date.now() - started,
        status: "ok",
        reserved,
        costUsd: model === "fake-image" ? 0 : imageCostUsd(img.usage),
        imageCount: 1,
      },
      now,
    );
    return "done";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const attempts = dish.imageAttempts + 1;
    const giveUp = attempts >= MAX_IMAGE_ATTEMPTS;
    // 失败最多重试 2 次，之后标记 failed，前端保持占位图（PRD 4.3）
    await db
      .update(dishes)
      .set({ imageStatus: giveUp ? "failed" : "queued", imageAttempts: attempts })
      .where(eq(dishes.id, dish.id));
    await db
      .update(jobs)
      .set({
        status: giveUp ? "failed" : "pending",
        lastError: message.slice(0, 1000),
        runAfter: new Date(now.getTime() + attempts * 2 * 60_000),
      })
      .where(eq(jobs.id, jobId));
    await recordCall(
      db,
      {
        userId: null,
        feature: "image",
        model,
        usage: ZERO_USAGE,
        latencyMs: Date.now() - started,
        status: "error",
        error: message,
        reserved,
        costUsd: 0,
      },
      now,
    );
    return "failed";
  }
}

/** 巡检：收回租约到期仍在 running 的任务（进程被中断） */
export async function reclaimStaleJobs(db: Db, now = new Date()): Promise<number> {
  const stale = await db
    .update(jobs)
    .set({ status: "pending", runAfter: now })
    .where(and(eq(jobs.status, "running"), lte(jobs.runAfter, now)))
    .returning({ payload: jobs.payload });
  const ids = stale.map((s) => (s.payload as { dishId?: string }).dishId).filter((x): x is string => Boolean(x));
  if (ids.length) {
    await db
      .update(dishes)
      .set({ imageStatus: "queued" })
      .where(and(inArray(dishes.id, ids), eq(dishes.imageStatus, "generating")));
  }
  return stale.length;
}
