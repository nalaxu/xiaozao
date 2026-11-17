// 食材归一与联想：中文名、别名、英文名（美/英/澳）都对到标准名（PRD F7）。
import type { Ingredient } from "@/lib/kb/schema";

export interface IngredientIndex {
  normalize(input: string): Ingredient | undefined;
  suggest(input: string, limit?: number): Ingredient[];
}

export const normKey = (s: string) =>
  s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s·・'’\-_]+/g, " ");

export function buildIngredientIndex(ingredients: Ingredient[]): IngredientIndex {
  const exact = new Map<string, Ingredient>();
  const entries: { key: string; ing: Ingredient; rank: number }[] = [];

  for (const ing of ingredients) {
    const names: [string, number][] = [
      [ing.zh, 0],
      ...ing.aliases.map((a): [string, number] => [a, 1]),
      ...Object.values(ing.en)
        .filter((v): v is string => typeof v === "string")
        .map((e): [string, number] => [e, 2]),
    ];
    for (const [name, rank] of names) {
      const key = normKey(name);
      if (!exact.has(key)) exact.set(key, ing);
      entries.push({ key, ing, rank });
    }
  }

  return {
    normalize(input) {
      return exact.get(normKey(input));
    },
    suggest(input, limit = 8) {
      const q = normKey(input);
      if (!q) return [];
      const scored = new Map<string, { ing: Ingredient; score: number }>();
      for (const { key, ing, rank } of entries) {
        let score: number | null = null;
        if (key === q) score = rank;
        else if (key.startsWith(q)) score = 10 + rank;
        else if (key.includes(q)) score = 20 + rank;
        if (score === null) continue;
        const prev = scored.get(ing.zh);
        if (!prev || score < prev.score) scored.set(ing.zh, { ing, score });
      }
      return [...scored.values()]
        .sort((a, b) => a.score - b.score || a.ing.zh.length - b.ing.zh.length)
        .slice(0, limit)
        .map((x) => x.ing);
    },
  };
}
