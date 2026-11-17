// 把解析后的 YAML 校验并编译成 KnowledgeBase。纯函数，便于测试。
import { z } from "zod";
import {
  ALLERGEN_IDS,
  allergensFileSchema,
  cuisineSchema,
  flavorsFileSchema,
  ingredientsFileSchema,
  scenesFileSchema,
  type Cuisine,
  type KnowledgeBase,
} from "./schema";

export interface RawKnowledge {
  flavors: unknown;
  scenes: unknown;
  ingredients: unknown;
  allergens: unknown;
  /** 文件名（不含扩展名）→ 内容 */
  cuisines: Record<string, unknown>;
}

export interface CompileResult {
  kb: KnowledgeBase | null;
  errors: string[];
  warnings: string[];
}

function zodErrors(where: string, err: z.ZodError): string[] {
  return err.issues.map((i) => `${where}: ${i.path.join(".") || "(根)"} ${i.message}`);
}

export function compileKnowledge(
  raw: RawKnowledge,
  opts: { includeDrafts?: boolean; version?: string } = {},
): CompileResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const flavorsFile = flavorsFileSchema.safeParse(raw.flavors);
  const scenesFile = scenesFileSchema.safeParse(raw.scenes);
  const ingredientsFile = ingredientsFileSchema.safeParse(raw.ingredients);
  if (!flavorsFile.success) errors.push(...zodErrors("flavors.yaml", flavorsFile.error));
  if (!scenesFile.success) errors.push(...zodErrors("scenes.yaml", scenesFile.error));
  if (!ingredientsFile.success) errors.push(...zodErrors("ingredients.yaml", ingredientsFile.error));
  const allergensFile = allergensFileSchema.safeParse(raw.allergens);
  if (!allergensFile.success) errors.push(...zodErrors("allergens.yaml", allergensFile.error));

  const cuisines: z.infer<typeof cuisineSchema>[] = [];
  for (const [file, data] of Object.entries(raw.cuisines).sort(([a], [b]) => a.localeCompare(b))) {
    const parsed = cuisineSchema.safeParse(data);
    if (!parsed.success) {
      errors.push(...zodErrors(`cuisines/${file}.yaml`, parsed.error));
      continue;
    }
    if (parsed.data.id !== file) errors.push(`cuisines/${file}.yaml: id 与文件名不一致`);
    cuisines.push(parsed.data);
  }

  if (!flavorsFile.success || !scenesFile.success || !ingredientsFile.success || !allergensFile.success) {
    return { kb: null, errors, warnings };
  }

  const flavors = flavorsFile.data.flavors;
  const scenes = scenesFile.data.scenes;
  const ingredients = ingredientsFile.data.ingredients;
  const flavorIds = new Set(flavors.map((f) => f.id));
  const sceneIds = new Set(scenes.map((s) => s.id));
  const cuisineIds = new Set(cuisines.map((c) => c.id));

  const dupCheck = (label: string, values: string[]) => {
    const seen = new Set<string>();
    for (const v of values) {
      if (seen.has(v)) errors.push(`${label} 重复: ${v}`);
      seen.add(v);
    }
  };
  dupCheck("味型 id", flavors.map((f) => f.id));
  dupCheck("场景 id", scenes.map((s) => s.id));
  dupCheck("食材名", ingredients.map((i) => i.zh));
  const allergens = allergensFile.data.allergens;
  dupCheck("过敏原 id", allergens.map((a) => a.id));
  for (const id of ALLERGEN_IDS) {
    if (!allergens.some((a) => a.id === id)) errors.push(`allergens.yaml 缺少类别 ${id}`);
  }

  // 别名不能与其他食材的标准名或别名冲突，否则归一时有歧义
  const nameOwner = new Map<string, string>();
  for (const ing of ingredients) {
    for (const name of [ing.zh, ...ing.aliases]) {
      const owner = nameOwner.get(name);
      if (owner && owner !== ing.zh) errors.push(`食材名“${name}”同时属于 ${owner} 和 ${ing.zh}`);
      nameOwner.set(name, ing.zh);
    }
  }

  for (const f of flavors) {
    for (const c of f.cuisines) {
      if (!cuisineIds.has(c)) errors.push(`flavors.yaml ${f.id}: 未知菜系 ${c}`);
    }
  }

  for (const c of cuisines) {
    const where = `cuisines/${c.id}.yaml`;
    for (const t of c.flavor_tags) {
      if (!flavorIds.has(t)) errors.push(`${where}: 未知味型 ${t}`);
      const f = flavors.find((x) => x.id === t);
      if (f && !f.cuisines.includes(c.id)) {
        errors.push(`${where}: 标了 ${t}，但 flavors.yaml 的 ${t} 未列此菜系`);
      }
    }
    for (const f of flavors) {
      if (f.cuisines.includes(c.id) && !c.flavor_tags.includes(f.id)) {
        errors.push(`${where}: flavors.yaml 的 ${f.id} 列了此菜系，但菜系条目未标`);
      }
    }
    for (const name of c.common_ingredients) {
      if (!nameOwner.has(name)) errors.push(`${where}: 食材词典缺少 ${name}`);
    }
    for (const d of c.representative_dishes) {
      for (const t of d.flavors) if (!flavorIds.has(t)) errors.push(`${where} ${d.zh}: 未知味型 ${t}`);
      for (const s of d.scenes) if (!sceneIds.has(s)) errors.push(`${where} ${d.zh}: 未知场景 ${s}`);
    }
    dupCheck(`${where} 代表菜`, c.representative_dishes.map((d) => d.zh));
  }

  // 只有已审条目进入线上（PRD 5.4）
  const include = (s: "draft" | "reviewed") => s === "reviewed" || opts.includeDrafts === true;
  for (const [file, s] of [
    ["flavors.yaml", flavorsFile.data.status],
    ["scenes.yaml", scenesFile.data.status],
    ["ingredients.yaml", ingredientsFile.data.status],
  ] as const) {
    if (!include(s)) errors.push(`${file} 尚未终审，不能用于线上`);
  }
  // 过敏原关键词关系到安全：未终审也使用（多一个词只会多过滤），只提示尽快终审
  const allergensReviewed = allergensFile.data.status === "reviewed";
  if (!allergensReviewed) warnings.push("allergens.yaml 尚未终审：关键词已生效，请尽快审核");
  const published: Cuisine[] = [];
  for (const c of cuisines) {
    if (!include(c.status)) {
      warnings.push(`cuisines/${c.id}.yaml 尚未终审，已跳过`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { status, reviewed_by, reviewed_at, review_notes, ...rest } = c;
    published.push(rest);
  }

  if (errors.length > 0) return { kb: null, errors, warnings };

  const publishedIds = new Set(published.map((c) => c.id));
  return {
    kb: {
      version: opts.version ?? "dev",
      flavors: flavors.map((f) => ({ ...f, cuisines: f.cuisines.filter((c) => publishedIds.has(c)) })),
      scenes,
      ingredients,
      cuisines: published,
      allergens: allergens.map(({ id, zh, en, keywords, except }) => ({ id, zh, en, keywords, except })),
      allergensReviewed,
    },
    errors,
    warnings,
  };
}
