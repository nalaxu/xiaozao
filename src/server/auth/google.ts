// Google 登录：OAuth 2.0 授权码 + PKCE（技术方案 5.2）。
// id_token 直接从 Google 令牌端点经 TLS 取得，按 OIDC 规范可不验签，但仍校验 aud、iss、exp。
import { createHash } from "node:crypto";
import { randomToken } from "../crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const OAUTH_COOKIE = "xz_oauth";

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function newOAuthState() {
  return { state: randomToken(16), verifier: randomToken(32) };
}

export function authorizationUrl(opts: { state: string; verifier: string; redirectUri: string }): string {
  const challenge = createHash("sha256").update(opts.verifier).digest("base64url");
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: opts.state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params}`;
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name?: string;
}

export function parseIdToken(idToken: string, clientId: string, now = Date.now()): GoogleProfile {
  const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
  };
  if (payload.iss !== "https://accounts.google.com" && payload.iss !== "accounts.google.com") {
    throw new Error("id_token iss 不正确");
  }
  if (payload.aud !== clientId) throw new Error("id_token aud 不正确");
  if (!payload.exp || payload.exp * 1000 < now) throw new Error("id_token 已过期");
  if (!payload.sub || !payload.email) throw new Error("id_token 缺少 sub 或 email");
  if (payload.email_verified !== true) throw new Error("Google 邮箱未验证");
  return { sub: payload.sub, email: payload.email, name: payload.name };
}

export async function exchangeCode(opts: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID ?? "";
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      code: opts.code,
      code_verifier: opts.verifier,
      grant_type: "authorization_code",
      redirect_uri: opts.redirectUri,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Google 令牌交换失败：${res.status}`);
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google 未返回 id_token");
  return parseIdToken(data.id_token, clientId);
}
