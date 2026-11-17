// 个性化数据的读取与偏好摘要（技术方案 7.6）。设置页在 M5 实现，这里先提供推荐需要的部分。
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { kb } from "@/lib/kb";
import { restrictionMatcher } from "@/lib/restrictions";
import type { Db } from "./db/client";
import { dishes, preferences, privacySettings, recommendationRuns } from "./db/schema";

export type Preferences = typeof preferences.$inferSelect;
export type Privacy = typeof privacySettings.$inferSelect;

const DEFAULT_PRIVACY = {
  recordTaste: true,
  recordHistory: true,
  recordRatings: true,
  recordEquipment: true,
  recordPantry: true,
};

export async function loadPersonalization(db: Db, userId: string) {
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const [privacy] = await db.select().from(privacySettings).where(eq(privacySettings.userId, userId));
  return { prefs: prefs ?? null, privacy: privacy ?? { userId, ...DEFAULT_PRIVACY } };
}

/** 不超过 150 字、只含口味与条件、不含身份信息的摘要（PRD 7.1）。评价部分在 M5 接入 */
export function preferenceSummary(prefs: Preferences | null, privacy: Pick<Privacy, keyof typeof DEFAULT_PRIVACY>): string {
  if (!prefs) return "";
  const parts: string[] = [];
  // 忌口与过敏关系到安全，不受记录开关影响
  if (prefs.avoid.length) parts.push(`不吃${prefs.avoid.join("、")}`);
  if (prefs.allergens.length) parts.push(`对${prefs.allergens.join("、")}过敏`);
  if (privacy.recordTaste && prefs.tasteNotes) parts.push(prefs.tasteNotes);
  if (privacy.recordEquipment && prefs.equipment.length) parts.push(`有${prefs.equipment.join("、")}`);
  if (privacy.recordPantry && prefs.pantry.length) parts.push(`常备${prefs.pantry.join("、")}`);
  const s = parts.join("；");
  return s.length > 150 ? `${s.slice(0, 149)}…` : s;
}

const expand = restrictionMatcher(kb.ingredients);

/**
 * 忌口与过敏原关键词。过敏原类别到具体食材的映射来自 knowledge/allergens.yaml（待审核，M5 接入），
 * 在那之前过敏原按类别名本身匹配。
 */
export function restrictionKeywords(prefs: Preferences | null): string[] {
  if (!prefs) return [];
  return expand([...prefs.avoid, ...prefs.allergens]);
}

/** 记住这次的口味选择，下次默认带出（F13）；关闭了口味记录则不保存 */
export async function saveLastChoices(
  db: Db,
  userId: string,
  privacy: Pick<Privacy, "recordTaste">,
  choice: { flavors: string[]; scene: string | null; cuisine: string | null },
) {
  if (!privacy.recordTaste) return;
  const values = { lastFlavors: choice.flavors, lastScene: choice.scene, lastCuisine: choice.cuisine, updatedAt: new Date() };
  await db
    .insert(preferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: preferences.userId, set: values });
}

/** 近 N 天推荐过的菜（开启历史记录时用于排除，7.3 第 5 步） */
export async function recentRecommendations(
  db: Db,
  userId: string,
  days = 14,
  now = new Date(),
): Promise<{ names: string[]; cuisines: string[] }> {
  const since = new Date(now.getTime() - days * 86400_000);
  const runs = await db
    .select({ dishIds: recommendationRuns.dishIds })
    .from(recommendationRuns)
    .where(and(eq(recommendationRuns.userId, userId), gte(recommendationRuns.createdAt, since)))
    .orderBy(desc(recommendationRuns.createdAt))
    .limit(30);
  const ids = [...new Set(runs.flatMap((r) => r.dishIds))];
  if (!ids.length) return { names: [], cuisines: [] };
  const rows = await db
    .select({ nameZh: dishes.nameZh, cuisineId: dishes.cuisineId })
    .from(dishes)
    .where(inArray(dishes.id, ids));
  return { names: rows.map((r) => r.nameZh).slice(0, 60), cuisines: [...new Set(rows.map((r) => r.cuisineId))] };
}
