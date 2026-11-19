// 评测与成本实测（技术方案第 10 节）：对 evals/cases.yaml 的每组用例跑推荐 → 教程 → 追问，
// 再对照片跑识别；记录每次调用的 token、耗时、成本，写出 evals/report-<日期>.md（原始结果另存 .json）。
//
// 用法（在服务器上以服务账号运行，见 docs/DEPLOY.md「评测」）：
//   deploy/deploy.sh eval <ssh目标> [参数]   在服务器上跑，并把报告取回本机 evals/
//   node --conditions=react-server --import tsx scripts/eval.ts [--only c01,c02] [--concurrency 4] [--no-tutorial]
//        [--image-usd 0.011] [--out 目录]
// 调用走 callModel，和线上一样预占预算并记账（model_calls 里 user_id 为空）。
// 不生成图片：图片成本以 scripts/seed-images.ts 的实测为准。
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { parse } from "yaml";
import { z } from "zod";
import { estimateUsd, modelFor, textCostUsd, type Feature } from "@config/models";
import { ArrayItemExtractor } from "../src/lib/json-stream";
import { getScene, kb } from "../src/lib/kb";
import type { RecommendedDish } from "../src/lib/recommend-types";
import { buildRestrictions, restrictionMatcher, type RestrictionRule } from "../src/lib/restrictions";
import type { TutorialContent } from "../src/lib/tutorial-types";
import { callModel } from "../src/server/ai/call";
import { normalizeRecognized, recognizeRequest, type RawRecognized } from "../src/server/ai/recognize";
import type { ModelRequest, Usage } from "../src/server/ai/types";
import { getDb, type Db } from "../src/server/db/client";
import { libraryDishes } from "../src/server/dishes";
import { buildContext, pickCuisines } from "../src/server/recommend/candidates";
import { checkDish, dishNameNorm, MAX_DISHES, rawDishSchema, recommendRequest, type RejectReason } from "../src/server/recommend/model";
import { followupRequest } from "../src/server/tutorial/followup";
import {
  defaultServings,
  restrictedInTutorial,
  tutorialContentSchema,
  tutorialRequest,
} from "../src/server/tutorial/model";

const caseSchema = z.object({
  id: z.string(),
  cuisine: z.string().optional(),
  main: z.array(z.string()),
  other: z.array(z.string()).default([]),
  flavors: z.array(z.string()).default([]),
  scene: z.string().nullable().default(null),
  allergens: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  equipment: z.array(z.string()).default([]),
  question: z.string(),
});
type Case = z.infer<typeof caseSchema>;

/** 评测用的照片与应认出的食材（evals/photos/ 下的照片只在本地，可在同名 .txt 里写期望食材，每行一个） */
const BUILTIN_PHOTO = {
  name: "src/assets/fridge.webp（台面）",
  file: "src/assets/fridge.webp",
  expected: ["鸡腿", "鸡蛋", "土豆", "洋葱", "蒜", "番茄", "葱", "豆腐"],
};

interface Call {
  feature: Feature;
  model: string;
  usage: Usage;
  costUsd: number;
  ms: number;
  firstItemMs?: number;
  ok: boolean;
  error?: string;
}

