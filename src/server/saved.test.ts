import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "./db/client";
import { dishes, events, privacySettings, tutorials, users } from "./db/schema";
import { at, plus, testDb } from "./test-utils";
import { listFavorites, listHistory, recordCook, setFavorite } from "./saved";
import { readTutorial } from "./tutorial/read";

let db: Db;
let userId: string;
let otherId: string;
let dishId: string;
const now = at("2026-11-17T10:00:00Z");

async function tutorial(owner: string, status: "done" | "streaming" = "done", createdAt = now) {
  const [t] = await db
    .insert(tutorials)
    .values({ userId: owner, dishId, params: { servings: 2 }, content: status === "done" ? {} : null, model: "m", status, createdAt })
    .returning();
  return t.id;
}

beforeEach(async () => {
  db = await testDb();
  [{ id: userId }] = await db.insert(users).values({ email: "a@example.test" }).returning();
  [{ id: otherId }] = await db.insert(users).values({ email: "b@example.test" }).returning();
  [{ id: dishId }] = await db
    .insert(dishes)
    .values({ cuisineId: "thai", nameZh: "冬阴功汤", nameZhNorm: "冬阴功汤", nameEn: "Tom yum", imageStatus: "ready", imageKey: "dishes/x" })
    .returning();
});

describe("favorites", () => {
  it("adds and removes favorites idempotently, newest first", async () => {
    const t1 = await tutorial(userId);
    const t2 = await tutorial(userId);
    expect(await setFavorite(db, userId, t1, true, now)).toBe(true);
    expect(await setFavorite(db, userId, t1, true, now)).toBe(true);
    await setFavorite(db, userId, t2, true, plus(now, 60));
    const list = await listFavorites(db, userId);
    expect(list.map((f) => f.tutorialId)).toEqual([t2, t1]);
    expect(list[0].thumbUrl).toMatch(/dishes\/x\/384\.webp$/);
    expect((await readTutorial(db, userId, t1))?.favorite).toBe(true);
    expect(await setFavorite(db, userId, t1, false)).toBe(false);
    expect((await listFavorites(db, userId)).map((f) => f.tutorialId)).toEqual([t2]);
  });

  it("refuses other users' and unfinished tutorials", async () => {
    expect(await setFavorite(db, userId, await tutorial(otherId), true)).toBeNull();
    expect(await setFavorite(db, userId, await tutorial(userId, "streaming"), true)).toBeNull();
    expect(await setFavorite(db, userId, "not-a-uuid", true)).toBeNull();
    expect(await listFavorites(db, userId)).toEqual([]);
  });
});

describe("history", () => {
  it("lists finished tutorials newest first with favorite marks", async () => {
    const older = await tutorial(userId, "done", now);
    const newer = await tutorial(userId, "done", plus(now, 3600));
    await tutorial(userId, "streaming");
    await tutorial(otherId);
    await setFavorite(db, userId, older, true);
    const list = await listHistory(db, userId);
    expect(list?.map((h) => [h.tutorialId, h.favorite])).toEqual([
      [newer, false],
      [older, true],
    ]);
  });

  it("returns null when the history switch is off", async () => {
    await tutorial(userId);
    await db.insert(privacySettings).values({ userId, recordHistory: false });
    expect(await listHistory(db, userId)).toBeNull();
  });
});

describe("recordCook", () => {
  it("logs start and complete events and marks the tutorial cooked", async () => {
    const t = await tutorial(userId);
    expect(await recordCook(db, userId, t, "start", now)).toBe(true);
    expect((await readTutorial(db, userId, t))?.cookedAt).toBeNull();
    expect(await recordCook(db, userId, t, "complete", plus(now, 1200))).toBe(true);
    expect((await readTutorial(db, userId, t))?.cookedAt).toBe("2026-11-17T10:20:00.000Z");
    const names = (await db.select().from(events).where(eq(events.userId, userId))).map((e) => e.name).sort();
    expect(names).toEqual(["cook_complete", "cook_start"]);
    expect(await recordCook(db, otherId, t, "complete")).toBe(false);
  });
});
