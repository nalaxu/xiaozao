import { describe, expect, it } from "vitest";
import { buildIngredientIndex } from "./ingredients";
import type { Ingredient } from "./kb/schema";

const ings: Ingredient[] = [
  { zh: "香菜", aliases: ["芫荽"], en: { us: "cilantro", uk: "coriander" }, category: "herb-aromatic", pairs: [] },
  { zh: "茄子", aliases: [], en: { us: "eggplant", uk: "aubergine" }, category: "vegetable", pairs: [] },
  { zh: "鸡腿", aliases: ["琵琶腿"], en: { us: "chicken thigh" }, category: "poultry", pairs: [] },
  { zh: "鸡蛋", aliases: [], en: { us: "egg" }, category: "egg-dairy", pairs: [] },
];

describe("食材归一", () => {
  const index = buildIngredientIndex(ings);

  it("中文名、别名、美英两种英文名都对到标准名", () => {
    for (const input of ["香菜", "芫荽", "cilantro", "Coriander", " CILANTRO "]) {
      expect(index.normalize(input)?.zh).toBe("香菜");
    }
    expect(index.normalize("aubergine")?.zh).toBe("茄子");
  });

  it("词典外的词返回空", () => {
    expect(index.normalize("龙虾")).toBeUndefined();
  });

  it("联想按前缀优先、去重", () => {
    expect(index.suggest("鸡").map((i) => i.zh)).toEqual(["鸡腿", "鸡蛋"]);
    expect(index.suggest("chick").map((i) => i.zh)).toEqual(["鸡腿"]);
    expect(index.suggest("")).toEqual([]);
  });
});
