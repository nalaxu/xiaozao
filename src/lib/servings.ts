// 默认份量，前后端共用：按平时几个人吃（没填为 2 人）；宴客至少按场景下限；夜宵这类场景超过上限时按 1 人。
export interface ServingRule {
  min_servings?: number;
  max_servings?: number;
}

export function defaultServingsFor(rule: ServingRule | undefined, household: number | null = null): number {
  if (rule?.min_servings) return Math.max(rule.min_servings, household ?? 0);
  if (rule?.max_servings) return household && household <= rule.max_servings ? household : 1;
  return household ?? 2;
}
