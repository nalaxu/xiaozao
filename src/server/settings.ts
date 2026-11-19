// 个性化设置、评价、隐私开关、导出与删除（PRD 7、F27–F31；设计文档 4.7、4.10、4.12）。
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import {
  EQUIPMENT,
  HOUSEHOLDS,
  LIMITS,
  PRIVACY_KEYS,
  SKILLS,
  SPICES,
  TIME_BUDGETS,
  VERDICTS,
  type PrivacyKey,
  type Verdict,
} from "@/lib/preference-options";
import { ALLERGEN_IDS } from "@/lib/kb/schema";
import type { Db } from "./db/client";
import {
  dishes,
  favorites,
  followups,
  preferences,
  privacySettings,
  ratings,
  recommendationRuns,
  tutorials,
  users,
} from "./db/schema";
import { logEvent } from "./events";
import { DEFAULT_PRIVACY, loadPersonalization } from "./preferences";
import { imageUrl } from "./dishes";

// ─── 偏好 ──────────────────────────────────────────────────

const term = z.string().trim().min(1).max(LIMITS.term);
const uniq = (a: string[]) => [...new Set(a)];

export const preferencesPatch = z
  .object({
    allergens: z.array(z.enum(ALLERGEN_IDS)).max(ALLERGEN_IDS.length).transform(uniq),
    avoid: z.array(term).max(LIMITS.avoid).transform(uniq),
    equipment: z.array(z.enum(EQUIPMENT)).max(EQUIPMENT.length).transform(uniq),
    pantry: z.array(term).max(LIMITS.pantry).transform(uniq),
    tasteNotes: z.string().max(LIMITS.tasteNotes).nullable(),
    units: z.enum(["metric", "us"]),
    // 做饭习惯，null 为清除
    skill: z.enum(SKILLS).nullable(),
    timeBudget: z.union(TIME_BUDGETS.map((n) => z.literal(n))).nullable(),
    spice: z.enum(SPICES).nullable(),
    household: z.union(HOUSEHOLDS.map((n) => z.literal(n))).nullable(),
    /** 欢迎页保存或点“以后再说”时为 true */
    onboarded: z.literal(true),
  })
  .partial()
  .strict();

export type PreferencesPatch = z.infer<typeof preferencesPatch>;

export async function savePreferences(db: Db, userId: string, patch: PreferencesPatch, now = new Date()) {
  const { onboarded, tasteNotes, ...rest } = patch;
  const values = {
    ...rest,
    ...(tasteNotes !== undefined ? { tasteNotes: tasteNotes?.trim() || null } : {}),
    ...(onboarded ? { onboardedAt: now } : {}),
    updatedAt: now,
  };
  await db
    .insert(preferences)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: preferences.userId, set: values });
}

/** 新注册用户还没看过欢迎页 */
export async function needsWelcome(db: Db, userId: string) {
  const [p] = await db.select({ at: preferences.onboardedAt }).from(preferences).where(eq(preferences.userId, userId));
  return !p?.at;
}

// ─── 评价 ──────────────────────────────────────────────────

/** 记录评价（同一份教程只留最新一次）。关闭了评价记录则不保存，返回 recorded: false */
export async function rateTutorial(
  db: Db,
  userId: string,
  input: { tutorialId: string; verdict: Verdict; reason?: string | null },
  now = new Date(),
): Promise<{ ok: false } | { ok: true; recorded: boolean }> {
  if (!/^[0-9a-f-]{36}$/i.test(input.tutorialId)) return { ok: false };
  const [t] = await db
    .select({ id: tutorials.id })
    .from(tutorials)
    .where(and(eq(tutorials.id, input.tutorialId), eq(tutorials.userId, userId), eq(tutorials.status, "done")));
  if (!t) return { ok: false };
  const { privacy } = await loadPersonalization(db, userId);
  if (!privacy.recordRatings) return { ok: true, recorded: false };
  const reason = input.reason?.trim().slice(0, LIMITS.reason) || null;
  await db
    .insert(ratings)
    .values({ userId, tutorialId: t.id, verdict: input.verdict, reason, createdAt: now })
    .onConflictDoUpdate({ target: [ratings.userId, ratings.tutorialId], set: { verdict: input.verdict, reason, createdAt: now } });
  await logEvent(db, userId, "rating", { verdict: input.verdict, tutorialId: t.id }, now);
  return { ok: true, recorded: true };
}

