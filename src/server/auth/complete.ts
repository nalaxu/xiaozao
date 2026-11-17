import "server-only";
import { getDb } from "../db";
import { safeNext } from "../http";
import { clearPendingCookie, setPendingCookie, setSessionCookie } from "./current";
import { createSession } from "./session";
import type { IdentityResult, User } from "./signup";

export type Completion = { kind: "signed_in"; next: string } | { kind: "disabled" } | { kind: "need_invite"; next: string };

export async function signIn(user: User, userAgent: string | null) {
  const { token, expiresAt } = await createSession(await getDb(), user.id, userAgent);
  await setSessionCookie(token, expiresAt);
  await clearPendingCookie();
}

/** 邮箱验证通过后：已有账号则登录，新邮箱则带去填邀请码 */
export async function completeVerified(
  identity: IdentityResult,
  userAgent: string | null,
  next: string | null | undefined,
): Promise<Completion> {
  const target = safeNext(next);
  if (identity.kind === "disabled") return { kind: "disabled" };
  if (identity.kind === "pending") {
    await setPendingCookie(identity.pendingId);
    return { kind: "need_invite", next: `/login/invite?next=${encodeURIComponent(target)}` };
  }
  await signIn(identity.user, userAgent);
  return { kind: "signed_in", next: target };
}
