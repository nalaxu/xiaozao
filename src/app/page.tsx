import { Picker, type PickerOptions } from "@/components/picker";
import { CUISINE_GROUP_LABELS, kb } from "@/lib/kb";
import { getCurrentUser } from "@/server/auth/current";
import { getDb } from "@/server/db";
import { touchVisit } from "@/server/events";
import { loadPersonalization } from "@/server/preferences";
import { budget } from "@config/limits";
import { quotaStatus, spentToday } from "@/server/usage";

export const dynamic = "force-dynamic";

// 未登录时的“常用”食材：词典中的高频食材（设计文档 4.1）。登录后按个人历史排序尚未实现
const COMMON = ["鸡蛋", "鸡肉", "番茄", "土豆", "豆腐", "牛肉末", "洋葱", "猪肉", "青椒", "白菜", "胡萝卜", "蘑菇"];

function options(): PickerOptions {
  const known = new Set(kb.ingredients.map((i) => i.zh));
  return {
    ingredients: kb.ingredients.map(({ zh, aliases, en, category }) => ({ zh, aliases, en, category, pairs: [] })),
    common: COMMON.filter((n) => known.has(n)),
    flavors: kb.flavors.map(({ id, zh, tier, description }) => ({ id, zh, tier, description })),
    scenes: kb.scenes.map(({ id, zh, guidance }) => ({ id, zh, guidance })),
    cuisineGroups: (Object.keys(CUISINE_GROUP_LABELS) as (keyof typeof CUISINE_GROUP_LABELS)[]).map((g) => ({
      label: CUISINE_GROUP_LABELS[g],
      cuisines: kb.cuisines.filter((c) => c.group === g).map((c) => ({ id: c.id, zh: c.name.zh })),
    })),
  };
}

export default async function HomePage() {
  const user = await getCurrentUser();
  let account: Parameters<typeof Picker>[0]["account"] = null;
  if (user) {
    const db = await getDb();
    const [quota, { prefs }, spent] = await Promise.all([
      quotaStatus(db, user),
      loadPersonalization(db, user.id),
      spentToday(db),
      touchVisit(db, user.id),
    ]);
    account = {
      quota,
      paused: spent >= budget.hardCapUsd,
      last: prefs
        ? { flavors: prefs.lastFlavors, scene: prefs.lastScene, cuisine: prefs.lastCuisine }
        : null,
    };
  }
  return <Picker options={options()} account={account} />;
}
