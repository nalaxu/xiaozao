import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CookMode } from "@/components/cook/cook-mode";
import { toOfflineRecord } from "@/lib/offline";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { readTutorial } from "@/server/tutorial/read";
import { cuisineMeta } from "../../cuisine-meta";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "烹饪模式" };

type Props = { params: Promise<{ id: string }> };

export default async function CookPage({ params }: Props) {
  const { id } = await params;
  const user = await requireUser(`/t/${id}/cook`);
  const t = await readTutorial(await getDb(), user.id, id);
  if (!t) notFound();
  if (t.status !== "done" || !t.content) redirect(`/t/${id}`);
  return (
    <CookMode
      tutorialId={t.id}
      content={t.content}
      units={t.units}
      exitHref={`/t/${t.id}`}
      offlineRecord={toOfflineRecord({ ...t, cuisine: cuisineMeta(t.dish.cuisineId) }) ?? undefined}
    />
  );
}
