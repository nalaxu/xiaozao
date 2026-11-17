import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";

export const metadata: Metadata = { title: "我的" };
export const dynamic = "force-dynamic";

export default async function MePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <h1 className="text-h1 font-bold">我的</h1>
        <Card className="mt-4 p-4">
          <p>登录后可以设置忌口与过敏、厨具和常备调料，查看今日额度和管理个人数据。</p>
          <ButtonLink href="/login?next=/me" className="mt-4">
            登录 / 注册
          </ButtonLink>
        </Card>
      </>
    );
  }

  return (
    <>
      <h1 className="text-h1 font-bold">我的</h1>
      <Card className="mt-4 p-4">
        <p className="font-bold">{user.displayName ?? user.email.split("@")[0]}</p>
        <p className="text-small text-text-muted">{user.email}</p>
      </Card>

      <Card className="mt-4 p-4">
        <p className="text-text-muted">口味、忌口、厨具与数据设置即将开放。</p>
      </Card>

      {user.role === "admin" && (
        <Link href="/admin" className="mt-4 block">
          <Card className="flex items-center justify-between p-4 active:bg-surface-muted">
            <span className="font-bold">管理后台</span>
            <ChevronRight size={18} className="text-text-muted" aria-hidden />
          </Card>
        </Link>
      )}

      <div className="mt-8">
        <LogoutButton />
      </div>
    </>
  );
}
