// 推荐接口的请求与流式事件，前后端共用。
import type { Nutrition } from "./nutrition";

export interface RecommendInput {
  main: string[];
  other: string[];
  flavors: string[];
  scene: string | null;
  /** 用户选的菜系，可多选；空数组表示不限 */
  cuisines: string[];
  /** 几个人吃；null 表示按习惯和场景默认，具体用量由教程按人数决定 */
  servings: number | null;
  /** 本次会话已展示过的菜名（换一批，F12） */
  exclude: string[];
}

export interface RecommendedDish {
  dishId: string;
  nameZh: string;
  nameEn: string;
  nameOriginal: string | null;
  cuisineId: string;
  flavorTags: string[];
  summary: string;
  totalMinutes: number;
  difficulty: 1 | 2 | 3;
  uses: string[];
  toBuy: { name: string; required: boolean }[];
  /** 一人份营养粗估（模型给的不合理时为 null；旧记录没有这个字段） */
  nutrition?: Nutrition | null;
  imageUrl: string | null;
}

export type RecommendEvent =
  | { type: "start"; remaining: number | null; cached: boolean }
  | { type: "dish"; dish: RecommendedDish }
  | { type: "done"; runId: string; note: string | null }
  | { type: "error"; code: RecommendErrorCode; error: string; refunded: boolean; resetAt?: string };

export type RecommendErrorCode = "quota" | "budget_paused" | "rate" | "model" | "invalid" | "auth";
