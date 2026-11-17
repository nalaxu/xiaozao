// 菜品词典兼图片库（技术方案 8.1）。M2 只做查找或新建；图片生成在 M3。
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "./db/client";
import { dishAliases, dishes } from "./db/schema";
import { imageBaseUrl } from "./images/storage";
import { dishNameNorm } from "./recommend/model";

export interface DishRef {
  id: string;
  imageUrl: string | null;
  imageStatus: "none" | "queued" | "generating" | "ready" | "failed";
}

export function imageUrl(imageKey: string | null, size: 384 | 768 = 384): string | null {
  const base = imageBaseUrl();
  if (!imageKey || !base) return null;
  return `${base}/${imageKey}/${size}.webp`;
}

/** 按 (菜系, 归一菜名) 查找，先查别名表；没有则新建。每次调用计一次 times_recommended */
export async function findOrCreateDish(
  db: Db,
  d: { cuisineId: string; nameZh: string; nameEn: string; nameOriginal: string | null; visual: string },
): Promise<DishRef> {
  const norm = dishNameNorm(d.nameZh);
  const [alias] = await db
    .select({ dishId: dishAliases.dishId })
    .from(dishAliases)
    .where(and(eq(dishAliases.cuisineId, d.cuisineId), eq(dishAliases.aliasNorm, norm)));
  if (alias) {
    const [row] = await db
      .update(dishes)
      .set({ timesRecommended: sql`${dishes.timesRecommended} + 1` })
      .where(eq(dishes.id, alias.dishId))
      .returning({ id: dishes.id, imageKey: dishes.imageKey, imageStatus: dishes.imageStatus });
    if (row) return { id: row.id, imageStatus: row.imageStatus, imageUrl: row.imageStatus === "ready" ? imageUrl(row.imageKey) : null };
  }
  const [row] = await db
    .insert(dishes)
    .values({
      cuisineId: d.cuisineId,
      nameZh: d.nameZh,
      nameZhNorm: norm,
      nameEn: d.nameEn,
      nameOriginal: d.nameOriginal,
      visual: d.visual,
      timesRecommended: 1,
    })
    .onConflictDoUpdate({
      target: [dishes.cuisineId, dishes.nameZhNorm],
      set: {
        timesRecommended: sql`${dishes.timesRecommended} + 1`,
        visual: sql`coalesce(${dishes.visual}, excluded.visual)`,
      },
    })
    .returning({ id: dishes.id, imageKey: dishes.imageKey, imageStatus: dishes.imageStatus });
  return { id: row.id, imageStatus: row.imageStatus, imageUrl: row.imageStatus === "ready" ? imageUrl(row.imageKey) : null };
}

/** 图片库参考：候选菜系里已有图的菜，优先名称含主料的，最多 20 道（技术方案 7.3 第 4 步） */
export async function libraryDishes(db: Db, cuisineIds: string[], main: string[], limit = 20) {
  if (!cuisineIds.length) return [];
  const rows = await db
    .select({ cuisineId: dishes.cuisineId, nameZh: dishes.nameZh, times: dishes.timesRecommended })
    .from(dishes)
    .where(and(inArray(dishes.cuisineId, cuisineIds), eq(dishes.imageStatus, "ready")))
    .limit(500);
  const score = (name: string) => main.filter((m) => m && name.includes(m)).length;
  return rows
    .sort((a, b) => score(b.nameZh) - score(a.nameZh) || b.times - a.times)
    .slice(0, limit)
    .map(({ cuisineId, nameZh }) => ({ cuisineId, nameZh }));
}

export async function dishImages(
  db: Db,
  ids: string[],
  size: 384 | 768 = 384,
): Promise<Record<string, string | null>> {
  if (!ids.length) return {};
  const rows = await db
    .select({ id: dishes.id, imageKey: dishes.imageKey, imageStatus: dishes.imageStatus })
    .from(dishes)
    .where(inArray(dishes.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.imageStatus === "ready" ? imageUrl(r.imageKey, size) : null]));
}
