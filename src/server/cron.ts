// 每分钟巡检（技术方案 6.2 /api/cron/tick）：处理图片任务、清理过期数据。
import { lt, or, isNotNull } from "drizzle-orm";
import type { Db } from "./db/client";
import { emailOtps, pendingSignups, rateLimits, recommendationCache, sessions } from "./db/schema";
import { processImageJobs, reclaimStaleJobs } from "./images/jobs";

export async function tick(db: Db, now = new Date()) {
  const reclaimed = await reclaimStaleJobs(db, now);
  const images = await processImageJobs(db, { limit: 4, now });

  const dayAgo = new Date(now.getTime() - 86400_000);
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(pendingSignups).where(lt(pendingSignups.expiresAt, now));
  await db.delete(emailOtps).where(or(lt(emailOtps.expiresAt, dayAgo), isNotNull(emailOtps.consumedAt)));
  await db.delete(recommendationCache).where(lt(recommendationCache.expiresAt, now));
  // 限流窗口最长 1 天，保留 2 天足够
  await db.delete(rateLimits).where(lt(rateLimits.windowStart, new Date(now.getTime() - 2 * 86400_000)));

  return { reclaimed, images };
}
