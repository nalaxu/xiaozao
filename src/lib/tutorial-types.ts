// 教程内容结构（技术方案 7.4），前后端共用。模型按此结构输出，教程生成后不可变。
import type { IngredientNutrition } from "./nutrition";

export const UNITS = ["g", "kg", "ml", "l", "piece", "clove", "slice", "tbsp", "tsp", "pinch", "to_taste"] as const;
export type Unit = (typeof UNITS)[number];

export const HEATS = ["off", "low", "medium_low", "medium", "medium_high", "high"] as const;
export type Heat = (typeof HEATS)[number];

export const HEAT_LABELS: Record<Heat, string> = {
  off: "关火",
  low: "小火",
  medium_low: "中小火",
  medium: "中火",
  medium_high: "中大火",
  high: "大火",
};

export interface TutorialIngredient {
  group: "main" | "aux" | "seasoning";
  name_zh: string;
  name_en: string;
  /** null 表示“适量” */
  amount: number | null;
  unit: Unit;
  prep: string | null;
  optional: boolean;
}

export interface TutorialStep {
  action: string;
  heat: Heat | null;
  oven_c: number | null;
  timer_seconds: number | null;
  cue: string;
  warning: string | null;
}

export interface TutorialContent {
  overview: {
    name_zh: string;
    name_en: string;
    name_original: string | null;
    cuisine_id: string;
    flavor_desc: string;
    total_minutes: number;
    active_minutes: number;
    difficulty: 1 | 2 | 3;
    servings: number;
  };
  ingredients: TutorialIngredient[];
  substitutions: { for: string; substitute: string; difference: string }[];
  equipment: string[];
  steps: TutorialStep[];
  key_points: string[];
  background: string;
  safety_notes: string[];
  /** 按每样食材实际用量估的营养（整道菜），页面汇总后按人数平分；旧教程没有 */
  nutrition?: IngredientNutrition[];
}

/** 流式事件（NDJSON） */
export type TutorialEvent =
  | { type: "start"; id: string; remaining: number | null; model: string }
  | { type: "delta"; text: string }
  /** 后检查不通过、正在重新生成：前端清空已显示的内容 */
  | { type: "reset"; reason: string }
  | { type: "done"; content: TutorialContent }
  | { type: "error"; code: string; error: string; refunded: boolean; resetAt?: string };
