import type { Metadata } from "next";
import Link from "next/link";
import { ApplyForm } from "@/components/apply-form";
import { PENDING_COOKIE, readCookie } from "@/server/auth/current";
import { getPendingSignup } from "@/server/auth/signup";
import { getDb } from "@/server/db";

export const metadata: Metadata = { title: "申请邀请码" };

export default async function ApplyPage() {
  const pendingId = await readCookie(PENDING_COOKIE);
  const pending = pendingId ? await getPendingSignup(await getDb(), pendingId) : null;

  return (
    <div className="mx-auto max-w-[420px] pt-4">
      <Link href="/login" className="text-h2 font-bold text-primary">
        小灶
      </Link>
      <h1 className="mt-6 text-h1 font-bold">申请邀请码</h1>
      <p className="mb-6 mt-1 text-text-muted">小灶还在小范围试用。留下邮箱，发放邀请码后会通知你。</p>
      <ApplyForm defaultEmail={pending?.email ?? ""} />
    </div>
  );
}
