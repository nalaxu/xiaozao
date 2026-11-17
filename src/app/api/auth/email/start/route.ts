import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { startEmailOtp } from "@/server/auth/otp";
import { getDb } from "@/server/db";
import { clientIp, forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";
import { sendMail } from "@/server/mail";
import { verifyTurnstile } from "@/server/turnstile";

const body = z.object({
  email: z.string().trim().max(254).email(),
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

  const result = await startEmailOtp(await getDb(), { email: parsed.data.email, ip }, sendMail);
  if (!result.ok) {
    return jsonError(429, `请求太频繁，请 ${result.retryAfter} 秒后再试`, { retryAfter: result.retryAfter });
  }
  // 无论邮箱是否注册，返回都相同（PRD 4.6）
  return NextResponse.json({ ok: true });
}
