import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { finishSignup } from "@/server/auth/complete";
import { PENDING_COOKIE, readCookie } from "@/server/auth/current";
import { INVITE_MESSAGES, redeemInvite } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { clientIp, forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";

const body = z.object({ code: z.string().max(40), next: z.string().max(500).optional() });

const MESSAGES = INVITE_MESSAGES;

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
  return NextResponse.json({
    next: await finishSignup(result.user, req.headers.get("user-agent"), pendingId ?? null, parsed.data.next),
  });
}
