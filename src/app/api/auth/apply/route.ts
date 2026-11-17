import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { applyForInvite } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { clientIp, forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";
import { DAY, hit } from "@/server/ratelimit";
import { verifyTurnstile } from "@/server/turnstile";

const body = z.object({
  email: z.string().trim().max(254).email(),
  message: z.string().max(300).optional(),
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
  const rate = await hit(db, { bucket: "apply:ip:d", key: ip, windowSeconds: DAY, limit: 5 });
  if (!rate.ok) return jsonError(429, "今天提交的申请太多了，请明天再试");

  await applyForInvite(db, parsed.data);
  return NextResponse.json({ ok: true });
}
