// 各环节的模型与单价（PRD 6.1、附录 B）。模型名可用环境变量覆盖，不写死在业务代码里。
// 单价为每百万 token 美元；成本实测后更新 estimateUsd（技术方案第 10 节）。

export type Feature = "recognize" | "recommend" | "tutorial" | "followup" | "image";

export interface TextPrice {
  input: number;
  cachedInput: number;
  output: number;
}

export const TEXT_PRICES: Record<string, TextPrice> = {
  "gpt-6-astra": { input: 10, cachedInput: 1, output: 50 },
  "gpt-6.1-sol": { input: 2, cachedInput: 0.1, output: 10 },
  "gpt-6.1-terra": { input: 1, cachedInput: 0.05, output: 5 },
  "gpt-6-luna": { input: 0.1, cachedInput: 0.01, output: 0.5 },
};

/** 图片模型按输出 token 计费，每百万 $30（附录 B） */
export const IMAGE_OUTPUT_PRICE_PER_M = 30;
/** 图片模型的文字输入，每百万 token 美元 */
export const IMAGE_INPUT_PRICE_PER_M = 5;

export function imageCostUsd(usage: { inputTokens: number; outputTokens: number } | null): number {
  if (!usage) return estimateUsd.image;
  return (usage.inputTokens * IMAGE_INPUT_PRICE_PER_M + usage.outputTokens * IMAGE_OUTPUT_PRICE_PER_M) / 1e6;
}

const env = (key: string, fallback: string) => process.env[key] || fallback;

export function modelFor(feature: Feature): string {
  switch (feature) {
    case "recognize":
      return env("MODEL_RECOGNIZE", "gpt-6.1-terra");
    case "recommend":
      return env("MODEL_RECOMMEND", "gpt-6.1-terra");
    case "tutorial":
      return env("MODEL_TUTORIAL", "gpt-6.1-sol");
    case "followup":
      return env("MODEL_FOLLOWUP", "gpt-6.1-terra");
    case "image":
      return env("MODEL_IMAGE", "gpt-image-2");
  }
}

/** 预算达到降级档位时教程改用的模型（PRD 6.3） */
export const tutorialFallbackModel = () => env("MODEL_TUTORIAL_FALLBACK", "gpt-6.1-terra");

export const imageQuality = () => env("IMAGE_QUALITY", "medium");

/**
 * 同时生成的图片数。中转站对每个账号有并发上限，图片一张约 30 秒，并发太高会挤占用户的文字请求
 * （2026-11-19 评测时出现过 “Concurrency limit exceeded”）。
 */
export const imageConcurrency = () => Math.max(1, Number(process.env.IMAGE_CONCURRENCY) || 2);

/** 调用前用于预占全站预算的单次成本，取 2026-11-19 评测实测平均值并略向上取整（PRD 6.3） */
export const estimateUsd: Record<Feature, number> = {
  recognize: 0.0025,
  recommend: 0.007,
  tutorial: 0.03,
  followup: 0.003,
  image: 0.012,
};

export function textCostUsd(
  model: string,
  usage: { inputTokens: number; cachedTokens: number; outputTokens: number },
): number {
  const p = TEXT_PRICES[model];
  if (!p) throw new Error(`未配置模型单价: ${model}`);
  const uncached = Math.max(0, usage.inputTokens - usage.cachedTokens);
  return (uncached * p.input + usage.cachedTokens * p.cachedInput + usage.outputTokens * p.output) / 1e6;
}
