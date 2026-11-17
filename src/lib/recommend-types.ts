// 推荐接口的请求与流式事件，前后端共用。

export interface RecommendInput {
  main: string[];
  other: string[];
  flavors: string[];
  scene: string | null;
  cuisine: string | null;
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
  imageUrl: string | null;
}

export type RecommendEvent =
  | { type: "start"; remaining: number | null; cached: boolean }
  | { type: "dish"; dish: RecommendedDish }
  | { type: "done"; runId: string; note: string | null }
  | { type: "error"; code: RecommendErrorCode; error: string; refunded: boolean; resetAt?: string };

export type RecommendErrorCode = "quota" | "budget_paused" | "rate" | "model" | "invalid" | "auth";
