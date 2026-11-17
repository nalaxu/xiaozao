import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import {
  dishes,
  favorites,
  followups,
  modelCalls,
  preferences,
  privacySettings,
  ratings,
  recommendationRuns,
  tutorials,
  usageDaily,
  users,
} from "./db/schema";
import { DEFAULT_PRIVACY, loadPersonalization, preferenceSummary, ratedDishes } from "./preferences";
import {
  deleteAccount,
  deleteAllData,
  exportData,
  needsWelcome,
  preferencesPatch,
  rateTutorial,
  savePreferences,
  setPrivacy,
} from "./settings";
import { testDb } from "./test-utils";

let db: Db;
let userId: string;
let dishId: string;

async function tutorial(name = "番茄炒蛋") {
  const [d] = await db
    .insert(dishes)
    .values({ cuisineId: "northern-home", nameZh: name, nameZhNorm: name, nameEn: name })
    .onConflictDoNothing()
    .returning();
  const id = d?.id ?? dishId;
  const [t] = await db
    .insert(tutorials)
    .values({ userId, dishId: id, params: {}, content: {}, model: "m", status: "done" })
    .returning();
  return t.id;
}

beforeEach(async () => {
  db = await testDb();
  [{ id: userId }] = await db.insert(users).values({ email: "me@example.test" }).returning();
  [{ id: dishId }] = await db
    .insert(dishes)
    .values({ cuisineId: "thai", nameZh: "冬阴功汤", nameZhNorm: "冬阴功汤", nameEn: "Tom yum" })
    .returning();
});

describe("preferences", () => {
  it("validates and saves a partial patch", async () => {
    expect(preferencesPatch.safeParse({ allergens: ["peanut", "nope"] }).success).toBe(false);
    expect(preferencesPatch.safeParse({ equipment: ["烤箱", "火箭"] }).success).toBe(false);
    expect(preferencesPatch.safeParse({ extra: 1 }).success).toBe(false);
    const patch = preferencesPatch.parse({ allergens: ["peanut", "peanut"], avoid: [" 香菜 "], units: "us" });
    expect(patch.allergens).toEqual(["peanut"]);
    expect(patch.avoid).toEqual(["香菜"]);
    expect(await needsWelcome(db, userId)).toBe(true);
    await savePreferences(db, userId, patch);
    await savePreferences(db, userId, { tasteNotes: "  ", onboarded: true });
    const { prefs } = await loadPersonalization(db, userId);
    expect(prefs).toMatchObject({ allergens: ["peanut"], avoid: ["香菜"], units: "us", tasteNotes: null });
    expect(await needsWelcome(db, userId)).toBe(false);
  });
});

describe("preferenceSummary", () => {
  const prefs = (over: Partial<typeof preferences.$inferSelect> = {}) =>
    ({
      userId: "u",
      allergens: ["shellfish"],
      avoid: ["香菜"],
      equipment: ["烤箱"],
      pantry: ["生抽"],
      tasteNotes: "偏爱酸辣",
      units: "metric",
      lastFlavors: [],
      lastScene: null,
      lastCuisine: null,
      onboardedAt: null,
      updatedAt: new Date(),
      ...over,
    }) as typeof preferences.$inferSelect;

  it("puts allergies first, uses labels and respects switches", () => {
    const s = preferenceSummary(prefs(), DEFAULT_PRIVACY, { good: ["鱼香茄子"], never: ["法式洋葱汤"] });
    expect(s).toBe("对甲壳类与贝类过敏；不吃香菜；偏爱酸辣；有烤箱；常备生抽；近期好评：鱼香茄子；不再做：法式洋葱汤");
    const off = preferenceSummary(prefs(), { ...DEFAULT_PRIVACY, recordTaste: false, recordRatings: false, recordPantry: false }, {
      good: ["鱼香茄子"],
      never: [],
    });
    expect(off).toBe("对甲壳类与贝类过敏；不吃香菜；有烤箱");
  });

  it("never truncates allergies, drops optional parts that do not fit", () => {
    const avoid = Array.from({ length: 40 }, (_, i) => `食材${i}`);
    const s = preferenceSummary(prefs({ avoid }), DEFAULT_PRIVACY);
    expect(s.startsWith("对甲壳类与贝类过敏；不吃食材0、")).toBe(true);
    expect(s).toContain("食材39");
    expect(s).not.toContain("偏爱酸辣");
    expect(preferenceSummary(prefs({ tasteNotes: "很".repeat(300) }), DEFAULT_PRIVACY).length).toBeLessThanOrEqual(150);
  });
});

