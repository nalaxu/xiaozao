import type { Metadata } from "next";
import { WelcomeForm } from "@/components/settings/welcome-form";
import { allergenOptions, slimIngredients } from "@/lib/kb";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { safeNext } from "@/server/http";
import { loadPersonalization } from "@/server/preferences";

export const metadata: Metadata = { title: "欢迎" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ next?: string }> };

export default async function WelcomePage({ searchParams }: Props) {
  const next = safeNext((await searchParams).next);
  const user = await requireUser(`/welcome?next=${encodeURIComponent(next)}`);
  const { prefs } = await loadPersonalization(await getDb(), user.id);
  return (
    <WelcomeForm
      next={next}
      initial={{ allergens: prefs?.allergens ?? [], avoid: prefs?.avoid ?? [], equipment: prefs?.equipment ?? [] }}
      allergenOptions={allergenOptions()}
      ingredients={slimIngredients()}
    />
  );
}
