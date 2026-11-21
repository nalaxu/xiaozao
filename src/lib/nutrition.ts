// 营养估算，前后端共用。推荐时模型按一人份粗估；教程里模型按每样食材的实际用量逐项估，页面上由代码汇总、按人数平分。

export const NUTRIENTS = ["kcal", "protein_g", "fat_g", "carbs_g", "fiber_g", "sodium_mg"] as const;
export type Nutrient = (typeof NUTRIENTS)[number];

/** 一组营养数值：热量 kcal，蛋白质、脂肪、碳水、膳食纤维 g，钠 mg */
export type Nutrition = Record<Nutrient, number>;

export const NUTRIENT_META: Record<
  Nutrient,
  {
    label: string;
    unit: string;
    /** 中国营养素参考值（NRV，GB 28050） */ nrv: number;
  }
> = {
  kcal: { label: "热量", unit: "kcal", nrv: 2000 },
  protein_g: { label: "蛋白质", unit: "g", nrv: 60 },
  fat_g: { label: "脂肪", unit: "g", nrv: 60 },
  carbs_g: { label: "碳水", unit: "g", nrv: 300 },
  fiber_g: { label: "膳食纤维", unit: "g", nrv: 25 },
  sodium_mg: { label: "钠", unit: "mg", nrv: 2000 },
};

/** 每样食材按教程里的实际用量算出的营养（整道菜里这一样的总量） */
export interface IngredientNutrition extends Nutrition {
  name_zh: string;
  /** 实际吃进去的可食部分重量（g），油炸时只算吸进去的油 */
  grams: number;
}

/** 单项上限：一样食材在一整道菜里不会超过这些数（20 人份的大锅也够），超出视为模型出错 */
const ITEM_MAX: Nutrition & { grams: number } = {
  grams: 20000,
  kcal: 40000,
  protein_g: 4000,
  fat_g: 4000,
  carbs_g: 8000,
  fiber_g: 1000,
  sodium_mg: 80000,
};

/** 一人份粗估的上限 */
const SERVING_MAX: Nutrition = {
  kcal: 5000,
  protein_g: 400,
  fat_g: 400,
  carbs_g: 800,
  fiber_g: 100,
  sodium_mg: 15000,
};

const num = (v: unknown, max: number): number | null =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? v : null;

/** 校验模型给的一人份估算，任何一项不合理就整体丢掉（不显示比显示错的好） */
export function parseServingNutrition(raw: unknown): Nutrition | null {
  if (!raw || typeof raw !== "object") return null;
  const out = {} as Nutrition;
  for (const k of NUTRIENTS) {
    const v = num((raw as Record<string, unknown>)[k], SERVING_MAX[k]);
    if (v === null) return null;
    out[k] = v;
  }
  return out;
}

/** 校验逐项营养：不合理的单项跳过，其余照常汇总 */
export function parseIngredientNutrition(raw: unknown): IngredientNutrition[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    const name = typeof r.name_zh === "string" ? r.name_zh.trim().slice(0, 40) : "";
    const grams = num(r.grams, ITEM_MAX.grams);
    if (!name || grams === null) return [];
    const out: IngredientNutrition = {
      name_zh: name,
      grams,
      kcal: 0,
      protein_g: 0,
      fat_g: 0,
      carbs_g: 0,
      fiber_g: 0,
      sodium_mg: 0,
    };
    for (const k of NUTRIENTS) {
      const v = num(r[k], ITEM_MAX[k]);
      if (v === null) return [];
      out[k] = v;
    }
    return [out];
  });
}

/** 把逐项营养加总，再按人数平分成一人份 */
export function sumNutrition(items: Nutrition[], servings: number): { total: Nutrition; perServing: Nutrition } {
  const total = Object.fromEntries(NUTRIENTS.map((k) => [k, items.reduce((s, i) => s + (i[k] ?? 0), 0)])) as Nutrition;
  const n = Math.max(1, servings);
  const perServing = Object.fromEntries(NUTRIENTS.map((k) => [k, total[k] / n])) as Nutrition;
  return { total, perServing };
}

/** 展示用取整：热量和钠取整数，其余小于 10 时保留一位小数 */
export function formatNutrient(k: Nutrient, v: number): string {
  if (k === "kcal" || k === "sodium_mg") return String(Math.round(v));
  return v < 10 ? (Math.round(v * 10) / 10).toString() : String(Math.round(v));
}

/** 占每日参考值的百分比，取整 */
export function nrvPercent(k: Nutrient, v: number): number {
  return Math.round((v / NUTRIENT_META[k].nrv) * 100);
}