describe("ratings", () => {
  it("records the latest verdict and feeds good / never lists", async () => {
    const t1 = await tutorial("番茄炒蛋");
    const t2 = await tutorial("法式洋葱汤");
    expect(await rateTutorial(db, userId, { tutorialId: t1, verdict: "ok" })).toEqual({ ok: true, recorded: true });
    await rateTutorial(db, userId, { tutorialId: t1, verdict: "good", reason: " 酸甜刚好 " });
    await rateTutorial(db, userId, { tutorialId: t2, verdict: "never" });
    const rows = await db.select().from(ratings);
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.tutorialId === t1)).toMatchObject({ verdict: "good", reason: "酸甜刚好" });
    expect(await ratedDishes(db, userId, DEFAULT_PRIVACY)).toEqual({ good: ["番茄炒蛋"], never: ["法式洋葱汤"] });
  });

  it("does not store ratings when the switch is off, and rejects others' tutorials", async () => {
    const t = await tutorial();
    await setPrivacy(db, userId, "recordRatings", false);
    expect(await rateTutorial(db, userId, { tutorialId: t, verdict: "good" })).toEqual({ ok: true, recorded: false });
    expect(await db.select().from(ratings)).toHaveLength(0);
    const [{ id: other }] = await db.insert(users).values({ email: "x@example.test" }).returning();
    expect(await rateTutorial(db, other, { tutorialId: t, verdict: "good" })).toEqual({ ok: false });
  });
});

describe("privacy switches", () => {
  it("turning history off with purge keeps favorited tutorials only", async () => {
    const kept = await tutorial("番茄炒蛋");
    const gone = await tutorial("法式洋葱汤");
    await db.insert(favorites).values({ userId, tutorialId: kept });
    await db.insert(recommendationRuns).values({ userId, input: {}, cacheKey: "k" });
    await setPrivacy(db, userId, "recordHistory", false, true);
    const left = (await db.select({ id: tutorials.id }).from(tutorials)).map((t) => t.id);
    expect(left).toEqual([kept]);
    expect(left).not.toContain(gone);
    expect(await db.select().from(recommendationRuns)).toHaveLength(0);
    const { privacy } = await loadPersonalization(db, userId);
    expect(privacy.recordHistory).toBe(false);
    expect(privacy.recordTaste).toBe(true);
  });

  it("turning equipment off without purge keeps the data", async () => {
    await savePreferences(db, userId, { equipment: ["烤箱"] });
    await setPrivacy(db, userId, "recordEquipment", false);
    expect((await loadPersonalization(db, userId)).prefs?.equipment).toEqual(["烤箱"]);
    await setPrivacy(db, userId, "recordEquipment", false, true);
    expect((await loadPersonalization(db, userId)).prefs?.equipment).toEqual([]);
  });
});

describe("export and deletion", () => {
  async function seed() {
    await savePreferences(db, userId, { allergens: ["egg"], avoid: ["香菜"], onboarded: true });
    const t = await tutorial();
    await db.insert(favorites).values({ userId, tutorialId: t });
    await db.insert(followups).values({ userId, tutorialId: t, question: "能提前做吗", answer: "可以" });
    await rateTutorial(db, userId, { tutorialId: t, verdict: "good" });
    await db.insert(usageDaily).values({ userId, day: "2026-11-17", tutorial: 2 });
    await db.insert(modelCalls).values({ userId, feature: "tutorial", model: "m", status: "ok" });
    await db.insert(privacySettings).values({ userId, recordTaste: false });
    return t;
  }

  it("exports everything that belongs to the user", async () => {
    const t = await seed();
    const data = await exportData(db, userId);
    expect(data.account?.email).toBe("me@example.test");
    expect(data.preferences).toMatchObject({ allergens: ["egg"], avoid: ["香菜"] });
    expect(data.privacy.recordTaste).toBe(false);
    expect(data.tutorials).toHaveLength(1);
    expect(data.tutorials[0]).toMatchObject({ id: t, favorite: true });
    expect(data.ratings[0].verdict).toBe("good");
    expect(data.followups[0].answer).toBe("可以");
    expect(JSON.stringify(data)).not.toContain(userId);
  });

  it("deleteAllData clears personal data but keeps the account and today's usage", async () => {
    await seed();
    await deleteAllData(db, userId);
    for (const table of [tutorials, favorites, followups, ratings, privacySettings]) {
      expect(await db.select().from(table)).toHaveLength(0);
    }
    const { prefs } = await loadPersonalization(db, userId);
    expect(prefs?.allergens).toEqual([]);
    expect(await needsWelcome(db, userId)).toBe(false);
    expect(await db.select().from(usageDaily)).toHaveLength(1);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(1);
  });

  it("deleteAccount removes the user and detaches the cost ledger", async () => {
    await seed();
    await deleteAccount(db, userId);
    expect(await db.select().from(users).where(eq(users.id, userId))).toHaveLength(0);
    expect(await db.select().from(tutorials)).toHaveLength(0);
    expect(await db.select().from(preferences)).toHaveLength(0);
    const [call] = await db.select().from(modelCalls);
    expect(call.userId).toBeNull();
  });
});
