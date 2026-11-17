// 推荐的输入整理：候选菜系与知识库上下文（技术方案 7.3 第 1–4 步），由服务端决定，不交给模型判断。
import { normKey } from "@/lib/ingredients";
import { getScene, kb, type Cuisine } from "@/lib/kb";

export const MAX_CANDIDATES = 6;

export interface CandidateInput {
  main: string[];
  flavors: string[];
  cuisine: string | null;
  /** 近期推荐过的菜系，什么都没选时往后排 */
  recentCuisines?: string[];
  random?: () => number;
}

function overlap(c: Cuisine, ingredients: string[]): number {
  if (!ingredients.length) return 0;
  const common = new Set(c.common_ingredients.map(normKey));
  return ingredients.filter((i) => common.has(normKey(i))).length;
}

export function pickCuisines(input: CandidateInput): string[] {
  if (input.cuisine && kb.cuisines.some((c) => c.id === input.cuisine)) return [input.cuisine];
  const random = input.random ?? Math.random;

  if (input.flavors.length) {
    const scored = kb.cuisines.map((c) => {
      let hits = 0;
      let firstPos = 99;
      for (const fid of input.flavors) {
        const f = kb.flavors.find((x) => x.id === fid);
        const pos = f?.cuisines.indexOf(c.id) ?? -1;
        if (pos >= 0) {
          hits++;
          firstPos = Math.min(firstPos, pos);
        }
      }
      // flavors.yaml 未列出、但菜系自身味型含该味道的，作为次一级候选
      const tagHits = input.flavors.filter((f) => c.flavor_tags.includes(f)).length;
      return { id: c.id, hits, tagHits, firstPos, overlap: overlap(c, input.main) };
    });
    const ranked = scored
      .filter((s) => s.hits > 0 || s.tagHits > 0)
      .sort(
        (a, b) =>
          b.hits - a.hits || b.tagHits - a.tagHits || b.overlap - a.overlap || a.firstPos - b.firstPos,
      )
      .map((s) => s.id);
    // 保证至少 2 个菜系，结果才能跨菜系（7.3 多样性）
    if (ranked.length < 2) {
      const extra = kb.cuisines
        .filter((c) => !ranked.includes(c.id))
        .sort((a, b) => overlap(b, input.main) - overlap(a, input.main))
        .map((c) => c.id);
      ranked.push(...extra.slice(0, 2 - ranked.length));
    }
    return ranked.slice(0, MAX_CANDIDATES);
  }

  // 什么都没选：按食材重合度，加一点随机，近期推荐过的往后排
  const recent = new Set(input.recentCuisines ?? []);
  return kb.cuisines
    .map((c) => ({ id: c.id, score: overlap(c, input.main) * 2 + random() * 1.5 - (recent.has(c.id) ? 2 : 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.id);
}

/** 每个候选菜系的精简条目（约 200 token/个） */
export function cuisineBrief(c: Cuisine): string {
  const overview = c.overview.length > 140 ? `${c.overview.slice(0, 140)}…` : c.overview;
  return [
    `### ${c.id}（${c.name.zh} / ${c.name.en}）`,
    `概述：${overview}`,
    `味型：${c.flavor_tags.join("、")}`,
    `核心调料：${c.core_seasonings.map((s) => s.zh).join("、")}`,
    `代表菜：${c.representative_dishes.map((d) => d.zh).join("、")}`,
  ].join("\n");
}

export function buildContext(opts: {
  candidates: string[];
  scene: string | null;
  libraryDishes: { cuisineId: string; nameZh: string }[];
}): string {
  const parts = ["## 候选菜系（只能从这些菜系里选，cuisine_id 用下面的 id）"];
  for (const id of opts.candidates) {
    const c = kb.cuisines.find((x) => x.id === id);
    if (c) parts.push(cuisineBrief(c));
  }
  const scene = opts.scene ? getScene(opts.scene) : undefined;
  if (scene) parts.push(`## 场景：${scene.zh}\n${scene.guidance}`);
  if (opts.libraryDishes.length) {
    parts.push(
      `## 图片库已有的菜（合适时优先推荐这些，名称照抄）\n${opts.libraryDishes
        .map((d) => `- ${d.cuisineId}：${d.nameZh}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}
