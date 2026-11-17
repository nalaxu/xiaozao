import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/controls";
import { KitchenForm } from "@/components/settings/kitchen-form";
import { slimIngredients } from "@/lib/kb";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { loadPersonalization } from "@/server/preferences";

export const metadata: Metadata = { title: "厨具与常备调料" };
export const dynamic = "force-dynamic";

export default async function KitchenPage() {
  const user = await requireUser("/me/kitchen");
  const { prefs, privacy } = await loadPersonalization(await getDb(), user.id);
  return (
    <>
      <SettingsHeader title="厨具与常备调料" />
      <KitchenForm
        initial={{ equipment: prefs?.equipment ?? [], pantry: prefs?.pantry ?? [] }}
        ingredients={slimIngredients()}
        recording={{ equipment: privacy.recordEquipment, pantry: privacy.recordPantry }}
      />
    </>
  );
}
