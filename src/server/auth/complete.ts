import "server-only";
import { getDb } from "../db";
import { logEvent } from "../events";
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

/** 用邀请码建号后：登录并记事件。新账号先到欢迎页问忌口与过敏（设计文档 4.12），完成后回到原本要去的页面 */
export async function finishSignup(user: User, userAgent: string | null, pendingId: string | null, next: string | null | undefined) {
  await signIn(user, userAgent);
  await logEvent(await getDb(), user.id, "signup_complete", { pendingId });
  return `/welcome?next=${encodeURIComponent(safeNext(next))}`;
}

/** 新邮箱待填邀请码：记下待注册状态（Cookie），供同页补填或 /login/invite 使用 */
export async function markPending(pendingId: string) {
  await setPendingCookie(pendingId);
  await logEvent(await getDb(), null, "signup_pending", { pendingId });
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
    await markPending(identity.pendingId);
    return { kind: "need_invite", next: `/login/invite?next=${encodeURIComponent(target)}` };
  }
  await signIn(identity.user, userAgent);
  return { kind: "signed_in", next: target };
}
