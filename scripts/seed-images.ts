// 预生成菜品图片（技术方案 8.4）：读取 knowledge/dish-seed.yaml，把菜写进图片库并排队生成，
// 用与线上相同的流程处理（预算检查、重试、记账、WebP 两种尺寸），可中断续跑。
//
// 用法（在服务器上以服务账号运行，见 docs/DEPLOY.md「预生成图片」）：
//   tsx scripts/seed-images.ts [--batch 1] [--limit 100] [--concurrency 4] [--dry-run]
// 已经有图的菜直接跳过，不计入 --limit。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { parse } from "yaml";
import { z } from "zod";
import { kb } from "../src/lib/kb";
import { getDb } from "../src/server/db/client";
import { dishes, jobs, modelCalls } from "../src/server/db/schema";
import { processImageJobs } from "../src/server/images/jobs";
import { enqueueImage } from "../src/server/images/queue";
import { dishNameNorm } from "../src/server/recommend/model";
import { spentToday } from "../src/server/usage";

const seedSchema = z.object({
  status: z.enum(["draft", "reviewed"]),
  dishes: z.array(
    z.object({
      cuisine: z.string(),
      batch: z.number().int().min(1),
      zh: z.string().min(1),
      en: z.string().min(1),
      original: z.string().optional(),
      visual: z.string().min(10).max(300),
    }),
  ),
});

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const batch = arg("batch") ? Number(arg("batch")) : undefined;
  const limit = Number(arg("limit") ?? 100);
  const concurrency = Number(arg("concurrency") ?? 4);
  const dryRun = process.argv.includes("--dry-run");

  const seed = seedSchema.parse(parse(readFileSync(join(process.cwd(), "knowledge/dish-seed.yaml"), "utf8")));
  const cuisineIds = new Set(kb.cuisines.map((c) => c.id));
  const bad = seed.dishes.filter((d) => !cuisineIds.has(d.cuisine));
  if (bad.length) throw new Error(`未知菜系：${bad.map((d) => `${d.cuisine}/${d.zh}`).join("、")}`);
  const norms = new Set<string>();
  for (const d of seed.dishes) {
    const k = `${d.cuisine}:${dishNameNorm(d.zh)}`;
    if (norms.has(k)) throw new Error(`清单里重复：${d.cuisine}/${d.zh}`);
    norms.add(k);
  }
  if (seed.status !== "reviewed") console.log("提示：dish-seed.yaml 还是 draft（未终审），按产品负责人的指示先生成。");

  const wanted = seed.dishes.filter((d) => batch === undefined || d.batch === batch);
  const db = await getDb();

  // 1. 写进图片库：已有的菜只补外观描述，不改推荐次数
  const toGenerate: { id: string; label: string }[] = [];
  let skipped = 0;
  for (const d of wanted) {
    if (toGenerate.length >= limit) break;
    const norm = dishNameNorm(d.zh);
    const [existing] = await db
      .select({ id: dishes.id, status: dishes.imageStatus })
      .from(dishes)
      .where(and(eq(dishes.cuisineId, d.cuisine), eq(dishes.nameZhNorm, norm)));
    if (existing?.status === "ready") {
      skipped++;
      continue;
    }
    if (dryRun) {
      toGenerate.push({ id: existing?.id ?? "(新)", label: `${d.cuisine}/${d.zh}` });
      continue;
    }
    const [row] = await db
      .insert(dishes)
      .values({
        cuisineId: d.cuisine,
        nameZh: d.zh,
        nameZhNorm: norm,
        nameEn: d.en,
        nameOriginal: d.original ?? null,
        visual: d.visual,
      })
      .onConflictDoUpdate({
        target: [dishes.cuisineId, dishes.nameZhNorm],
        set: { visual: sql`coalesce(${dishes.visual}, excluded.visual)` },
      })
      .returning({ id: dishes.id, status: dishes.imageStatus });
    // 之前放弃了的（failed）重新给一次机会
    if (row.status === "failed") {
      await db.update(dishes).set({ imageStatus: "none", imageAttempts: 0 }).where(eq(dishes.id, row.id));
    }
    if (row.status === "none" || row.status === "failed") await enqueueImage(db, row.id);
    toGenerate.push({ id: row.id, label: `${d.cuisine}/${d.zh}` });
  }

  console.log(`清单 ${wanted.length} 道，已有图跳过 ${skipped} 道，本次生成 ${toGenerate.length} 道（上限 ${limit}）`);
  if (dryRun) {
    for (const t of toGenerate) console.log(`  ${t.label}`);
    process.exit(0);
  }
  if (!toGenerate.length) process.exit(0);

  // 2. 按并发处理，直到这些菜都没有待处理的任务（失败重试会延后 2–4 分钟，等它们跑完）
  const ids = toGenerate.map((t) => t.id);
  const started = new Date();
  const dishFilter = inArray(sql`${jobs.payload}->>'dishId'`, ids);
  for (;;) {
    const r = await processImageJobs(db, { dishIds: ids, limit: concurrency });
    if (r.postponed) {
      console.log(`当日花费已到停图线（$${(await spentToday(db)).toFixed(2)}），剩余任务顺延到明天，由巡检继续处理。`);
      break;
    }
    const [{ ready }] = await db
      .select({ ready: sql<number>`count(*)::int` })
      .from(dishes)
      .where(and(inArray(dishes.id, ids), eq(dishes.imageStatus, "ready")));
    const open = await db
      .select({ status: jobs.status, runAfter: jobs.runAfter })
      .from(jobs)
      .where(and(eq(jobs.type, "image"), dishFilter, inArray(jobs.status, ["pending", "running"])));
    process.stdout.write(`\r已完成 ${ready}/${ids.length}，进行中或待重试 ${open.length}   `);
    if (!open.length) break;
    if (r.done + r.failed === 0) await sleep(10_000); // 都在等重试或被巡检处理中
  }
  console.log();

  // 3. 汇总：这些菜的结果 + 这段时间里图片调用的实测用量
  const rows = await db
    .select({ cuisine: dishes.cuisineId, name: dishes.nameZh, status: dishes.imageStatus })
    .from(dishes)
    .where(inArray(dishes.id, ids));
  const failed = rows.filter((r) => r.status !== "ready");
  const [usage] = await db
    .select({
      n: sql<number>`count(*) filter (where ${modelCalls.status} = 'ok')::int`,
      errors: sql<number>`count(*) filter (where ${modelCalls.status} <> 'ok')::int`,
      cost: sql<number>`coalesce(sum(${modelCalls.costUsd}), 0)::float`,
      inTok: sql<number>`coalesce(avg(${modelCalls.inputTokens}) filter (where ${modelCalls.status} = 'ok'), 0)::float`,
      outTok: sql<number>`coalesce(avg(${modelCalls.outputTokens}) filter (where ${modelCalls.status} = 'ok'), 0)::float`,
      latency: sql<number>`coalesce(avg(${modelCalls.latencyMs}) filter (where ${modelCalls.status} = 'ok'), 0)::float`,
    })
    .from(modelCalls)
    .where(and(eq(modelCalls.feature, "image"), gte(modelCalls.createdAt, started)));

  console.log(`成功 ${rows.length - failed.length} 道，失败 ${failed.length} 道`);
  for (const f of failed) console.log(`  失败：${f.cuisine}/${f.name}（${f.status}）`);
  console.log(
    [
      `图片调用 ${usage.n} 次成功、${usage.errors} 次失败（含线上用户同时触发的）`,
      `按官方单价折算合计 $${usage.cost.toFixed(4)}，平均每张 $${(usage.n ? usage.cost / usage.n : 0).toFixed(4)}`,
      `平均 token：输入 ${Math.round(usage.inTok)}，输出 ${Math.round(usage.outTok)}；平均耗时 ${(usage.latency / 1000).toFixed(1)} 秒`,
      `用时 ${((Date.now() - started.getTime()) / 60000).toFixed(1)} 分钟`,
    ].join("\n"),
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
