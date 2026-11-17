import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { quota } from "@config/limits";
import { TutorialLive } from "@/components/tutorial/tutorial-live";
import { TutorialView } from "@/components/tutorial/tutorial-view";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { readTutorial } from "@/server/tutorial/read";
import { cuisineMeta } from "../cuisine-meta";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "教程" };

export default async function TutorialPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/t/${id}`);
  const t = await readTutorial(await getDb(), user.id, id);
  if (!t) notFound();

  const dish = { id: t.dish.id, nameZh: t.dish.nameZh, imageUrl: t.dish.imageUrl };
  const cuisine = cuisineMeta(t.dish.cuisineId);

  if (t.status === "failed") {
    return (
      <div className="pt-4">
        <Link href="/recommend" className="text-text-muted">
          ← 回到推荐
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
        units={t.units}
        followupLimit={quota.followupsPerTutorial}
        backHref="/recommend"
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
      units={t.units}
      followups={t.followups}
      followupLimit={quota.followupsPerTutorial}
      backHref="/recommend"
    />
  );
}
