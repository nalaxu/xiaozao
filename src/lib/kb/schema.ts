// 知识库 YAML 的结构定义。build-kb 用它校验，前后端用它的类型。
import { z } from "zod";

const status = z.enum(["draft", "reviewed"]);
const reviewMeta = {
  status,
  reviewed_by: z.string().nullable().optional(),
  reviewed_at: z.union([z.string(), z.date()]).nullable().optional(),
};

export const CUISINE_GROUPS = [
  "chinese",
  "east-southeast-asia",
  "south-asia-middle-east",
  "europe-americas",
] as const;

export const flavorSchema = z.object({
  id: z.string().regex(/^[a-z-]+$/),
  zh: z.string(),
  en: z.string(),
  tier: z.enum(["primary", "more"]),
  description: z.string(),
  cuisines: z.array(z.string()).min(1),
});

export const flavorsFileSchema = z.object({ ...reviewMeta, flavors: z.array(flavorSchema).min(1) });

export const sceneSchema = z.object({
  id: z.string().regex(/^[a-z-]+$/),
  zh: z.string(),
  en: z.string(),
  constraints: z
    .object({
      max_total_minutes: z.number().int().positive().optional(),
      max_steps: z.number().int().positive().optional(),
      max_vessels: z.number().int().positive().optional(),
      min_servings: z.number().int().positive().optional(),
      max_servings: z.number().int().positive().optional(),
      extra_purchase: z.literal("none").optional(),
    })
    .strict(),
  guidance: z.string(),
});

export const scenesFileSchema = z.object({ ...reviewMeta, scenes: z.array(sceneSchema).min(1) });

export const INGREDIENT_CATEGORIES = [
  "meat",
  "poultry",
  "seafood",
  "egg-dairy",
  "soy",
  "vegetable",
  "mushroom",
  "herb-aromatic",
  "fruit",
  "legume",
  "grain-noodle",
  "preserved",
] as const;

export const ingredientSchema = z.object({
  zh: z.string(),
  aliases: z.array(z.string()).default([]),
  en: z.object({ us: z.string(), uk: z.string().optional(), au: z.string().optional() }),
  category: z.enum(INGREDIENT_CATEGORIES),
  pairs: z.array(z.string()).default([]),
});

// 过敏原类别（设计文档 4.10 的 9 个标签），关键词见 knowledge/allergens.yaml
export const ALLERGEN_IDS = ["peanut", "tree-nut", "shellfish", "fish", "egg", "dairy", "gluten", "soy", "sesame"] as const;

export const allergenSchema = z.object({
  id: z.enum(ALLERGEN_IDS),
  zh: z.string(),
  en: z.string(),
  keywords: z.array(z.string().min(1)).min(1),
  except: z.array(z.string().min(1)).default([]),
});

export const allergensFileSchema = z.object({
  ...reviewMeta,
  allergens: z.array(allergenSchema).min(1),
  review_notes: z.array(z.string()).default([]),
});

export const ingredientsFileSchema = z.object({
  ...reviewMeta,
  ingredients: z.array(ingredientSchema).min(1),
});

export const dishSchema = z.object({
  zh: z.string(),
  en: z.string(),
  original: z.string().optional(),
  key: z.string(),
  flavors: z.array(z.string()).min(1),
  scenes: z.array(z.string()).default([]),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const cuisineSchema = z.object({
  id: z.string().regex(/^[a-z-]+$/),
  ...reviewMeta,
  name: z.object({ zh: z.string(), en: z.string() }),
  group: z.enum(CUISINE_GROUPS),
  overview: z.string(),
  flavor_tags: z.array(z.string()).min(1),
  flavor_profiles: z.array(z.object({ name: z.string(), how: z.string() })).min(1),
  core_seasonings: z.array(z.object({ zh: z.string(), en: z.string(), role: z.string() })).min(1),
  techniques: z.array(z.object({ name: z.string(), key_points: z.string() })).min(1),
  common_ingredients: z.array(z.string()).min(1),
  representative_dishes: z.array(dishSchema).min(1),
  overseas: z
    .array(
      z.object({
        item: z.string(),
        where: z.string(),
        substitute: z.string(),
        difference: z.string(),
      }),
    )
    .min(1),
  review_notes: z.array(z.string()).default([]),
});

export type Flavor = z.infer<typeof flavorSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type Ingredient = z.infer<typeof ingredientSchema>;
export type Dish = z.infer<typeof dishSchema>;
export type Allergen = z.infer<typeof allergenSchema>;
export type AllergenId = (typeof ALLERGEN_IDS)[number];
export type CuisineGroup = (typeof CUISINE_GROUPS)[number];

/** 编译后随应用发布的菜系条目（去掉审核元数据与 review_notes） */
export type Cuisine = Omit<
  z.infer<typeof cuisineSchema>,
  "status" | "reviewed_by" | "reviewed_at" | "review_notes"
>;

export interface KnowledgeBase {
  version: string;
  flavors: Flavor[];
  scenes: Scene[];
  ingredients: Ingredient[];
  cuisines: Cuisine[];
  allergens: Allergen[];
  /** allergens.yaml 是否已终审（未终审也会使用，见 compile.ts） */
  allergensReviewed: boolean;
  /** 各文件的审核状态（含未上线的草稿），供后台“知识库”页只读查看（F40） */
  review: ReviewEntry[];
}

export interface ReviewEntry {
  file: string;
  title: string;
  status: "draft" | "reviewed";
  reviewedBy: string | null;
  reviewedAt: string | null;
  notes: number;
  /** 是否进了这次构建 */
  published: boolean;
}
