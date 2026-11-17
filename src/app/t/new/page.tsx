import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { quota } from "@config/limits";
import { TutorialLive } from "@/components/tutorial/tutorial-live";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { dishImages } from "@/server/dishes";
import { loadPersonalization } from "@/server/preferences";
import { existingTutorial, findRunDish } from "@/server/tutorial/run";
import { cuisineMeta } from "../cuisine-meta";

export const metadata: Metadata = { title: "教程" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ run?: string; dish?: string }> };

const UUID = /^[0-9a-f-]{36}$/i;

/** 从推荐卡片进入：生成这道菜的教程（已生成过则直接打开，不再扣额度） */
export default async function NewTutorialPage({ searchParams }: Props) {
  const { run, dish } = await searchParams;
  if (!run || !dish || !UUID.test(run) || !UUID.test(dish)) notFound();
  const user = await requireUser(`/t/new?run=${run}&dish=${dish}`);
  const db = await getDb();
  const found = await findRunDish(db, user.id, run, dish);
  if (!found) notFound();
  const existing = await existingTutorial(db, user.id, run, dish);
  if (existing) redirect(`/t/${existing}`);

  const [images, { prefs }] = await Promise.all([dishImages(db, [dish], 768), loadPersonalization(db, user.id)]);
  return (
    <TutorialLive
      mode={{ kind: "generate", runId: run, dishId: dish }}
      dish={{ id: dish, nameZh: found.dish.nameZh, imageUrl: images[dish] ?? null }}
      cuisine={cuisineMeta(found.dish.cuisineId)}
      units={prefs?.units ?? "metric"}
      followupLimit={quota.followupsPerTutorial}
      backHref="/recommend"
    />
  );
}
