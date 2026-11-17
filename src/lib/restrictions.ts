// 忌口与过敏原检查（技术方案 7.5）：关键词包含匹配，宁可误杀。
import type { Allergen, Ingredient } from "@/lib/kb/schema";
import { buildIngredientIndex, normKey, type IngredientIndex } from "./ingredients";

/**
 * 一条规则：文本里出现 terms 中任一词即命中。
 * except 只作用于本规则：先从文本里去掉这些词再匹配（例如检查“奶”时去掉“椰奶”）。
 */
export interface RestrictionRule {
  terms: string[];
  except?: string[];
}

/** 旧写法的纯关键词数组等同于一条没有例外的规则 */
export type Restrictions = RestrictionRule[] | string[];

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

function toRules(r: Restrictions): RestrictionRule[] {
  if (!r.length) return [];
  return typeof r[0] === "string" ? [{ terms: r as string[] }] : (r as RestrictionRule[]);
}

/** 返回命中的第一个关键词；都没命中返回 null */
export function findRestricted(texts: string[], restrictions: Restrictions): string | null {
  const rules = toRules(restrictions);
  if (!rules.length) return null;
  const hay = texts.filter(Boolean).map(normKey);
  for (const rule of rules) {
    const except = (rule.except ?? []).map(normKey).filter(Boolean).sort((a, b) => b.length - a.length);
    const cleaned = except.length ? hay.map((h) => except.reduce((s, e) => s.split(e).join(" "), h)) : hay;
    for (const k of rule.terms) {
      const key = normKey(k);
      if (key && cleaned.some((h) => h.includes(key))) return k;
    }
  }
  return null;
}

export function restrictionMatcher(ingredients: Ingredient[]) {
  const index = buildIngredientIndex(ingredients);
  return (terms: string[]) => expandTerms(terms, index, ingredients);
}

/** 用户的忌口与过敏原 → 检查规则。忌口一条规则（无例外），每类过敏原各一条 */
export function buildRestrictions(
  avoid: string[],
  allergenIds: string[],
  allergens: Allergen[],
  expand: (terms: string[]) => string[],
): RestrictionRule[] {
  const rules: RestrictionRule[] = [];
  const avoidTerms = expand(avoid);
  if (avoidTerms.length) rules.push({ terms: avoidTerms });
  for (const id of allergenIds) {
    const a = allergens.find((x) => x.id === id);
    if (a) rules.push({ terms: [...a.keywords, a.zh, a.en], except: a.except });
  }
  return rules;
}
