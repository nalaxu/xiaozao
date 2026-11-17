// 会话：Cookie 里放随机令牌，库里只存 SHA-256（技术方案 5.4）。
import { and, eq, gt, lt } from "drizzle-orm";
import { session as sessionLimits } from "@config/limits";
import type { Db } from "../db/client";
import { sessions, users } from "../db/schema";
import { randomToken, sha256 } from "../crypto";

export const SESSION_COOKIE = "xz_session";

export type SessionUser = typeof users.$inferSelect;

export async function createSession(
  db: Db,
  userId: string,
  userAgent: string | null,
  now = new Date(),
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken();
  const expiresAt = new Date(now.getTime() + sessionLimits.ttlDays * 86400_000);
  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

/** 有效会话对应的用户；会话过期、不存在时返回 null。停用账号照样返回，由调用方决定如何提示 */
export async function userForSession(db: Db, token: string | undefined, now = new Date()) {
  if (!token) return null;
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, now)))
    .limit(1);
  return row?.user ?? null;
}

export async function deleteSession(db: Db, token: string | undefined) {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
}

export async function deleteExpiredSessions(db: Db, now = new Date()) {
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
}
