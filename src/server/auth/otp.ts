// 邮箱验证码（PRD 4.6 的规则表；技术方案 5.3）。
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { otp as limits } from "@config/limits";
import type { Db } from "../db/client";
import { emailOtps } from "../db/schema";
import { hmac, normalizeEmail, otpCode, safeEqualHex } from "../crypto";
import { otpMail, type MailSender } from "../mail";
import { DAY, HOUR, hitAll } from "../ratelimit";

export type StartResult = { ok: true } | { ok: false; reason: "rate_limited"; retryAfter: number };

const codeHash = (email: string, code: string) => hmac(`${email}:${code}`);

export async function startEmailOtp(
  db: Db,
  input: { email: string; ip: string },
  send: MailSender,
  now = new Date(),
): Promise<StartResult> {
  const email = normalizeEmail(input.email);

  // 60 秒内不能重发
  const [last] = await db
    .select({ createdAt: emailOtps.createdAt })
    .from(emailOtps)
    .where(eq(emailOtps.email, email))
    .orderBy(desc(emailOtps.createdAt))
    .limit(1);
  if (last) {
    const elapsed = (now.getTime() - last.createdAt.getTime()) / 1000;
    if (elapsed < limits.resendSeconds) {
      return { ok: false, reason: "rate_limited", retryAfter: Math.ceil(limits.resendSeconds - elapsed) };
    }
  }

  const rate = await hitAll(
    db,
    [
      { bucket: "otp:email:h", key: email, windowSeconds: HOUR, limit: limits.perEmailPerHour },
      { bucket: "otp:email:d", key: email, windowSeconds: DAY, limit: limits.perEmailPerDay },
      { bucket: "otp:ip:h", key: input.ip, windowSeconds: HOUR, limit: limits.perIpPerHour },
    ],
    now,
  );
  if (!rate.ok) return { ok: false, reason: "rate_limited", retryAfter: rate.retryAfter };

  // 新码发出后旧码立即失效
  await db
    .update(emailOtps)
    .set({ consumedAt: now })
    .where(and(eq(emailOtps.email, email), isNull(emailOtps.consumedAt)));

  const code = otpCode();
  await db.insert(emailOtps).values({
    email,
    codeHash: codeHash(email, code),
    expiresAt: new Date(now.getTime() + limits.ttlSeconds * 1000),
    createdAt: now,
  });
  await send(otpMail(email, code));
  return { ok: true };
}

export type VerifyResult = { ok: true; email: string } | { ok: false };

export async function verifyEmailOtp(
  db: Db,
  input: { email: string; code: string },
  now = new Date(),
): Promise<VerifyResult> {
  const email = normalizeEmail(input.email);
  const code = input.code.replace(/\D/g, "");

  const [row] = await db
    .select()
    .from(emailOtps)
    .where(and(eq(emailOtps.email, email), isNull(emailOtps.consumedAt), gt(emailOtps.expiresAt, now)))
    .orderBy(desc(emailOtps.createdAt))
    .limit(1);
  if (!row) return { ok: false };

  if (code.length === 6 && safeEqualHex(row.codeHash, codeHash(email, code))) {
    // 只有仍未使用时才算成功，防止并发重复使用
    const used = await db
      .update(emailOtps)
      .set({ consumedAt: now })
      .where(and(eq(emailOtps.id, row.id), isNull(emailOtps.consumedAt)))
      .returning({ id: emailOtps.id });
    return used.length > 0 ? { ok: true, email } : { ok: false };
  }

  const attempts = row.attempts + 1;
  await db
    .update(emailOtps)
    .set({ attempts, consumedAt: attempts >= limits.maxAttempts ? now : null })
    .where(eq(emailOtps.id, row.id));
  return { ok: false };
}
