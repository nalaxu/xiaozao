import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { signIn } from "@/server/auth/complete";
import { PENDING_COOKIE, readCookie } from "@/server/auth/current";
import { redeemInvite } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { logEvent } from "@/server/events";
import { clientIp, forbiddenOrigin, jsonError, readJson, safeNext, sameOrigin } from "@/server/http";

const body = z.object({ code: z.string().max(40), next: z.string().max(500).optional() });

const MESSAGES = {
  pending_expired: "登录状态已过期，请重新验证邮箱",
  invalid_code: "邀请码无效或已用完",
  rate_limited: "尝试次数太多，请一小时后再试",
  ip_signup_limit: "今天这个网络下注册的账号已达上限，请明天再试",
} as const;

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, MESSAGES.invalid_code);

  const pendingId = await readCookie(PENDING_COOKIE);
  const result = await redeemInvite(await getDb(), {
    pendingId,
    code: parsed.data.code,
    ip: clientIp(req),
  });
  if (!result.ok) {
    const status = result.reason === "pending_expired" ? 401 : result.reason === "invalid_code" ? 400 : 429;
    return jsonError(status, MESSAGES[result.reason], { reason: result.reason });
  }
  await signIn(result.user, req.headers.get("user-agent"));
  await logEvent(await getDb(), result.user.id, "signup_complete", { pendingId: pendingId ?? null });
  // 新账号先到欢迎页问忌口与过敏（设计文档 4.12），完成后回到原本要去的页面
  return NextResponse.json({ next: `/welcome?next=${encodeURIComponent(safeNext(parsed.data.next))}` });
}
