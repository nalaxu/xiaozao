// 固定窗口限流，计数存在 rate_limits 表（技术方案 9.3）。
import { sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { rateLimits } from "./db/schema";

export interface RateResult {
  ok: boolean;
  /** 被限流时，距窗口结束的秒数 */
  retryAfter: number;
}

export async function hit(
  db: Db,
  rule: { bucket: string; key: string; windowSeconds: number; limit: number },
  now = new Date(),
): Promise<RateResult> {
  const windowMs = rule.windowSeconds * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / windowMs) * windowMs);
  const [row] = await db
    .insert(rateLimits)
    .values({ bucket: rule.bucket, key: rule.key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimits.bucket, rateLimits.key, rateLimits.windowStart],
      set: { count: sql`${rateLimits.count} + 1` },
    })
    .returning({ count: rateLimits.count });
  const ok = row.count <= rule.limit;
  return {
    ok,
    retryAfter: ok ? 0 : Math.ceil((windowStart.getTime() + windowMs - now.getTime()) / 1000),
  };
}

/** 依次检查多条规则，返回第一条不通过的结果 */
export async function hitAll(
  db: Db,
  rules: { bucket: string; key: string; windowSeconds: number; limit: number }[],
  now = new Date(),
): Promise<RateResult> {
  let worst: RateResult = { ok: true, retryAfter: 0 };
  for (const rule of rules) {
    const r = await hit(db, rule, now);
    if (!r.ok && r.retryAfter > worst.retryAfter) worst = r;
  }
  return worst;
}

export const HOUR = 3600;
export const DAY = 86400;
