import { describe, expect, it } from "vitest";
import { boardLayout, MAX_ON_BOARD, modelKind } from "./board-layout";

const item = (name: string, main = false) => ({ name, main });

describe("boardLayout", () => {
  it("空砧板没有位置", () => {
    expect(boardLayout([])).toEqual({ slots: [], hidden: 0 });
  });

  it("按加入顺序摆放，切换主料不改变位置", () => {
    const before = boardLayout([item("洋葱"), item("番茄", true), item("鸡蛋")]).slots;
    const after = boardLayout([item("洋葱"), item("番茄", false), item("鸡蛋", true)]).slots;
    expect(before.map((s) => s.name)).toEqual(["洋葱", "番茄", "鸡蛋"]);
    expect(after.map((s) => [s.name, s.x, s.z])).toEqual(before.map((s) => [s.name, s.x, s.z]));
  });

  it("一排时左右对称", () => {
    const { slots } = boardLayout([item("a"), item("b"), item("c")]);
    expect(slots[0].x).toBeCloseTo(-slots[2].x);
    expect(slots[1].x).toBeCloseTo(0);
    expect(new Set(slots.map((s) => s.z)).size).toBe(1);
  });

  it("超过 4 样分两排，位置互不重叠", () => {
    const { slots } = boardLayout(["a", "b", "c", "d", "e", "f"].map((n) => item(n)));
    expect(new Set(slots.map((s) => s.z)).size).toBe(2);
    const keys = slots.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`);
    expect(new Set(keys).size).toBe(slots.length);
  });

  it("超出上限的不摆，并报告数量", () => {
    const items = Array.from({ length: MAX_ON_BOARD + 3 }, (_, i) => item(`食材${i}`));
    const { slots, hidden } = boardLayout(items);
    expect(slots).toHaveLength(MAX_ON_BOARD);
    expect(hidden).toBe(3);
  });

  it("超出上限时优先保留主料", () => {
    const items = [...Array.from({ length: MAX_ON_BOARD }, (_, i) => item(`配料${i}`)), item("鸡肉", true)];
    const { slots, hidden } = boardLayout(items);
    expect(slots.map((s) => s.name)).toContain("鸡肉");
    expect(slots.map((s) => s.name)).not.toContain(`配料${MAX_ON_BOARD - 1}`);
    expect(hidden).toBe(1);
  });
});

describe("modelKind", () => {
  it("6 种有模型，其余用通用占位", () => {
    expect(modelKind("番茄")).toBe("番茄");
    expect(modelKind("鸡肉")).toBe("鸡肉");
    expect(modelKind("香菜")).toBe("generic");
  });
});
