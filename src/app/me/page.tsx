import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ResetTime, UnitsToggle } from "@/components/settings/me-client";
import { ButtonLink, Card } from "@/components/ui";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { allergenLabel, loadPersonalization } from "@/server/preferences";
import { quotaStatus, type QuotaKind } from "@/server/usage";

export const metadata: Metadata = { title: "我的" };
export const dynamic = "force-dynamic";

const QUOTA_LABELS: Record<QuotaKind, string> = { recommend: "推荐", tutorial: "教程", recognize: "拍照" };

export default async function MePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <>
        <h1 className="font-serif text-display font-black">我的</h1>
        <Card className="mt-4 p-4">
          <p>登录后可以设置忌口与过敏、厨具和常备调料，查看今日额度和管理个人数据。</p>
          <ButtonLink href="/login?next=/me" className="mt-4">
            登录 / 注册
          </ButtonLink>
        </Card>
      </>
    );
  }

  const db = await getDb();
  const [quota, { prefs }] = await Promise.all([quotaStatus(db, user), loadPersonalization(db, user.id)]);
  const restrictions = [...(prefs?.allergens ?? []).map((a) => `${allergenLabel(a)}过敏`), ...(prefs?.avoid ?? [])];
  const kitchen = [...(prefs?.equipment ?? []), ...(prefs?.pantry ?? [])];

  return (
    <>
      <h1 className="font-serif text-display font-black">我的</h1>
      <Card className="mt-4 p-4">
        <p className="font-bold">{user.displayName ?? user.email.split("@")[0]}</p>
        <p className="text-small text-text-muted">{user.email}</p>
      </Card>

      <Card className="mt-4 p-4">
        <h2 className="font-bold">今日额度</h2>
        {quota.unlimited ? (
          <p className="mt-1 text-small text-text-muted">管理员不限次数。</p>
        ) : (
          <>
            <ul className="mt-3 space-y-3">
              {(Object.keys(QUOTA_LABELS) as QuotaKind[]).map((k) => {
                const used = quota.limits[k] - quota.remaining[k];
                return (
                  <li key={k}>
                    <div className="flex justify-between text-small">
                      <span>{QUOTA_LABELS[k]}</span>
                      <span className="tabular text-text-muted">
                        已用 {used}/{quota.limits[k]}
                      </span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                      <div className="h-full rounded-full bg-primary" style={{ width: `${(used / quota.limits[k]) * 100}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-caption text-text-muted">
              <ResetTime at={quota.resetAt} />
            </p>
          </>
        )}
      </Card>

      <Card className="mt-4">
        <ul className="divide-y divide-border">
          <MenuItem href="/me/taste" title="我的口味" sub={prefs?.tasteNotes || "小灶对你的理解，可以直接改"} />
          <MenuItem href="/me/allergies" title="忌口与过敏" sub={restrictions.length ? restrictions.join("、") : "还没填"} />
          <MenuItem href="/me/kitchen" title="厨具与常备调料" sub={kitchen.length ? kitchen.join("、") : "还没填"} />
          <li className="flex items-center gap-3 p-4">
            <span className="flex-1 font-bold">单位</span>
            <UnitsToggle initial={prefs?.units ?? "metric"} />
          </li>
          <MenuItem href="/me/privacy" title="数据与隐私" sub="记录开关、导出、删除、注销" />
          <MenuItem href="/privacy" title="隐私政策" />
          {user.role === "admin" && <MenuItem href="/admin" title="管理后台" />}
        </ul>
      </Card>

      <div className="mt-8">
        <LogoutButton />
      </div>
    </>
  );
}

function MenuItem({ href, title, sub }: { href: string; title: string; sub?: ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 p-4 active:bg-surface-muted">
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{title}</span>
          {sub && <span className="block truncate text-small text-text-muted">{sub}</span>}
        </span>
        <ChevronRight size={18} className="shrink-0 text-text-muted" aria-hidden />
      </Link>
    </li>
  );
}
