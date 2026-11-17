// 一次“获取推荐”或“换一批”的完整流程（技术方案 7.3）：
// 预占额度 → 整理输入 → 查缓存 → 流式调用并逐道后检查 → 不足 3 道补一次 → 记录与缓存。
import { and, eq, gt } from "drizzle-orm";
import type { RecommendEvent, RecommendInput, RecommendedDish } from "@/lib/recommend-types";
import { ArrayItemExtractor } from "@/lib/json-stream";
import { sha256 } from "../crypto";
import type { Db } from "../db/client";
import { recommendationCache, recommendationRuns } from "../db/schema";
import { dishImages, findOrCreateDish, libraryDishes } from "../dishes";
import { enqueueImage } from "../images/queue";
import {
  loadPersonalization,
  preferenceSummary,
  recentRecommendations,
  restrictionKeywords,
  saveLastChoices,
} from "../preferences";
import { nextReset, refundQuota, reserveQuota } from "../usage";
import { BudgetPausedError, callModel } from "../ai/call";
import { ModelError } from "../ai/types";
import { buildContext, pickCuisines } from "./candidates";
import {
  MAX_DISHES,
  MIN_DISHES,
  checkDish,
  dishNameNorm,
  rawDishSchema,
  recommendRequest,
  type RawDish,
  type RejectReason,
} from "./model";

export const CACHE_HOURS = 24;

interface RunUser {
  id: string;
  role: "user" | "admin";
}

type Emit = (e: RecommendEvent) => void;

export function cacheKey(parts: {
  main: string[];
  other: string[];
  flavors: string[];
  scene: string | null;
  cuisine: string | null;
  summary: string;
  exclude: string[];
}): string {
  const sorted = (a: string[]) => [...a].sort();
  return sha256(
    JSON.stringify([
      sorted(parts.main),
      sorted(parts.other),
      sorted(parts.flavors),
      parts.scene,
      parts.cuisine,
      parts.summary,
      sorted(parts.exclude),
    ]),
  );
}

