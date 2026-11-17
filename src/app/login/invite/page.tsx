import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteForm } from "@/components/invite-form";
import { ButtonLink } from "@/components/ui";
import { PENDING_COOKIE, getCurrentUser, readCookie } from "@/server/auth/current";
import { getPendingSignup } from "@/server/auth/signup";
import { getDb } from "@/server/db";
import { safeNext } from "@/server/http";

export const metadata: Metadata = { title: "填写邀请码" };

type Props = { searchParams: Promise<{ next?: string }> };

export default async function InvitePage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  if (await getCurrentUser()) redirect(next);
  const pendingId = await readCookie(PENDING_COOKIE);
  const pending = pendingId ? await getPendingSignup(await getDb(), pendingId) : null;

  return (
    <div className="mx-auto max-w-[420px] pt-4">
      <p className="text-h2 font-bold text-primary">小灶</p>
      {pending ? (
        <>
          <h1 className="mt-6 text-h1 font-bold">填写邀请码</h1>
          <p className="mb-6 mt-1 text-text-muted">
            {pending.email} 已验证。小灶目前凭邀请码注册，填入后就能开始用了。
          </p>
          <InviteForm next={next} />
          <p className="mt-6 text-small text-text-muted">
            <Link href="/login/apply" className="text-primary">
              没有邀请码？申请一个 →
            </Link>
          </p>
        </>
      ) : (
        <>
          <h1 className="mt-6 text-h1 font-bold">请先验证邮箱</h1>
          <p className="mb-6 mt-1 text-text-muted">验证状态已过期（30 分钟），重新验证邮箱后再填写邀请码。</p>
          <ButtonLink href={`/login?next=${encodeURIComponent(next)}`}>去验证邮箱</ButtonLink>
        </>
      )}
    </div>
  );
}
