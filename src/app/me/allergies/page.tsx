import type { Metadata } from "next";
import { AllergiesForm } from "@/components/settings/allergies-form";
import { SettingsHeader } from "@/components/settings/controls";
import { allergenOptions, slimIngredients } from "@/lib/kb";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { loadPersonalization } from "@/server/preferences";

export const metadata: Metadata = { title: "忌口与过敏" };
export const dynamic = "force-dynamic";

export default async function AllergiesPage() {
  const user = await requireUser("/me/allergies");
  const { prefs } = await loadPersonalization(await getDb(), user.id);
  return (
    <>
      <SettingsHeader title="忌口与过敏" />
      <AllergiesForm
        initial={{ allergens: prefs?.allergens ?? [], avoid: prefs?.avoid ?? [] }}
        allergenOptions={allergenOptions()}
        ingredients={slimIngredients()}
      />
    </>
  );
}
