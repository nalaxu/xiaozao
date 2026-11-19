// 示例教程（PRD 3.1、设计文档 4.9）：knowledge/samples/*.json，提前生成并经产品负责人审核的静态内容。
// 线上只展示 status: reviewed 的；草稿只在本地开发和管理员打开链接时可见，方便审核。
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { tutorialContentSchema } from "./tutorial/model";

export const sampleSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  status: z.enum(["draft", "reviewed"]),
  reviewed_by: z.string().nullable().optional(),
  reviewed_at: z.string().nullable().optional(),
  cuisine_id: z.string(),
  generated_at: z.string(),
  model: z.string(),
  content: tutorialContentSchema,
});

export type Sample = z.infer<typeof sampleSchema>;

const DIR = join(process.cwd(), "knowledge", "samples");
let cache: Sample[] | null = null;

/** 全部示例（含草稿），按菜系顺序；文件格式不对直接报错，构建时就能发现 */
export function allSamples(): Sample[] {
  if (cache) return cache;
  if (!existsSync(DIR)) return (cache = []);
  cache = readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      const parsed = sampleSchema.safeParse(JSON.parse(readFileSync(join(DIR, f), "utf8")));
      if (!parsed.success) throw new Error(`示例教程 ${f} 格式不对：${parsed.error.message}`);
      if (`${parsed.data.slug}.json` !== f) throw new Error(`示例教程 ${f} 的 slug 与文件名不一致`);
      return parsed.data;
    });
  return cache;
}

const showDrafts = () => process.env.NODE_ENV !== "production";

/** 对所有人公开的示例 */
export function publicSamples(cuisineId?: string): Sample[] {
  return allSamples().filter(
    (s) => (s.status === "reviewed" || showDrafts()) && (!cuisineId || s.cuisine_id === cuisineId),
  );
}

/** 按 slug 取一篇；草稿只给管理员（isAdmin）看 */
export function findSample(slug: string, isAdmin: boolean): Sample | null {
  const s = allSamples().find((x) => x.slug === slug);
  if (!s) return null;
  if (s.status !== "reviewed" && !showDrafts() && !isAdmin) return null;
  return s;
}
