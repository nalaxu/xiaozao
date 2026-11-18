import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { completeVerified, finishSignup, markPending } from "@/server/auth/complete";
import { verifyEmailOtp } from "@/server/auth/otp";
import { INVITE_MESSAGES, redeemInvite, resolveVerifiedIdentity } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { clientIp, forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";

const body = z.object({
  email: z.string().trim().max(254).email(),
  code: z.string().max(20),
  /** 新用户在同一页填的邀请码：验证码通过后直接建号 */
  inviteCode: z.string().trim().max(40).optional(),
  next: z.string().max(500).optional(),
});

/**
 * 返回 { next } 表示已登录；返回 { needInvite: true }（可带 error）表示邮箱已验证但需要邀请码，
 * 待注册状态已存在 Cookie 里，前端在同一页补填后提交到 /api/auth/invite，不用重新收验证码。
 */
export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "验证码错误或已过期");

  const db = await getDb();
  const verified = await verifyEmailOtp(db, parsed.data);
  if (!verified.ok) return jsonError(400, "验证码错误或已过期");

  const identity = await resolveVerifiedIdentity(db, { email: verified.email, via: "email" });
  const userAgent = req.headers.get("user-agent");

  if (identity.kind === "pending" && parsed.data.inviteCode) {
    const result = await redeemInvite(db, {
      pendingId: identity.pendingId,
      code: parsed.data.inviteCode,
      ip: clientIp(req),
    });
    if (result.ok) {
      return NextResponse.json({ next: await finishSignup(result.user, userAgent, identity.pendingId, parsed.data.next) });
    }
    await markPending(identity.pendingId);
    return NextResponse.json({ needInvite: true, error: INVITE_MESSAGES[result.reason], reason: result.reason });
  }

  const done = await completeVerified(identity, userAgent, parsed.data.next);
  if (done.kind === "disabled") return jsonError(403, "账号已暂停使用，如有疑问请联系我们");
  if (done.kind === "need_invite") return NextResponse.json({ needInvite: true, next: done.next });
  return NextResponse.json({ next: done.next });
}