/** 返回这次新排进图片队列的菜，由接口在响应结束后立即处理 */
export async function runRecommend(
  db: Db,
  user: RunUser,
  input: RecommendInput,
  emit: Emit,
  now = new Date(),
): Promise<{ queuedImages: string[] }> {
  const queuedImages: string[] = [];
  const quota = await reserveQuota(db, user, "recommend", now);
  if (!quota.ok) {
    emit({
      type: "error",
      code: "quota",
      error: "今天的推荐次数用完了",
      refunded: false,
      resetAt: nextReset(now).toISOString(),
    });
    return { queuedImages };
  }
  const remaining = user.role === "admin" ? null : quota.remaining;

  const { prefs, privacy } = await loadPersonalization(db, user.id);
  const summary = preferenceSummary(prefs, privacy);
  const keywords = restrictionKeywords(prefs);
  const recent = privacy.recordHistory ? await recentRecommendations(db, user.id, 14, now) : { names: [], cuisines: [] };
  const exclude = [...new Set([...input.exclude, ...recent.names])].slice(0, 80);
  const candidates = pickCuisines({
    main: input.main,
    flavors: input.flavors,
    cuisine: input.cuisine,
    recentCuisines: recent.cuisines,
  });

  const key = cacheKey({ ...input, summary, exclude });
  await saveLastChoices(db, user.id, privacy, input);

  // ─── 缓存命中：仍计一次额度，但不调用模型 ───
  const [cached] = await db
    .select()
    .from(recommendationCache)
    .where(and(eq(recommendationCache.cacheKey, key), gt(recommendationCache.expiresAt, now)));
  if (cached) {
    const dishes = cached.result as RecommendedDish[];
    const images = await dishImages(db, dishes.map((d) => d.dishId));
    emit({ type: "start", remaining, cached: true });
    for (const d of dishes) emit({ type: "dish", dish: { ...d, imageUrl: images[d.dishId] ?? null } });
    const runId = await saveRun(db, user.id, input, key, dishes);
    emit({ type: "done", runId, note: shortNote(dishes.length, false) });
    return { queuedImages };
  }

  emit({ type: "start", remaining, cached: false });

  const accepted: RecommendedDish[] = [];
  const seen = new Set(exclude.map(dishNameNorm));
  const rejected: { name: string; reason: RejectReason }[] = [];
  const library = await libraryDishes(db, candidates, input.main);
  const context = buildContext({ candidates, scene: input.scene, libraryDishes: library });

  const consider = async (d: RawDish) => {
    if (accepted.length >= MAX_DISHES) return;
    const reason = checkDish(d, { candidates, scene: input.scene, keywords, seen });
    seen.add(dishNameNorm(d.name_zh));
    if (reason) {
      rejected.push({ name: d.name_zh, reason });
      return;
    }
    const ref = await findOrCreateDish(db, {
      cuisineId: d.cuisine_id,
      nameZh: d.name_zh,
      nameEn: d.name_en,
      nameOriginal: d.name_original,
      visual: d.visual,
    });
    if (ref.imageStatus === "none" && (await enqueueImage(db, ref.id, now))) queuedImages.push(ref.id);
    const dish: RecommendedDish = {
      dishId: ref.id,
      nameZh: d.name_zh,
      nameEn: d.name_en,
      nameOriginal: d.name_original,
      cuisineId: d.cuisine_id,
      flavorTags: d.flavor_tags,
      summary: d.summary,
      totalMinutes: d.total_minutes,
      difficulty: d.difficulty,
      uses: d.uses,
      toBuy: d.to_buy,
      imageUrl: ref.imageUrl,
    };
    accepted.push(dish);
    emit({ type: "dish", dish });
  };

  const attempt = async (count: number, avoidCuisines?: string[]) => {
    const req = recommendRequest({
      params: input,
      candidates,
      context,
      summary,
      exclude: [...exclude, ...accepted.map((d) => d.nameZh), ...rejected.map((r) => r.name)],
      count,
      avoidCuisines,
    });
    const extractor = new ArrayItemExtractor<unknown>("dishes");
    // 流式回调是同步的，后检查与写库需要按顺序异步进行
    let chain = Promise.resolve();
    const onItem = (item: unknown) => {
      const parsed = rawDishSchema.safeParse(item);
      if (!parsed.success) {
        rejected.push({ name: String((item as { name_zh?: unknown })?.name_zh ?? "?"), reason: "invalid" });
        return;
      }
      chain = chain.then(() => consider(parsed.data));
    };
    try {
      await callModel(db, user.id, req, (chunk) => extractor.push(chunk).forEach(onItem));
    } finally {
      await chain;
    }
  };

  let failure: unknown = null;
  try {
    await attempt(MAX_DISHES);
    // 不足 3 道，或没指定菜系却都来自同一菜系：补一次，不另扣额度
    const cuisines = new Set(accepted.map((d) => d.cuisineId));
    const needDiversity = !input.cuisine && candidates.length > 1 && accepted.length > 0 && cuisines.size < 2;
    if (accepted.length < MIN_DISHES || needDiversity) {
      const count = Math.max(1, MAX_DISHES - accepted.length);
      await attempt(count, needDiversity ? [...cuisines] : undefined);
    }
  } catch (e) {
    failure = e;
  }

  if (!accepted.length) {
    await refundQuota(db, user.id, "recommend", now);
    if (failure instanceof BudgetPausedError) {
      emit({
        type: "error",
        code: "budget_paused",
        error: "今天的生成名额已满",
        refunded: true,
        resetAt: nextReset(now).toISOString(),
      });
    } else {
      if (failure && !(failure instanceof ModelError)) console.error("recommend failed", failure);
      emit({ type: "error", code: "model", error: "这次没生成出来，次数已退回。再试一次？", refunded: true });
    }
    return { queuedImages };
  }

  const runId = await saveRun(db, user.id, input, key, accepted);
  if (!failure) {
    await db
      .insert(recommendationCache)
      .values({ cacheKey: key, result: accepted, expiresAt: new Date(now.getTime() + CACHE_HOURS * 3600_000) })
      .onConflictDoUpdate({
        target: recommendationCache.cacheKey,
        set: { result: accepted, expiresAt: new Date(now.getTime() + CACHE_HOURS * 3600_000) },
      });
  }
  const restricted = rejected.some((r) => r.reason === "restricted");
  emit({ type: "done", runId, note: shortNote(accepted.length, restricted) });
  return { queuedImages };
}

function shortNote(count: number, restricted: boolean): string | null {
  if (count >= MIN_DISHES) return null;
  return restricted ? `考虑到你的忌口，这次只找到 ${count} 道合适的。` : `这次只找到 ${count} 道合适的。`;
}

async function saveRun(db: Db, userId: string, input: RecommendInput, key: string, dishes: RecommendedDish[]) {
  const [row] = await db
    .insert(recommendationRuns)
    .values({ userId, input, cacheKey: key, dishIds: dishes.map((d) => d.dishId), dishes })
    .returning({ id: recommendationRuns.id });
  return row.id;
}
