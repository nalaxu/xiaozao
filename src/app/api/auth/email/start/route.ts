import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { startEmailOtp } from "@/server/auth/otp";
import { INVITE_MESSAGES, checkInviteCode } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { clientIp, forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";
import { sendMail } from "@/server/mail";
import { verifyTurnstile } from "@/server/turnstile";

const body = z.object({
  email: z.string().trim().max(254).email(),
  /** 新用户在同一页填的邀请码；已注册用户留空 */
  inviteCode: z.string().trim().max(40).optional(),
  turnstileToken: z.string().max(4096).nullish(),
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "请填写正确的邮箱地址");

  const ip = clientIp(req);
  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip))) {
    return jsonError(400, "真人验证没有通过，请刷新后再试");
  }

  const db = await getDb();
  // 填了邀请码就先查一下，码不对不发邮件（只说码本身，不透露邮箱是否注册过）
  if (parsed.data.inviteCode) {
    const check = await checkInviteCode(db, { code: parsed.data.inviteCode, ip });
    if (!check.ok) {
      const message =
        check.reason === "invalid_code" ? `${INVITE_MESSAGES.invalid_code}（已注册的邮箱不用填）` : INVITE_MESSAGES[check.reason];
      return jsonError(check.reason === "rate_limited" ? 429 : 400, message, { field: "invite" });
    }
  }

  const result = await startEmailOtp(db, { email: parsed.data.email, ip }, sendMail);
  if (!result.ok) {
    return jsonError(429, `请求太频繁，请 ${result.retryAfter} 秒后再试`, { retryAfter: result.retryAfter });
  }
  // 无论邮箱是否注册，返回都相同（PRD 4.6）
  return NextResponse.json({ ok: true });
}
