// 个性化数据的读取与偏好摘要（技术方案 7.6）。
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { kb } from "@/lib/kb";
import { buildRestrictions, restrictionMatcher, type RestrictionRule } from "@/lib/restrictions";
import type { Db } from "./db/client";
import { dishes, preferences, privacySettings, ratings, recommendationRuns, tutorials } from "./db/schema";

export type Preferences = typeof preferences.$inferSelect;
export type Privacy = typeof privacySettings.$inferSelect;

export const DEFAULT_PRIVACY = {
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

export interface RatedDishes {
  good: string[];
  never: string[];
}

const SUMMARY_MAX = 150;

export function allergenLabel(id: string) {
  return kb.allergens.find((a) => a.id === id)?.zh ?? id;
}

/**
 * 不超过 150 字、只含口味与条件、不含身份信息的摘要（PRD 7.1）。
 * 过敏与忌口关系到安全：放最前面、不受记录开关影响、超长也不截掉；其余部分按开关取舍，放不下就省略。
 */
export function preferenceSummary(
  prefs: Preferences | null,
  privacy: Pick<Privacy, keyof typeof DEFAULT_PRIVACY>,
  rated: RatedDishes = { good: [], never: [] },
): string {
  const required: string[] = [];
  const optional: string[] = [];
  if (prefs?.allergens.length) required.push(`对${prefs.allergens.map(allergenLabel).join("、")}过敏`);
  if (prefs?.avoid.length) required.push(`不吃${prefs.avoid.join("、")}`);
  if (prefs && privacy.recordTaste && prefs.tasteNotes?.trim()) {
    const notes = prefs.tasteNotes.trim().replace(/\s+/g, " ");
    optional.push(notes.length > 80 ? `${notes.slice(0, 79)}…` : notes);
  }
  if (prefs && privacy.recordEquipment && prefs.equipment.length) optional.push(`有${prefs.equipment.join("、")}`);
  if (prefs && privacy.recordPantry && prefs.pantry.length) optional.push(`常备${prefs.pantry.join("、")}`);
  if (privacy.recordRatings && rated.good.length) optional.push(`近期好评：${rated.good.slice(0, 5).join("、")}`);
  if (privacy.recordRatings && rated.never.length) optional.push(`不再做：${rated.never.slice(0, 5).join("、")}`);

  let s = required.join("；");
  for (const part of optional) {
    const next = s ? `${s}；${part}` : part;
    if (next.length <= SUMMARY_MAX) s = next;
  }
  return s;
}

const expand = restrictionMatcher(kb.ingredients);

/** 忌口与过敏原的检查规则（knowledge/allergens.yaml 提供过敏原类别到食材关键词的映射） */
export function restrictionKeywords(prefs: Preferences | null): RestrictionRule[] {
  if (!prefs) return [];
  return buildRestrictions(prefs.avoid, prefs.allergens, kb.allergens, expand);
}

/** 近期好评与“不会再做”的菜名；关闭了评价记录则为空 */
export async function ratedDishes(db: Db, userId: string, privacy: Pick<Privacy, "recordRatings">): Promise<RatedDishes> {
  if (!privacy.recordRatings) return { good: [], never: [] };
  const rows = await db
    .select({ verdict: ratings.verdict, nameZh: dishes.nameZh })
    .from(ratings)
    .innerJoin(tutorials, eq(tutorials.id, ratings.tutorialId))
    .innerJoin(dishes, eq(dishes.id, tutorials.dishId))
    .where(and(eq(ratings.userId, userId), inArray(ratings.verdict, ["good", "never"])))
    .orderBy(desc(ratings.createdAt))
    .limit(60);
  const uniq = (v: "good" | "never") => [...new Set(rows.filter((r) => r.verdict === v).map((r) => r.nameZh))];
  const never = uniq("never").slice(0, 30);
  return { good: uniq("good").filter((n) => !never.includes(n)).slice(0, 10), never };
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
