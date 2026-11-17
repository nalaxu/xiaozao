import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { completeVerified } from "@/server/auth/complete";
import { verifyEmailOtp } from "@/server/auth/otp";
import { resolveVerifiedIdentity } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { forbiddenOrigin, jsonError, readJson, sameOrigin } from "@/server/http";

const body = z.object({
  email: z.string().trim().max(254).email(),
  code: z.string().max(20),
  next: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return jsonError(400, "验证码错误或已过期");

  const db = await getDb();
  const verified = await verifyEmailOtp(db, parsed.data);
  if (!verified.ok) return jsonError(400, "验证码错误或已过期");

  const identity = await resolveVerifiedIdentity(db, { email: verified.email, via: "email" });
  const done = await completeVerified(identity, req.headers.get("user-agent"), parsed.data.next);
  if (done.kind === "disabled") return jsonError(403, "账号已暂停使用，如有疑问请联系我们");
  return NextResponse.json({ next: done.next });
}
