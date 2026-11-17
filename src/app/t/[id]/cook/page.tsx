import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CookMode } from "@/components/cook/cook-mode";
import { toOfflineRecord } from "@/lib/offline";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { loadPersonalization } from "@/server/preferences";
import { readTutorial } from "@/server/tutorial/read";
import { cuisineMeta } from "../../cuisine-meta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "烹饪模式" };

type Props = { params: Promise<{ id: string }> };

export default async function CookPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/t/${id}/cook`);
  const db = await getDb();
  const t = await readTutorial(db, user.id, id);
  if (!t) notFound();
  if (t.status !== "done" || !t.content) redirect(`/t/${id}`);
  const { prefs, privacy } = await loadPersonalization(db, user.id);
  return (
    <CookMode
      tutorialId={t.id}
      content={t.content}
      units={prefs?.units ?? t.units}
      exitHref={`/t/${t.id}`}
      ratingsRecorded={privacy.recordRatings}
      offlineRecord={toOfflineRecord({ ...t, cuisine: cuisineMeta(t.dish.cuisineId) }) ?? undefined}
    />
  );
}
