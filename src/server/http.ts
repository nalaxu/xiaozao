import { NextResponse, type NextRequest } from "next/server";

export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** 写操作只接受同源请求（技术方案 5.4） */
export function sameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  const allowed = new Set([req.nextUrl.origin]);
  if (process.env.APP_URL) allowed.add(new URL(process.env.APP_URL).origin);
  return allowed.has(origin);
}

/** 只允许站内相对路径作为登录后的跳转目标 */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function jsonError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, ...extra }, { status });
}

export const forbiddenOrigin = () => jsonError(403, "请求来源不正确");

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

/** 站点对外地址：优先 APP_URL，否则用请求的 origin（本地开发） */
export function appOrigin(req: NextRequest): string {
  return process.env.APP_URL ? new URL(process.env.APP_URL).origin : req.nextUrl.origin;
}
