import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { completeVerified } from "@/server/auth/complete";
import { exchangeCode, OAUTH_COOKIE } from "@/server/auth/google";
import { resolveVerifiedIdentity } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { appOrigin, safeNext } from "@/server/http";

function fail(req: NextRequest, error: string, next = "/") {
  return NextResponse.redirect(new URL(`/login?error=${error}&next=${encodeURIComponent(next)}`, req.url));
}

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);

  let saved: { state: string; verifier: string; next: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {
    saved = null;
  }
  const params = req.nextUrl.searchParams;
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) {
    return fail(req, "google_failed", saved?.next);
  }

  try {
    const profile = await exchangeCode({
      code,
      verifier: saved.verifier,
      redirectUri: `${appOrigin(req)}/api/auth/google/callback`,
    });
    const identity = await resolveVerifiedIdentity(await getDb(), {
      email: profile.email,
      via: "google",
      googleSub: profile.sub,
      displayName: profile.name,
    });
    const done = await completeVerified(identity, req.headers.get("user-agent"), safeNext(saved.next));
    if (done.kind === "disabled") return fail(req, "disabled");
    return NextResponse.redirect(new URL(done.next, req.url));
  } catch (err) {
    console.error("Google 登录失败", err instanceof Error ? err.message : err);
    return fail(req, "google_failed", saved.next);
  }
}
