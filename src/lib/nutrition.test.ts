import { describe, expect, it } from "vitest";
import { tutorialContentSchema } from "@/server/tutorial/model";
import { rawDishSchema } from "@/server/recommend/model";
import { formatNutrient, nrvPercent, parseIngredientNutrition, parseServingNutrition, sumNutrition } from "./nutrition";

const serving = { kcal: 520, protein_g: 28, fat_g: 22, carbs_g: 45, fiber_g: 4, sodium_mg: 1100 };
const item = (name: string, kcal: number, extra: Record<string, unknown> = {}) => ({
  name_zh: name,
  grams: 100,
  kcal,
  protein_g: 10,
  fat_g: 5,
  carbs_g: 20,
  fiber_g: 1,
  sodium_mg: 300,
  ...extra,
});

describe("parseServingNutrition", () => {
  it("accepts a complete estimate", () => {
    expect(parseServingNutrition(serving)).toEqual(serving);
  });
  it("drops the whole estimate when any value is missing or out of range", () => {
    expect(parseServingNutrition({ ...serving, sodium_mg: undefined })).toBeNull();
    expect(parseServingNutrition({ ...serving, kcal: -5 })).toBeNull();
    expect(parseServingNutrition({ ...serving, kcal: 99999 })).toBeNull();
    expect(parseServingNutrition("520 kcal")).toBeNull();
  });
});

describe("parseIngredientNutrition", () => {
  it("skips only the bad items", () => {
    const out = parseIngredientNutrition([item("土豆", 77), item("油", Number.NaN), { name_zh: "", grams: 1 }, null]);
    expect(out.map((i) => i.name_zh)).toEqual(["土豆"]);
  });
  it("returns an empty list for non-arrays", () => {
    expect(parseIngredientNutrition(undefined)).toEqual([]);
  });
});

describe("sumNutrition", () => {
  it("adds items up and splits by servings", () => {
    const { total, perServing } = sumNutrition(parseIngredientNutrition([item("a", 300), item("b", 500)]), 2);
    expect(total.kcal).toBe(800);
    expect(perServing.kcal).toBe(400);
    expect(perServing.sodium_mg).toBe(300);
  });
  it("never divides by zero", () => {
    expect(sumNutrition([serving], 0).perServing.kcal).toBe(520);
  });
});

describe("formatting", () => {
  it("rounds for display", () => {
    expect(formatNutrient("kcal", 412.6)).toBe("413");
    expect(formatNutrient("fiber_g", 3.46)).toBe("3.5");
    expect(formatNutrient("protein_g", 27.6)).toBe("28");
    expect(nrvPercent("sodium_mg", 1100)).toBe(55);
  });
});

describe("model output schemas", () => {
  const rawDish = {
    name_zh: "酸辣土豆丝",
    name_en: "Hot and sour potato",
    name_original: null,
    cuisine_id: "sichuan",
    flavor_tags: [],
    summary: "酸辣爽脆",
    total_minutes: 15,
    difficulty: 1,
    uses: [],
    key_ingredients: [],
    to_buy: [],
    visual: "x",
  };
  it("keeps a recommended dish even when its nutrition is bad", () => {
    expect(rawDishSchema.parse({ ...rawDish, nutrition: serving }).nutrition).toEqual(serving);
    expect(rawDishSchema.parse({ ...rawDish, nutrition: { kcal: "lots" } }).nutrition).toBeNull();
  });

  const tutorial = {
    overview: {
      name_zh: "酸辣土豆丝",
      name_en: "x",
      name_original: null,
      cuisine_id: "sichuan",
      flavor_desc: "x",
      total_minutes: 15,
      active_minutes: 10,
      difficulty: 1,
      servings: 2,
    },
    ingredients: [{ group: "main", name_zh: "土豆", name_en: "potato", amount: 300, unit: "g", prep: null, optional: false }],
    substitutions: [],
    equipment: [],
    steps: [{ action: "切丝", heat: null, oven_c: null, timer_seconds: null, cue: "粗细均匀", warning: null }],
    key_points: [],
    background: "",
    safety_notes: [],
  };
  it("parses tutorials with, without, or with broken nutrition", () => {
    expect(tutorialContentSchema.parse({ ...tutorial, nutrition: [item("土豆", 231)] }).nutrition).toHaveLength(1);
    expect(tutorialContentSchema.parse(tutorial).nutrition).toEqual([]);
    expect(tutorialContentSchema.parse({ ...tutorial, nutrition: "n/a" }).nutrition).toEqual([]);
  });
});