export const ratingInput = z.object({
  tutorialId: z.string().uuid(),
  verdict: z.enum(VERDICTS),
  reason: z.string().max(LIMITS.reason).nullable().optional(),
});

export async function removeRating(db: Db, userId: string, tutorialId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(tutorialId)) return;
  await db.delete(ratings).where(and(eq(ratings.userId, userId), eq(ratings.tutorialId, tutorialId)));
}

export async function myRating(db: Db, userId: string, tutorialId: string): Promise<Verdict | null> {
  const [r] = await db
    .select({ verdict: ratings.verdict })
    .from(ratings)
    .where(and(eq(ratings.userId, userId), eq(ratings.tutorialId, tutorialId)));
  return r?.verdict ?? null;
}

/** “我的口味”页：好评与“不会再做”的菜，可逐条移除 */
export async function listRatings(db: Db, userId: string) {
  const rows = await db
    .select({
      tutorialId: ratings.tutorialId,
      verdict: ratings.verdict,
      reason: ratings.reason,
      createdAt: ratings.createdAt,
      nameZh: dishes.nameZh,
      cuisineId: dishes.cuisineId,
    })
    .from(ratings)
    .innerJoin(tutorials, eq(tutorials.id, ratings.tutorialId))
    .innerJoin(dishes, eq(dishes.id, tutorials.dishId))
    .where(and(eq(ratings.userId, userId), inArray(ratings.verdict, ["good", "never"])))
    .orderBy(desc(ratings.createdAt))
    .limit(50);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

// ─── 隐私开关与删除 ─────────────────────────────────────────

export const privacyPatch = z.object({ key: z.enum(PRIVACY_KEYS), on: z.boolean(), purge: z.boolean().optional() }).strict();

/** 删除某一类已记录的数据（关闭开关时可选） */
export async function purgeCategory(db: Db, userId: string, key: PrivacyKey) {
  const now = new Date();
  switch (key) {
    case "recordTaste":
      await db
        .update(preferences)
        .set({
          tasteNotes: null,
          lastFlavors: [],
          lastScene: null,
          lastCuisine: null,
          skill: null,
          timeBudget: null,
          spice: null,
          household: null,
          updatedAt: now,
        })
        .where(eq(preferences.userId, userId));
      return;
    case "recordEquipment":
      await db.update(preferences).set({ equipment: [], updatedAt: now }).where(eq(preferences.userId, userId));
      return;
    case "recordPantry":
      await db.update(preferences).set({ pantry: [], updatedAt: now }).where(eq(preferences.userId, userId));
      return;
    case "recordRatings":
      await db.delete(ratings).where(eq(ratings.userId, userId));
      return;
    case "recordHistory": {
      // 推荐记录全部删除；教程只留收藏的（收藏单独管理，PRD F19）
      await db.delete(recommendationRuns).where(eq(recommendationRuns.userId, userId));
      const kept = (
        await db.select({ id: favorites.tutorialId }).from(favorites).where(eq(favorites.userId, userId))
      ).map((f) => f.id);
      await db
        .delete(tutorials)
        .where(kept.length ? and(eq(tutorials.userId, userId), notInArray(tutorials.id, kept)) : eq(tutorials.userId, userId));
      return;
    }
  }
}

export async function setPrivacy(db: Db, userId: string, key: PrivacyKey, on: boolean, purge = false) {
  const now = new Date();
  await db
    .insert(privacySettings)
    .values({ userId, ...DEFAULT_PRIVACY, [key]: on, updatedAt: now })
    .onConflictDoUpdate({ target: privacySettings.userId, set: { [key]: on, updatedAt: now } });
  if (!on && purge) await purgeCategory(db, userId, key);
}

/**
 * 删除全部个性化数据：偏好（含忌口与过敏）、隐私开关恢复默认、推荐记录、教程（连带收藏、评价、追问）。
 * 当天的额度计数与花费账本保留，否则删数据就能绕过每日额度。账号本身保留。
 */
export async function deleteAllData(db: Db, userId: string) {
  await db.delete(recommendationRuns).where(eq(recommendationRuns.userId, userId));
  await db.delete(tutorials).where(eq(tutorials.userId, userId));
  await db.delete(ratings).where(eq(ratings.userId, userId));
  await db.delete(favorites).where(eq(favorites.userId, userId));
  await db.delete(followups).where(eq(followups.userId, userId));
  // 保留 onboarded_at，免得再被带去欢迎页
  const [p] = await db.select({ at: preferences.onboardedAt }).from(preferences).where(eq(preferences.userId, userId));
  await db.delete(preferences).where(eq(preferences.userId, userId));
  if (p?.at) await db.insert(preferences).values({ userId, onboardedAt: p.at });
  await db.delete(privacySettings).where(eq(privacySettings.userId, userId));
}

/** 注销：删除账号，相关数据随外键级联删除；花费账本里的记录只去掉账号关联 */
export async function deleteAccount(db: Db, userId: string) {
  await db.delete(users).where(eq(users.id, userId));
}

// ─── 导出 ──────────────────────────────────────────────────

export async function exportData(db: Db, userId: string) {
  const [user] = await db
    .select({ email: users.email, displayName: users.displayName, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  const { prefs, privacy } = await loadPersonalization(db, userId);
  const tuts = await db
    .select({
      id: tutorials.id,
      dish: dishes.nameZh,
      cuisineId: dishes.cuisineId,
      imageStatus: dishes.imageStatus,
      imageKey: dishes.imageKey,
      status: tutorials.status,
      params: tutorials.params,
      content: tutorials.content,
      cookedAt: tutorials.cookedAt,
      createdAt: tutorials.createdAt,
    })
    .from(tutorials)
    .innerJoin(dishes, eq(dishes.id, tutorials.dishId))
    .where(eq(tutorials.userId, userId))
    .orderBy(desc(tutorials.createdAt));
  const favs = await db.select().from(favorites).where(eq(favorites.userId, userId));
  const rates = await db.select().from(ratings).where(eq(ratings.userId, userId));
  const qs = await db.select().from(followups).where(eq(followups.userId, userId));
  const runs = await db
    .select({ input: recommendationRuns.input, dishes: recommendationRuns.dishes, createdAt: recommendationRuns.createdAt })
    .from(recommendationRuns)
    .where(eq(recommendationRuns.userId, userId))
    .orderBy(desc(recommendationRuns.createdAt));
  const favIds = new Set(favs.map((f) => f.tutorialId));
  return {
    exportedAt: new Date().toISOString(),
    account: user ?? null,
    preferences: prefs
      ? {
          allergens: prefs.allergens,
          avoid: prefs.avoid,
          equipment: prefs.equipment,
          pantry: prefs.pantry,
          tasteNotes: prefs.tasteNotes,
          units: prefs.units,
          skill: prefs.skill,
          timeBudget: prefs.timeBudget,
          spice: prefs.spice,
          household: prefs.household,
          lastFlavors: prefs.lastFlavors,
          lastScene: prefs.lastScene,
          lastCuisine: prefs.lastCuisine,
        }
      : null,
    privacy: Object.fromEntries(PRIVACY_KEYS.map((k) => [k, privacy[k]])),
    tutorials: tuts.map((t) => ({
      id: t.id,
      dish: t.dish,
      cuisineId: t.cuisineId,
      image: t.imageStatus === "ready" ? imageUrl(t.imageKey, 768) : null,
      status: t.status,
      params: t.params,
      content: t.content,
      favorite: favIds.has(t.id),
      cookedAt: t.cookedAt,
      createdAt: t.createdAt,
    })),
    ratings: rates.map((r) => ({ tutorialId: r.tutorialId, verdict: r.verdict, reason: r.reason, createdAt: r.createdAt })),
    followups: qs
      .filter((q) => q.answer !== null)
      .map((q) => ({ tutorialId: q.tutorialId, question: q.question, answer: q.answer, createdAt: q.createdAt })),
    recommendations: runs,
  };
}
