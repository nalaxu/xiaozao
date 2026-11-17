import { describe, expect, it } from "vitest";
import { parsePartialJson } from "./partial-json";
import { formatAmount, formatDuration, formatTemp, fraction } from "./units";

describe("formatAmount", () => {
  it("scales metric weights and rounds to friendly numbers", () => {
    expect(formatAmount(300, "g", 1, "metric")).toEqual({ value: "300", unit: "克" });
    expect(formatAmount(300, "g", 1.5, "metric")).toEqual({ value: "450", unit: "克" });
    expect(formatAmount(37, "g", 1, "metric")).toEqual({ value: "35", unit: "克" });
    expect(formatAmount(800, "g", 2, "metric")).toEqual({ value: "1.6", unit: "千克" });
  });

  it("converts to US units", () => {
    expect(formatAmount(450, "g", 1, "us")).toEqual({ value: "15¾", unit: "oz" });
    expect(formatAmount(1, "kg", 1, "us")).toEqual({ value: "2.2", unit: "lb" });
    expect(formatAmount(240, "ml", 1, "us")).toEqual({ value: "1", unit: "杯" });
    expect(formatAmount(30, "ml", 1, "us")).toEqual({ value: "2", unit: "汤匙" });
    expect(formatAmount(5, "ml", 1, "us")).toEqual({ value: "1", unit: "茶匙" });
  });

  it("keeps spoons and counts in both systems, with fractions", () => {
    expect(formatAmount(1, "tbsp", 1.5, "us")).toEqual({ value: "1½", unit: "汤匙" });
    expect(formatAmount(3, "clove", 0.5, "metric")).toEqual({ value: "1½", unit: "瓣" });
    expect(formatAmount(1, "piece", 1 / 3, "metric")).toEqual({ value: "⅓", unit: "个" });
  });

  it("shows 适量 for null amounts", () => {
    expect(formatAmount(null, "g", 2, "metric")).toEqual({ value: "", unit: "适量" });
    expect(formatAmount(1, "to_taste", 2, "us")).toEqual({ value: "", unit: "适量" });
  });
});

describe("misc formatting", () => {
  it("fraction", () => {
    expect(fraction(2)).toBe("2");
    expect(fraction(0.95)).toBe("1");
    expect(fraction(0.1)).toBe("¼");
  });
  it("temperature and duration", () => {
    expect(formatTemp(180, "metric")).toBe("180°C");
    expect(formatTemp(180, "us")).toBe("355°F");
    expect(formatTemp(220, "us")).toBe("430°F");
    expect(formatDuration(90)).toBe("1 分 30 秒");
    expect(formatDuration(600)).toBe("10 分钟");
    expect(formatDuration(5400)).toBe("1 小时 30 分钟");
  });
});

describe("parsePartialJson", () => {
  const full = {
    overview: { name_zh: "番茄炒蛋", servings: 2 },
    ingredients: [{ name_zh: "番茄", amount: 300 }, { name_zh: "鸡蛋", amount: 3 }],
    steps: [{ action: "打散鸡蛋", cue: "蛋液起细泡" }],
  };
  const text = JSON.stringify(full);

  it("parses every prefix without throwing and converges to the full value", () => {
    let last: unknown;
    for (let i = 1; i <= text.length; i++) {
      const v = parsePartialJson(text.slice(0, i));
      if (v !== undefined) last = v;
    }
    expect(last).toEqual(full);
  });

  it("shows text that is still being written", () => {
    const v = parsePartialJson<typeof full>('{"overview":{"name_zh":"番茄炒');
    expect(v?.overview.name_zh).toBe("番茄炒");
  });

  it("drops a dangling key", () => {
    expect(parsePartialJson('{"a":1,"b"')).toEqual({ a: 1 });
    expect(parsePartialJson('{"a":[1,2],"b":tr')).toEqual({ a: [1, 2] });
  });
});
