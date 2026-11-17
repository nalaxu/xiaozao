import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "../db";
import { SESSION_COOKIE, deleteSession, userForSession, type SessionUser } from "./session";

export const PENDING_COOKIE = "xz_pending";

const base = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };

// 以下写 Cookie 的函数只能在接口（Route Handler）或 Server Action 中调用

export async function setSessionCookie(token: string, expires: Date) {
  (await cookies()).set(SESSION_COOKIE, token, { ...base, expires });
}

export async function setPendingCookie(pendingId: string) {
  (await cookies()).set(PENDING_COOKIE, pendingId, { ...base, maxAge: 30 * 60 });
}

export async function clearPendingCookie() {
  (await cookies()).delete(PENDING_COOKIE);
}

export async function setShortCookie(name: string, value: string, maxAgeSeconds: number) {
  (await cookies()).set(name, value, { ...base, maxAge: maxAgeSeconds });
}

export async function readCookie(name: string) {
  return (await cookies()).get(name)?.value;
}

export async function signOut() {
  const jar = await cookies();
  await deleteSession(await getDb(), jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** 当前登录用户；未登录、会话过期或账号停用时返回 null */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const user = await userForSession(await getDb(), token);
  return user && user.status === "active" ? user : null;
}

export async function requireUser(next: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser("/admin");
  if (user.role !== "admin") redirect("/");
  return user;
}