interface CaseResult {
  id: string;
  input: Case;
  candidates: string[];
  calls: Call[];
  dishes: { name: string; cuisine: string; minutes: number; toBuy: string[]; reject: RejectReason | null; detail?: string }[];
  tutorial?: {
    dish: string;
    steps: number;
    ingredients: number;
    restrictedHit: string | null;
    sceneIssue: string | null;
    timers: number;
    safetyNotes: number;
    missingCue: number;
  };
  followup?: { question: string; answer: string; onTopic: boolean };
  errors: string[];
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function timed(
  db: Db,
  req: ModelRequest,
  calls: Call[],
  onDelta?: (chunk: string) => void,
): Promise<{ text: string; call: Call }> {
  const started = Date.now();
  try {
    const r = await callModel(db, null, req, onDelta);
    const call: Call = {
      feature: req.feature,
      model: req.model,
      usage: r.usage,
      costUsd: textCostUsd(req.model, r.usage),
      ms: Date.now() - started,
      ok: true,
    };
    calls.push(call);
    return { text: r.text, call };
  } catch (e) {
    const err = e as Error & { usage?: Usage };
    const usage = err.usage ?? { inputTokens: 0, cachedTokens: 0, outputTokens: 0 };
    calls.push({
      feature: req.feature,
      model: req.model,
      usage,
      costUsd: textCostUsd(req.model, usage),
      ms: Date.now() - started,
      ok: false,
      error: err.message,
    });
    throw e;
  }
}

const expand = restrictionMatcher(kb.ingredients);

function summaryFor(c: Case): string {
  const parts: string[] = [];
  if (c.allergens.length) {
    parts.push(`对${c.allergens.map((id) => kb.allergens.find((a) => a.id === id)?.zh ?? id).join("、")}过敏`);
  }
  if (c.avoid.length) parts.push(`不吃${c.avoid.join("、")}`);
  if (c.equipment.length) parts.push(`有${c.equipment.join("、")}`);
  return parts.join("；");
}

async function runCase(db: Db, c: Case, withTutorial: boolean): Promise<CaseResult> {
  const res: CaseResult = { id: c.id, input: c, candidates: [], calls: [], dishes: [], errors: [] };
  const keywords: RestrictionRule[] = buildRestrictions(c.avoid, c.allergens, kb.allergens, expand);
  const summary = summaryFor(c);
  const params = { main: c.main, other: c.other, flavors: c.flavors, scene: c.scene, cuisine: c.cuisine ?? null };

  // ─── 推荐 ───
  let seed = 7;
  const random = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  res.candidates = pickCuisines({ main: c.main, flavors: c.flavors, cuisine: c.cuisine ?? null, random });
  const library = await libraryDishes(db, res.candidates, c.main);
  const context = buildContext({ candidates: res.candidates, scene: c.scene, libraryDishes: library });
  const req = recommendRequest({ params, candidates: res.candidates, context, summary, exclude: [], count: MAX_DISHES });
  const extractor = new ArrayItemExtractor("dishes");
  const started = Date.now();
  let firstItemMs: number | undefined;
  let text: string;
  try {
    const r = await timed(db, req, res.calls, (chunk) => {
      if (firstItemMs === undefined && extractor.push(chunk).length) firstItemMs = Date.now() - started;
    });
    r.call.firstItemMs = firstItemMs;
    text = r.text;
  } catch (e) {
    res.errors.push(`推荐失败：${(e as Error).message}`);
    return res;
  }

  const seen = new Set<string>();
  let first: RecommendedDish | null = null;
  try {
    const raw = (JSON.parse(text) as { dishes: unknown[] }).dishes;
    for (const item of raw) {
      const parsed = rawDishSchema.safeParse(item);
      if (!parsed.success) {
        const detail = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        res.dishes.push({ name: String((item as { name_zh?: string }).name_zh ?? "?"), cuisine: "?", minutes: 0, toBuy: [], reject: "invalid", detail });
        continue;
      }
      const d = parsed.data;
      const reject = checkDish(d, { candidates: res.candidates, scene: c.scene, keywords, seen });
      seen.add(dishNameNorm(d.name_zh));
      res.dishes.push({
        name: d.name_zh,
        cuisine: d.cuisine_id,
        minutes: d.total_minutes,
        toBuy: d.to_buy.map((t) => (t.required ? t.name : `${t.name}?`)),
        reject,
      });
      if (!reject && !first) {
        first = {
          dishId: "eval",
          nameZh: d.name_zh,
          nameEn: d.name_en,
          nameOriginal: d.name_original,
          cuisineId: d.cuisine_id,
          flavorTags: d.flavor_tags,
          summary: d.summary,
          totalMinutes: d.total_minutes,
          difficulty: d.difficulty,
          uses: d.uses,
          toBuy: d.to_buy,
          imageUrl: null,
        };
      }
    }
  } catch (e) {
    res.errors.push(`推荐结果无法解析：${(e as Error).message}`);
  }
  if (!first || !withTutorial) {
    if (!first) res.errors.push("没有通过检查的菜，跳过教程");
    return res;
  }

  // ─── 教程 ───
  let content: TutorialContent;
  try {
    const r = await timed(
      db,
      tutorialRequest({
        dish: first,
        params: {
          servings: defaultServings(c.scene),
          units: "metric",
          equipment: c.equipment,
          pantry: [],
          summary,
          scene: c.scene,
        },
        model: modelFor("tutorial"),
      }),
      res.calls,
    );
    content = tutorialContentSchema.parse(JSON.parse(r.text));
  } catch (e) {
    res.errors.push(`教程失败：${(e as Error).message.slice(0, 300)}`);
    return res;
  }
  const scene = c.scene ? getScene(c.scene) : undefined;
  const sc = scene?.constraints;
  const sceneIssues: string[] = [];
  if (sc?.max_steps && content.steps.length > sc.max_steps) sceneIssues.push(`${content.steps.length} 步，超过 ${sc.max_steps} 步`);
  if (sc?.max_total_minutes && content.overview.total_minutes > sc.max_total_minutes) {
    sceneIssues.push(`总时间 ${content.overview.total_minutes} 分钟，超过 ${sc.max_total_minutes}`);
  }
  res.tutorial = {
    dish: content.overview.name_zh,
    steps: content.steps.length,
    ingredients: content.ingredients.length,
    restrictedHit: restrictedInTutorial(content, keywords),
    sceneIssue: sceneIssues.join("；") || null,
    timers: content.steps.filter((s) => s.timer_seconds).length,
    safetyNotes: content.safety_notes.length,
    missingCue: content.steps.filter((s) => !s.cue.trim()).length,
  };

  // ─── 追问 ───
  try {
    const r = await timed(db, followupRequest(content, [], c.question), res.calls);
    const a = JSON.parse(r.text) as { answer: string; on_topic: boolean };
    res.followup = { question: c.question, answer: a.answer, onTopic: a.on_topic };
  } catch (e) {
    res.errors.push(`追问失败：${(e as Error).message.slice(0, 300)}`);
  }
  return res;
}

async function runRecognize(db: Db) {
  const photos: { name: string; file: string; expected: string[] }[] = [BUILTIN_PHOTO];
  const dir = join(process.cwd(), "evals/photos");
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((f) => /\.(jpe?g|png|webp|heic)$/i.test(f)).sort()) {
      const txt = join(dir, f.replace(/\.[^.]+$/, ".txt"));
      const expected = existsSync(txt) ? readFileSync(txt, "utf8").split("\n").map((s) => s.trim()).filter(Boolean) : [];
      photos.push({ name: `evals/photos/${f}`, file: join(dir, f), expected });
    }
  }
  const results: { photo: string; calls: Call[]; items: string[]; expected: string[]; found: string[]; error?: string }[] = [];
  for (const p of photos) {
    const calls: Call[] = [];
    // 和浏览器里一样：长边 1024、JPEG 质量 80
    const jpeg = await sharp(p.file).rotate().resize(1024, 1024, { fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
    try {
      const r = await timed(db, recognizeRequest([`data:image/jpeg;base64,${jpeg.toString("base64")}`]), calls);
      const { items } = normalizeRecognized(JSON.parse(r.text) as RawRecognized);
      const names = items.map((i) => i.name);
      const found = p.expected.filter((e) => names.some((n) => n.includes(e) || e.includes(n)));
      results.push({ photo: p.name, calls, items: items.map((i) => `${i.name}${i.confidence === "low" ? "?" : ""}`), expected: p.expected, found });
    } catch (e) {
      results.push({ photo: p.name, calls, items: [], expected: p.expected, found: [], error: (e as Error).message });
    }
  }
  return results;
}

// ─── 报告 ───

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const usd = (n: number) => `$${n.toFixed(4)}`;
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function featureTable(calls: Call[]) {
  const features: Feature[] = ["recognize", "recommend", "tutorial", "followup"];
  const rows = ["| 环节 | 模型 | 成功/调用 | 输入 token（缓存） | 输出 token | 单次成本 | PRD 估算 | 耗时 中位 / P90 | 首道菜 中位 |", "|---|---|---|---|---|---|---|---|---|"];
  const avgCost: Partial<Record<Feature, number>> = {};
  for (const f of features) {
    const all = calls.filter((c) => c.feature === f);
    const ok = all.filter((c) => c.ok);
    if (!all.length) continue;
    avgCost[f] = avg(ok.map((c) => c.costUsd));
    const firsts = ok.map((c) => c.firstItemMs).filter((x): x is number => x !== undefined);
    rows.push(
      `| ${f} | ${[...new Set(all.map((c) => c.model))].join(", ")} | ${ok.length}/${all.length} | ${Math.round(avg(ok.map((c) => c.usage.inputTokens)))}（${Math.round(avg(ok.map((c) => c.usage.cachedTokens)))}） | ${Math.round(avg(ok.map((c) => c.usage.outputTokens)))} | ${usd(avgCost[f]!)} | ${usd(estimateUsd[f])} | ${sec(pct(ok.map((c) => c.ms), 50))} / ${sec(pct(ok.map((c) => c.ms), 90))} | ${firsts.length ? sec(pct(firsts, 50)) : "—"} |`,
    );
  }
  return { table: rows.join("\n"), avgCost };
}

async function main() {
  const only = arg("only")?.split(",");
  const concurrency = Number(arg("concurrency") ?? 4);
  const withTutorial = !process.argv.includes("--no-tutorial");
  const file = parse(readFileSync(join(process.cwd(), "evals/cases.yaml"), "utf8")) as { cases: unknown[] };
  const cases = file.cases.map((c) => caseSchema.parse(c)).filter((c) => !only || only.includes(c.id));
  const db = await getDb();
  const startedAt = new Date();
  console.log(`评测 ${cases.length} 组用例，并发 ${concurrency}，模型：推荐 ${modelFor("recommend")}、教程 ${modelFor("tutorial")}、追问 ${modelFor("followup")}`);

  const results: CaseResult[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (next < cases.length) {
        const c = cases[next++];
        const r = await runCase(db, c, withTutorial);
        results.push(r);
        const cost = r.calls.reduce((s, x) => s + x.costUsd, 0);
        console.log(`  ${c.id} ${r.errors.length ? "有问题" : "完成"}  ${usd(cost)}  ${r.dishes.map((d) => d.name + (d.reject ? `(×${d.reject})` : "")).join("、")}`);
      }
    }),
  );
  results.sort((a, b) => a.id.localeCompare(b.id));
  const recognize = only ? [] : await runRecognize(db);

  const allCalls = [...results.flatMap((r) => r.calls), ...recognize.flatMap((r) => r.calls)];
  const { table, avgCost } = featureTable(allCalls);
  const total = allCalls.reduce((s, c) => s + c.costUsd, 0);
  const day = startedAt.toISOString().slice(0, 10);

  // 一次完整做菜（PRD 6.3）：拍照 1 + 推荐 1.5 + 教程 1 + 追问 1；图片每次推荐 4 道
  const text = (avgCost.recognize ?? estimateUsd.recognize) + 1.5 * (avgCost.recommend ?? 0) + (avgCost.tutorial ?? 0) + (avgCost.followup ?? 0);
  const imageUsd = Number(arg("image-usd") ?? estimateUsd.image);
  const session = [0, 0.3, 0.7].map((hit) => ({ hit, text, image: 1.5 * 4 * (1 - hit) * imageUsd }));

  const issues: string[] = [];
  for (const r of results) {
    for (const e of r.errors) issues.push(`${r.id}：${e}`);
    for (const d of r.dishes.filter((d) => d.reject)) {
      issues.push(`${r.id}：推荐「${d.name}」被后检查拒绝（${d.reject}${d.detail ? `：${d.detail}` : ""}）`);
    }
    if (r.tutorial?.restrictedHit) issues.push(`${r.id}：教程「${r.tutorial.dish}」含忌口/过敏原关键词「${r.tutorial.restrictedHit}」（线上会重试一次）`);
    if (r.tutorial?.sceneIssue) issues.push(`${r.id}：教程「${r.tutorial.dish}」不符合场景：${r.tutorial.sceneIssue}`);
    if (r.tutorial?.missingCue) issues.push(`${r.id}：教程有 ${r.tutorial.missingCue} 步没有判断标准`);
    if (r.followup && !r.followup.onTopic) issues.push(`${r.id}：追问被判为无关（${r.followup.question}）`);
    const accepted = r.dishes.filter((d) => !d.reject).length;
    if (accepted < 3) issues.push(`${r.id}：只有 ${accepted} 道通过检查（线上会补一次）`);
  }

  const lines = [
    `# 评测报告 ${day}`,
    "",
    `- 用例：${results.length} 组${recognize.length ? `，照片 ${recognize.length} 张` : ""}；开始于 ${startedAt.toISOString()}，用时 ${((Date.now() - startedAt.getTime()) / 60000).toFixed(1)} 分钟`,
    `- 本次合计（按 OpenAI 官方单价折算）：**${usd(total)}**`,
    "- 成本按接口返回的 token 数和 `config/models.ts` 的官方单价计算；经中转调用时，实际扣费以中转后台为准。",
    "",
    "## 各环节实测",
    "",
    table,
    "",
    "## 一次完整做菜",
    "",
    `拍照 1 次 + 推荐 1.5 次 + 教程 1 份 + 追问 1 次，每次推荐 4 道菜；图片按每张 ${usd(imageUsd)} 计。`,
    "",
    "| 图片库命中率 | 文字部分 | 图片部分 | 合计 |",
    "|---|---|---|---|",
    ...session.map((s) => `| ${s.hit * 100}% | ${usd(s.text)} | ${usd(s.image)} | ${usd(s.text + s.image)} |`),
    "",
    "## 需要人工抽检的条目",
    "",
    ...(issues.length ? issues.map((i) => `- ${i}`) : ["- 无"]),
    "",
  ];
  if (recognize.length) {
    lines.push("## 拍照识别", "");
    for (const r of recognize) {
      lines.push(
        `- **${r.photo}**：${r.error ? `失败：${r.error}` : r.items.join("、")}` +
          (r.expected.length ? `\n  - 应认出 ${r.expected.length} 样，认出 ${r.found.length} 样${r.found.length < r.expected.length ? `，漏了：${r.expected.filter((e) => !r.found.includes(e)).join("、")}` : ""}` : ""),
      );
    }
    lines.push("");
  }
  lines.push("## 逐条结果", "");
  for (const r of results) {
    const c = r.input;
    const cost = r.calls.reduce((s, x) => s + x.costUsd, 0);
    lines.push(
      `### ${r.id}　${c.main.join("、")}${c.cuisine ? ` · ${c.cuisine}` : ""}${c.flavors.length ? ` · ${c.flavors.join("/")}` : ""}${c.scene ? ` · ${c.scene}` : ""}${c.allergens.length ? ` · 过敏 ${c.allergens.join("/")}` : ""}${c.avoid.length ? ` · 不吃 ${c.avoid.join("、")}` : ""}`,
      "",
      `候选菜系：${r.candidates.join("、")}　本组成本 ${usd(cost)}`,
      "",
      ...r.dishes.map(
        (d) => `- ${d.reject ? `~~${d.name}~~（${d.reject}）` : d.name} · ${d.cuisine} · ${d.minutes} 分钟${d.toBuy.length ? ` · 另买：${d.toBuy.join("、")}` : ""}`,
      ),
    );
    if (r.tutorial) {
      const t = r.tutorial;
      lines.push(
        "",
        `教程「${t.dish}」：${t.steps} 步、${t.ingredients} 样食材、${t.timers} 个计时、${t.safetyNotes} 条安全提示${t.restrictedHit ? `、**含忌口「${t.restrictedHit}」**` : ""}${t.sceneIssue ? `、**${t.sceneIssue}**` : ""}`,
      );
    }
    if (r.followup) lines.push("", `> 问：${r.followup.question}`, `>`, `> 答：${r.followup.answer.replace(/\n+/g, " ")}`);
    if (r.errors.length) lines.push("", ...r.errors.map((e) => `- ⚠ ${e}`));
    lines.push("");
  }

  const out = arg("out") ?? join(process.cwd(), "evals");
  mkdirSync(out, { recursive: true });
  const reportPath = join(out, `report-${day}.md`);
  writeFileSync(reportPath, lines.join("\n"));
  writeFileSync(join(out, `results-${day}.json`), JSON.stringify({ startedAt, results, recognize }, null, 2));
  console.log(`\n合计 ${usd(total)}，报告：${reportPath}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
