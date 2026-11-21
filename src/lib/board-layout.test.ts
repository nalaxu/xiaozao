import { describe, expect, it } from "vitest";
import { boardLayout, dropResult, MAX_IN_BASIN, MAX_ON_BOARD, MODELED, modelKind, SCENE, zoneAt } from "./board-layout";

const item = (name: string, main = false) => ({ name, main });

describe("boardLayout", () => {
  it("空工作台没有位置", () => {
    expect(boardLayout([])).toEqual({ slots: [], hidden: 0 });
  });

  it("主料上砧板，配菜进菜盆", () => {
    const { slots } = boardLayout([item("洋葱"), item("番茄", true), item("葱")]);
    const zone = Object.fromEntries(slots.map((s) => [s.name, s.zone]));
    expect(zone).toEqual({ 番茄: "board", 洋葱: "basin", 葱: "basin" });
    for (const s of slots) expect(zoneAt(s.x, s.z)).toBe(s.zone);
  });

  it("菜盆里的食材缩小、放在盆底", () => {
    const [s] = boardLayout([item("葱")]).slots;
    expect(s.scale).toBeLessThan(1);
    expect(s.y).toBe(SCENE.basin.floorY);
  });

  it("各区按加入顺序摆放，其他区的变动不影响位置", () => {
    const before = boardLayout([item("鸡肉", true), item("洋葱"), item("番茄", true)]).slots;
    const after = boardLayout([item("鸡肉", true), item("洋葱"), item("番茄", true), item("姜")]).slots;
    const board = (slots: typeof before) => slots.filter((s) => s.zone === "board").map((s) => [s.name, s.x, s.z]);
    expect(board(before).map((b) => b[0])).toEqual(["鸡肉", "番茄"]);
    expect(board(after)).toEqual(board(before));
  });

  it("每区位置互不重叠", () => {
    const items = [
      ...Array.from({ length: MAX_ON_BOARD }, (_, i) => item(`主${i}`, true)),
      ...Array.from({ length: MAX_IN_BASIN }, (_, i) => item(`配${i}`)),
    ];
    const { slots } = boardLayout(items);
    const keys = slots.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`);
    expect(new Set(keys).size).toBe(slots.length);
  });

  it("每区超出上限的不摆，并报告数量", () => {
    const items = [
      ...Array.from({ length: MAX_ON_BOARD + 1 }, (_, i) => item(`主${i}`, true)),
      ...Array.from({ length: MAX_IN_BASIN + 2 }, (_, i) => item(`配${i}`)),
    ];
    const { slots, hidden } = boardLayout(items);
    expect(slots.filter((s) => s.zone === "board")).toHaveLength(MAX_ON_BOARD);
    expect(slots.filter((s) => s.zone === "basin")).toHaveLength(MAX_IN_BASIN);
    expect(hidden).toBe(3);
  });
});

describe("dropResult", () => {
  const { board, basin } = SCENE;

  it("配菜拖到砧板设为主料", () => {
    const items = [item("番茄", true), item("葱")];
    const { slots } = boardLayout(items);
    expect(dropResult(items, slots, "葱", board.x, board.z, 5)).toEqual({ type: "place", name: "葱", main: true });
  });

  it("主料拖进菜盆改为配菜", () => {
    const items = [item("番茄", true), item("葱")];
    const { slots } = boardLayout(items);
    expect(dropResult(items, slots, "番茄", basin.x, basin.z, 5)).toEqual({ type: "place", name: "番茄", main: false });
  });

  it("砧板满了时与落点最近的主料互换", () => {
    const items = [item("鸡肉", true), item("番茄", true), item("葱")];
    const { slots } = boardLayout(items);
    const tomato = slots.find((s) => s.name === "番茄")!;
    expect(dropResult(items, slots, "葱", tomato.x, tomato.z, 2)).toEqual({ type: "swap", toMain: "葱", toSide: "番茄" });
  });

  it("放回原区或放到台面空处，什么都不变", () => {
    const items = [item("番茄", true), item("葱")];
    const { slots } = boardLayout(items);
    expect(dropResult(items, slots, "番茄", board.x, board.z, 5)).toEqual({ type: "none" });
    expect(dropResult(items, slots, "葱", basin.x, basin.z, 5)).toEqual({ type: "none" });
    expect(dropResult(items, slots, "葱", SCENE.bounds.maxX - 0.1, SCENE.bounds.maxZ - 0.05, 5)).toEqual({ type: "none" });
  });
});

describe("modelKind", () => {
  it("21 种有模型，五花肉共用猪肉，其余用通用占位", () => {
    expect(MODELED).toHaveLength(21);
    expect(modelKind("番茄")).toBe("番茄");
    expect(modelKind("西兰花")).toBe("西兰花");
    expect(modelKind("五花肉")).toBe("猪肉");
    expect(modelKind("香菜")).toBe("generic");
  });
});
