import { describe, expect, it } from "vitest";
import { budgetTier } from "./limits";
import { textCostUsd } from "./models";

describe("预算档位（PRD 6.3）", () => {
  it.each([
    [0, "normal"],
    [49.99, "normal"],
    [50, "notified"],
    [80, "no-new-images"],
    [95, "tutorial-downgraded"],
    [100, "paused"],
    [130, "paused"],
  ] as const)("$%s → %s", (spent, tier) => {
    expect(budgetTier(spent)).toBe(tier);
  });
});

describe("文本调用成本", () => {
  it("缓存部分按缓存价计", () => {
    // gpt-6.1-sol：输入 2，缓存 0.1，输出 10（每百万）
    const cost = textCostUsd("gpt-6.1-sol", { inputTokens: 2500, cachedTokens: 1000, outputTokens: 2000 });
    expect(cost).toBeCloseTo((1500 * 2 + 1000 * 0.1 + 2000 * 10) / 1e6, 10);
  });

  it("未配置单价的模型报错", () => {
    expect(() => textCostUsd("unknown", { inputTokens: 1, cachedTokens: 0, outputTokens: 1 })).toThrow();
  });
});
