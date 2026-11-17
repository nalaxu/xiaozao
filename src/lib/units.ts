// 份量缩放与单位换算（PRD F17，技术方案 7.4）：都在前端完成，不再调用模型。
// 模型一律用公制生成，tbsp / tsp 两种单位制通用。
import type { Unit } from "./tutorial-types";

export type UnitSystem = "metric" | "us";

export interface DisplayAmount {
  /** 数量文字，如“250”“1½”；“适量”时为空 */
  value: string;
  unit: string;
}

const UNIT_ZH: Record<Unit, string> = {
  g: "克",
  kg: "千克",
  ml: "毫升",
  l: "升",
  piece: "个",
  clove: "瓣",
  slice: "片",
  tbsp: "汤匙",
  tsp: "茶匙",
  pinch: "撮",
  to_taste: "",
};

const FRACTIONS: [number, string][] = [
  [0, ""],
  [0.25, "¼"],
  [1 / 3, "⅓"],
  [0.5, "½"],
  [2 / 3, "⅔"],
  [0.75, "¾"],
  [1, ""],
];

/** 用常见分数表示（适合个、瓣、汤匙、杯等） */
export function fraction(n: number): string {
  if (n <= 0) return "0";
  let whole = Math.floor(n);
  const rest = n - whole;
  let best = FRACTIONS[0];
  for (const f of FRACTIONS) if (Math.abs(f[0] - rest) < Math.abs(best[0] - rest)) best = f;
  if (best[0] === 1) {
    whole += 1;
    best = FRACTIONS[0];
  }
  if (whole === 0 && !best[1]) return "¼"; // 太少时至少显示 ¼
  return `${whole || ""}${best[1]}` || "0";
}

/** 重量、容量取整到顺手的数 */
export function roundNice(n: number): number {
  if (n < 10) return Math.round(n * 2) / 2;
  if (n < 100) return Math.round(n / 5) * 5;
  if (n < 1000) return Math.round(n / 10) * 10;
  return Math.round(n / 50) * 50;
}

const trim = (n: number, digits = 1) => String(Number(n.toFixed(digits)));

export function formatAmount(amount: number | null, unit: Unit, factor: number, system: UnitSystem): DisplayAmount {
  if (amount === null || unit === "to_taste") return { value: "", unit: "适量" };
  const n = amount * factor;

  switch (unit) {
    case "pinch":
      return { value: fraction(n), unit: "撮" };
    case "piece":
    case "clove":
    case "slice":
      return { value: fraction(n), unit: UNIT_ZH[unit] };
    case "tbsp":
    case "tsp":
      return { value: fraction(n), unit: UNIT_ZH[unit] };
    case "g":
    case "kg": {
      const grams = unit === "kg" ? n * 1000 : n;
      if (system === "us") {
        const oz = grams / 28.3495;
        return oz >= 16 ? { value: trim(oz / 16, 2), unit: "lb" } : { value: fraction(oz), unit: "oz" };
      }
      return grams >= 1000 ? { value: trim(grams / 1000, 2), unit: "千克" } : { value: trim(roundNice(grams)), unit: "克" };
    }
    case "ml":
    case "l": {
      const ml = unit === "l" ? n * 1000 : n;
      if (system === "us") {
        // 少量用汤匙、茶匙，多一些用杯（1 杯 ≈ 240 毫升）
        if (ml < 15) return { value: fraction(ml / 5), unit: "茶匙" };
        if (ml < 60) return { value: fraction(ml / 15), unit: "汤匙" };
        return { value: fraction(ml / 240), unit: "杯" };
      }
      return ml >= 1000 ? { value: trim(ml / 1000, 2), unit: "升" } : { value: trim(roundNice(ml)), unit: "毫升" };
    }
  }
}

export function formatTemp(celsius: number, system: UnitSystem): string {
  if (system === "us") return `${Math.round((celsius * 9) / 5 / 5 + 32 / 5) * 5}°F`;
  return `${Math.round(celsius)}°C`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m} 分 ${s} 秒` : `${m} 分钟`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} 小时 ${m % 60} 分钟` : `${h} 小时`;
}
