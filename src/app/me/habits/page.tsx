import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/controls";
import { HabitsForm } from "@/components/settings/habits-form";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { cookingProfile, loadPersonalization } from "@/server/preferences";

export const metadata: Metadata = { title: "做饭习惯" };
export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const user = await requireUser("/me/habits");
  const { prefs, privacy } = await loadPersonalization(await getDb(), user.id);
  return (
    <>
      <SettingsHeader title="做饭习惯" />
      <HabitsForm initial={cookingProfile(prefs, { recordTaste: true })} recording={privacy.recordTaste} />
    </>
  );
}
