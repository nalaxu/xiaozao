import type { Metadata } from "next";
import { SettingsHeader } from "@/components/settings/controls";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { PRIVACY_KEYS } from "@/lib/preference-options";
import { requireUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { loadPersonalization } from "@/server/preferences";

export const metadata: Metadata = { title: "数据与隐私" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const user = await requireUser("/me/privacy");
  const { privacy } = await loadPersonalization(await getDb(), user.id);
  const initial = Object.fromEntries(PRIVACY_KEYS.map((k) => [k, privacy[k]])) as Record<(typeof PRIVACY_KEYS)[number], boolean>;
  return (
    <>
      <SettingsHeader title="数据与隐私" sub="个性化数据随账号保存在云端，只用来给你推荐。" />
      <PrivacyForm initial={initial} />
    </>
  );
}
