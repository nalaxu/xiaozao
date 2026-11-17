import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/controls";
import { TasteForm } from "@/components/settings/taste-form";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { loadPersonalization, preferenceSummary, ratedDishes } from "@/server/preferences";
import { listRatings } from "@/server/settings";

export const metadata: Metadata = { title: "我的口味" };
export const dynamic = "force-dynamic";

export default async function TastePage() {
  const user = await requireUser("/me/taste");
  const db = await getDb();
  const { prefs, privacy } = await loadPersonalization(db, user.id);
  const [rated, list] = await Promise.all([ratedDishes(db, user.id, privacy), listRatings(db, user.id)]);
  return (
    <>
      <SettingsHeader title="我的口味" />
      <TasteForm
        summary={preferenceSummary(prefs, privacy, rated)}
        notes={prefs?.tasteNotes ?? ""}
        rated={list}
        recording={{ taste: privacy.recordTaste, ratings: privacy.recordRatings }}
      />
    </>
  );
}
