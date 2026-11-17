import { NextResponse, type NextRequest } from "next/server";
import { authorizationUrl, googleConfigured, newOAuthState, OAUTH_COOKIE } from "@/server/auth/google";
import { setShortCookie } from "@/server/auth/current";
import { appOrigin, safeNext } from "@/server/http";

export async function GET(req: NextRequest) {
  const next = safeNext(req.nextUrl.searchParams.get("next"));
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL(`/login?error=google_unavailable&next=${encodeURIComponent(next)}`, req.url));
  }
  const { state, verifier } = newOAuthState();
  await setShortCookie(OAUTH_COOKIE, JSON.stringify({ state, verifier, next }), 10 * 60);
  const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
  return NextResponse.redirect(authorizationUrl({ state, verifier, redirectUri }));
}
