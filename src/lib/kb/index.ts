// 知识库查询。数据来自构建时生成的 src/generated/kb.json（npm run kb）。
import data from "@/generated/kb.json";
import type { Cuisine, CuisineGroup, Flavor, Ingredient, KnowledgeBase, Scene } from "./schema";

export type { Cuisine, CuisineGroup, Dish, Flavor, Ingredient, Scene } from "./schema";

export const kb = data as unknown as KnowledgeBase;

export const CUISINE_GROUP_LABELS: Record<CuisineGroup, string> = {
  chinese: "中餐",
  "east-southeast-asia": "东亚与东南亚",
  "south-asia-middle-east": "南亚与中东",
  "europe-americas": "欧美",
};

const cuisineById = new Map(kb.cuisines.map((c) => [c.id, c]));
const flavorById = new Map(kb.flavors.map((f) => [f.id, f]));
const sceneById = new Map(kb.scenes.map((s) => [s.id, s]));

export const getCuisine = (id: string): Cuisine | undefined => cuisineById.get(id);
export const getFlavor = (id: string): Flavor | undefined => flavorById.get(id);
export const getScene = (id: string): Scene | undefined => sceneById.get(id);

export function cuisinesByGroup(): { group: CuisineGroup; label: string; cuisines: Cuisine[] }[] {
  return (Object.keys(CUISINE_GROUP_LABELS) as CuisineGroup[]).map((group) => ({
    group,
    label: CUISINE_GROUP_LABELS[group],
    cuisines: kb.cuisines.filter((c) => c.group === group),
  }));
}

export const primaryFlavors = () => kb.flavors.filter((f) => f.tier === "primary");
export const moreFlavors = () => kb.flavors.filter((f) => f.tier === "more");

export type { Ingredient as KbIngredient };
