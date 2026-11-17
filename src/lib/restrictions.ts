// 忌口与过敏原检查（技术方案 7.5）：关键词包含匹配，宁可误杀。
import type { Ingredient } from "@/lib/kb/schema";
import { buildIngredientIndex, normKey, type IngredientIndex } from "./ingredients";

/** 把忌口词扩展成所有叫法：词典里的食材加上标准名、别名、英文名；词典外的保留原文 */
export function expandTerms(terms: string[], index: IngredientIndex, ingredients: Ingredient[]): string[] {
  const out = new Set<string>();
  for (const raw of terms) {
    const t = normKey(raw);
    if (!t) continue;
    out.add(t);
    const hit = index.normalize(raw);
    const ing = hit ?? ingredients.find((i) => normKey(i.zh) === t);
    if (!ing) continue;
    for (const name of [ing.zh, ...ing.aliases, ...Object.values(ing.en)]) {
      if (typeof name === "string" && name) out.add(normKey(name));
    }
  }
  // 太短的英文词（如 "egg" 之外的两字母词）容易误伤，丢掉 1 个字母的
  return [...out].filter((k) => k.length >= 2 || /[一-鿿]/.test(k));
}

/** 返回命中的第一个关键词；都没命中返回 null */
export function findRestricted(texts: string[], keywords: string[]): string | null {
  if (!keywords.length) return null;
  const hay = texts.map(normKey);
  for (const k of keywords) {
    if (hay.some((h) => h.includes(k))) return k;
  }
  return null;
}

export function restrictionMatcher(ingredients: Ingredient[]) {
  const index = buildIngredientIndex(ingredients);
  return (terms: string[]) => expandTerms(terms, index, ingredients);
}
