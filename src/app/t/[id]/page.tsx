import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { quota } from "@config/limits";
import { TutorialLive } from "@/components/tutorial/tutorial-live";
import { TutorialView } from "@/components/tutorial/tutorial-view";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { toOfflineRecord } from "@/lib/offline";
import { loadPersonalization } from "@/server/preferences";
import { readTutorial } from "@/server/tutorial/read";
import { cuisineMeta } from "../cuisine-meta";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> };

export const metadata: Metadata = { title: "教程" };

export default async function TutorialPage({ params, searchParams }: Props) {
  const { id } = await params;
  // 从收藏或历史进来的回到收藏页，否则回到推荐
  const { from } = await searchParams;
  const backHref = from === "saved" ? "/saved" : from === "history" ? "/saved?tab=history" : "/recommend";
  const user = await requireUser(`/t/${id}`);
  const db = await getDb();
  const t = await readTutorial(db, user.id, id);
  if (!t) notFound();
  // 单位按账号当前的设置显示（设置页可改），没设置过用生成时的
  const units = (await loadPersonalization(db, user.id)).prefs?.units ?? t.units;

  const dish = { id: t.dish.id, nameZh: t.dish.nameZh, imageUrl: t.dish.imageUrl };
  const cuisine = cuisineMeta(t.dish.cuisineId);

  if (t.status === "failed") {
    return (
      <div className="pt-4">
        <Link href={backHref} className="text-text-muted">
          ← 返回
        </Link>
        <h1 className="mt-4 text-h1 font-bold">{t.dish.nameZh}</h1>
        <p className="mt-4 rounded-card bg-surface-muted p-4">这份教程没生成出来，次数已退回。回到推荐页再选一次？</p>
      </div>
    );
  }
  if (t.status === "streaming" || !t.content) {
    return (
      <TutorialLive
        mode={{ kind: "poll", id: t.id }}
        dish={dish}
        cuisine={cuisine}
        units={units}
        followupLimit={quota.followupsPerTutorial}
        backHref={backHref}
      />
    );
  }
  return (
    <TutorialView
      tutorialId={t.id}
      content={t.content}
      streaming={false}
      dish={dish}
      cuisine={cuisine}
      units={units}
      followups={t.followups}
      followupLimit={quota.followupsPerTutorial}
      backHref={backHref}
      favorite={t.favorite}
      cookedAt={t.cookedAt}
      rating={t.rating}
      offlineRecord={toOfflineRecord({ ...t, cuisine }) ?? undefined}
    />
  );
}
