// “先验证邮箱，再填邀请码”的统一流程（技术方案 5.1、5.5）。
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { signup as limits } from "@config/limits";
import type { Db } from "../db/client";
import { inviteCodes, inviteRedemptions, pendingSignups, users, waitlist } from "../db/schema";
import { normalizeEmail, normalizeInviteCode } from "../crypto";
import { DAY, HOUR, hit } from "../ratelimit";

export type User = typeof users.$inferSelect;

export type IdentityResult =
  | { kind: "user"; user: User }
  | { kind: "disabled" }
  | { kind: "pending"; pendingId: string };

export function isAdminEmail(email: string): boolean {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => normalizeEmail(e))
    .filter(Boolean)
    .includes(normalizeEmail(email));
}

/** 邮箱已证明归属（Google 或验证码）之后调用：有账号就登录，没有就进入待填邀请码状态 */
export async function resolveVerifiedIdentity(
  db: Db,
  input: { email: string; via: "google" | "email"; googleSub?: string; displayName?: string },
  now = new Date(),
): Promise<IdentityResult> {
  const email = normalizeEmail(input.email);
  const conds = [eq(users.email, email)];
  if (input.googleSub) conds.push(eq(users.googleSub, input.googleSub));
  const found = await db.select().from(users).where(or(...conds));
  // 优先按 Google 账号匹配，其次按邮箱
  const user = found.find((u) => input.googleSub && u.googleSub === input.googleSub) ?? found[0];

  if (user) {
    if (user.status === "disabled") return { kind: "disabled" };
    if (input.googleSub && !user.googleSub) {
      // 先用验证码注册、后用 Google 登录：按邮箱自动关联
      const [linked] = await db
        .update(users)
        .set({ googleSub: input.googleSub, displayName: user.displayName ?? input.displayName ?? null })
        .where(eq(users.id, user.id))
        .returning();
      return { kind: "user", user: linked };
    }
    return { kind: "user", user };
  }

  const [pending] = await db
    .insert(pendingSignups)
    .values({
      email,
      googleSub: input.googleSub ?? null,
      displayName: input.displayName ?? null,
      verifiedVia: input.via,
      expiresAt: new Date(now.getTime() + limits.pendingTtlMinutes * 60_000),
    })
    .returning({ id: pendingSignups.id });
  return { kind: "pending", pendingId: pending.id };
}

export async function getPendingSignup(db: Db, pendingId: string | undefined, now = new Date()) {
  if (!pendingId || !/^[0-9a-f-]{36}$/i.test(pendingId)) return null;
  const [row] = await db
    .select()
    .from(pendingSignups)
    .where(and(eq(pendingSignups.id, pendingId), gt(pendingSignups.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

export type RedeemResult =
  | { ok: true; user: User }
  | { ok: false; reason: "pending_expired" | "invalid_code" | "rate_limited" | "ip_signup_limit" };

export async function redeemInvite(
  db: Db,
  input: { pendingId: string | undefined; code: string; ip: string },
  now = new Date(),
): Promise<RedeemResult> {
  const pending = await getPendingSignup(db, input.pendingId, now);
  if (!pending) return { ok: false, reason: "pending_expired" };

  const attempt = await hit(
    db,
    { bucket: "invite:ip:h", key: input.ip, windowSeconds: HOUR, limit: limits.inviteAttemptsPerIpPerHour },
    now,
  );
  if (!attempt.ok) return { ok: false, reason: "rate_limited" };

  const code = normalizeInviteCode(input.code);
  if (!code) return { ok: false, reason: "invalid_code" };

  // 先确认码有效，再计入同 IP 的注册次数，避免输错码也占用注册名额
  const [valid] = await db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(
      and(
        eq(inviteCodes.code, code),
        isNull(inviteCodes.revokedAt),
        or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, now)),
        lt(inviteCodes.usedCount, inviteCodes.maxUses),
      ),
    )
    .limit(1);
  if (!valid) return { ok: false, reason: "invalid_code" };

  const signupsToday = await hit(
    db,
    { bucket: "signup:ip:d", key: input.ip, windowSeconds: DAY, limit: limits.signupsPerIpPerDay },
    now,
  );
  if (!signupsToday.ok) return { ok: false, reason: "ip_signup_limit" };

  return db.transaction(async (tx) => {
    // 同一邮箱可能在另一个标签页里刚注册完
    const [existing] = await tx.select().from(users).where(eq(users.email, pending.email)).limit(1);
    if (existing) {
      await tx.delete(pendingSignups).where(eq(pendingSignups.id, pending.id));
      return { ok: true as const, user: existing };
    }

    const [claimed] = await tx
      .update(inviteCodes)
      .set({ usedCount: sql`${inviteCodes.usedCount} + 1` })
      .where(
        and(
          eq(inviteCodes.id, valid.id),
          isNull(inviteCodes.revokedAt),
          or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, now)),
          lt(inviteCodes.usedCount, inviteCodes.maxUses),
        ),
      )
      .returning({ id: inviteCodes.id });
    if (!claimed) return { ok: false as const, reason: "invalid_code" as const };

    const [user] = await tx
      .insert(users)
      .values({
        email: pending.email,
        googleSub: pending.googleSub,
        displayName: pending.displayName,
        role: isAdminEmail(pending.email) ? "admin" : "user",
        inviteCodeId: claimed.id,
      })
      .returning();
    await tx.insert(inviteRedemptions).values({ inviteCodeId: claimed.id, userId: user.id });
    await tx.delete(pendingSignups).where(eq(pendingSignups.email, pending.email));
    return { ok: true as const, user };
  });
}

/** 申请邀请码（F33b）。同一邮箱已有待处理申请时只更新留言 */
export async function applyForInvite(db: Db, input: { email: string; message?: string }) {
  const email = normalizeEmail(input.email);
  const message = input.message?.trim().slice(0, 300) || null;
  const [existing] = await db
    .select({ id: waitlist.id })
    .from(waitlist)
    .where(and(eq(waitlist.email, email), eq(waitlist.status, "pending")))
    .limit(1);
  if (existing) {
    if (message) await db.update(waitlist).set({ message }).where(eq(waitlist.id, existing.id));
    return;
  }
  await db.insert(waitlist).values({ email, message });
}
