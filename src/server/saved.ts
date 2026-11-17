// 收藏、历史与烹饪记录（PRD F19、F28；设计文档 4.8）。
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db/client";
import { dishes, favorites, tutorials } from "./db/schema";
import { logEvent } from "./events";
import { imageUrl } from "./dishes";
import { loadPersonalization } from "./preferences";

export interface SavedItem {
  tutorialId: string;
  dishId: string;
  nameZh: string;
  cuisineId: string;
  thumbUrl: string | null;
  cookedAt: string | null;
  /** 收藏列表：收藏时间；历史：教程生成时间 */
  at: string;
  favorite: boolean;
}

const HISTORY_LIMIT = 100;

async function ownDoneTutorial(db: Db, userId: string, tutorialId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(tutorialId)) return null;
  const [t] = await db
    .select({ id: tutorials.id })
    .from(tutorials)
    .where(and(eq(tutorials.id, tutorialId), eq(tutorials.userId, userId), eq(tutorials.status, "done")));
  return t ?? null;
}

/** 收藏或取消收藏。不是自己的、或尚未生成完的教程返回 null */
export async function setFavorite(db: Db, userId: string, tutorialId: string, on: boolean, now = new Date()) {
  if (!(await ownDoneTutorial(db, userId, tutorialId))) return null;
  if (on) {
    await db.insert(favorites).values({ userId, tutorialId, createdAt: now }).onConflictDoNothing();
  } else {
    await db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.tutorialId, tutorialId)));
  }
  return on;
}

export async function isFavorite(db: Db, userId: string, tutorialId: string) {
  const [f] = await db
    .select({ id: favorites.tutorialId })
    .from(favorites)
    .where(and(eq(favorites.userId, userId), eq(favorites.tutorialId, tutorialId)));
  return Boolean(f);
}

const itemFields = {
  tutorialId: tutorials.id,
  dishId: dishes.id,
  nameZh: dishes.nameZh,
  cuisineId: dishes.cuisineId,
  imageStatus: dishes.imageStatus,
  imageKey: dishes.imageKey,
  cookedAt: tutorials.cookedAt,
  createdAt: tutorials.createdAt,
};

type Row = {
  tutorialId: string;
  dishId: string;
  nameZh: string;
  cuisineId: string;
  imageStatus: string;
  imageKey: string | null;
  cookedAt: Date | null;
  createdAt: Date;
};

function toItem(r: Row, at: Date, favorite: boolean): SavedItem {
  return {
    tutorialId: r.tutorialId,
    dishId: r.dishId,
    nameZh: r.nameZh,
    cuisineId: r.cuisineId,
    thumbUrl: r.imageStatus === "ready" ? imageUrl(r.imageKey, 384) : null,
    cookedAt: r.cookedAt?.toISOString() ?? null,
    at: at.toISOString(),
    favorite,
  };
}

export async function listFavorites(db: Db, userId: string): Promise<SavedItem[]> {
  const rows = await db
    .select({ ...itemFields, favoritedAt: favorites.createdAt })
    .from(favorites)
    .innerJoin(tutorials, eq(tutorials.id, favorites.tutorialId))
    .innerJoin(dishes, eq(dishes.id, tutorials.dishId))
    .where(eq(favorites.userId, userId))
    .orderBy(desc(favorites.createdAt));
  return rows.map((r) => toItem(r as Row, r.favoritedAt, true));
}

/** 生成过的教程，按时间倒序。关闭了“历史”记录开关时返回 null（页面显示说明而不是空白） */
export async function listHistory(db: Db, userId: string): Promise<SavedItem[] | null> {
  const { privacy } = await loadPersonalization(db, userId);
  if (!privacy.recordHistory) return null;
  const rows = await db
    .select(itemFields)
    .from(tutorials)
    .innerJoin(dishes, eq(dishes.id, tutorials.dishId))
    .where(and(eq(tutorials.userId, userId), eq(tutorials.status, "done")))
    .orderBy(desc(tutorials.createdAt))
    .limit(HISTORY_LIMIT);
  const favIds = rows.length
    ? new Set(
        (
          await db
            .select({ id: favorites.tutorialId })
            .from(favorites)
            .where(and(eq(favorites.userId, userId), inArray(favorites.tutorialId, rows.map((r) => r.tutorialId))))
        ).map((f) => f.id),
      )
    : new Set<string>();
  return rows.map((r) => toItem(r as Row, r.createdAt, favIds.has(r.tutorialId)));
}

export type CookEvent = "start" | "complete";

/** 进入烹饪模式 / 做好了。做好了会在教程上记下时间 */
export async function recordCook(db: Db, userId: string, tutorialId: string, event: CookEvent, now = new Date()) {
  if (!(await ownDoneTutorial(db, userId, tutorialId))) return false;
  await logEvent(db, userId, event === "start" ? "cook_start" : "cook_complete", { tutorialId }, now);
  if (event === "complete") {
    await db.update(tutorials).set({ cookedAt: now }).where(eq(tutorials.id, tutorialId));
  }
  return true;
}
