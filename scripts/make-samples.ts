// 生成示例教程（PRD 3.1）：每个菜系 1 篇，用线上同样的教程提示词与模型，写成 knowledge/samples/<slug>.json（status: draft）。
// 生成后由产品负责人审核，把 status 改成 reviewed 才会公开（审核时管理员可直接打开 /samples/<slug> 预览）。
//
// 用法（在服务器上以服务账号运行，花钱，约 $0.03/篇）：
//   node --env-file=/etc/howtocook/env --conditions=react-server --import tsx scripts/make-samples.ts --out <目录> [--only sichuan-mapo-tofu]
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { modelFor, textCostUsd } from "@config/models";
import { getCuisine } from "../src/lib/kb";
import type { RecommendedDish } from "../src/lib/recommend-types";
import { callModel } from "../src/server/ai/call";
import { getDb } from "../src/server/db/client";
import { restrictedInTutorial, tutorialContentSchema, tutorialRequest } from "../src/server/tutorial/model";

/** 每个菜系挑一道有代表性、家里好做、图片库里有图（或在第 1 批预生成里）的菜 */
const SAMPLES: { slug: string; cuisine: string; zh: string; summary: string; scene?: string }[] = [
  { slug: "sichuan-mapo-tofu", cuisine: "sichuan", zh: "麻婆豆腐", summary: "麻辣烫嫩，最下饭的豆腐", scene: "rice-companion" },
  { slug: "cantonese-white-cut-chicken", cuisine: "cantonese", zh: "白切鸡", summary: "皮爽肉滑，蘸姜葱油" },
  { slug: "hunan-stir-fried-pork-with-chilies", cuisine: "hunan", zh: "农家小炒肉", summary: "辣椒带焦香，肉片咸香下饭", scene: "quick" },
  { slug: "jiangzhe-red-braised-pork-belly", cuisine: "jiangzhe", zh: "红烧肉", summary: "浓油赤酱，肥而不腻" },
  { slug: "northern-home-tomato-and-egg", cuisine: "northern-home", zh: "西红柿炒鸡蛋", summary: "酸甜带汁，拌饭一流", scene: "quick" },
  { slug: "japanese-oyakodon", cuisine: "japanese", zh: "亲子丼", summary: "甜咸酱汁裹着半熟蛋和鸡肉", scene: "quick" },
  { slug: "korean-kimchi-jjigae", cuisine: "korean", zh: "泡菜锅", summary: "酸辣热乎，一锅配一碗饭", scene: "one-pot" },
  { slug: "thai-pad-kra-pao", cuisine: "thai", zh: "打抛猪肉饭", summary: "罗勒香辣，配一只脆边煎蛋", scene: "quick" },
  { slug: "vietnamese-lemongrass-chili-chicken", cuisine: "vietnamese", zh: "香茅辣椒炒鸡", summary: "香茅清香，咸甜微辣", scene: "quick" },
  { slug: "indian-butter-chicken", cuisine: "indian", zh: "黄油鸡", summary: "番茄奶油酱浓郁顺滑，香料不冲" },
  { slug: "levant-turkish-shakshuka", cuisine: "levant-turkish", zh: "番茄炖蛋", summary: "番茄甜椒酱里卧几只溏心蛋", scene: "one-pot" },
  { slug: "italian-carbonara", cuisine: "italian", zh: "卡邦尼意面", summary: "蛋黄奶酪酱裹面，黑胡椒提味", scene: "quick" },
  { slug: "french-roast-chicken", cuisine: "french", zh: "法式烤鸡", summary: "皮脆肉嫩，黄油香草香" },
  { slug: "mexican-chicken-tinga", cuisine: "mexican", zh: "奇波特雷手撕鸡", summary: "烟熏辣番茄酱拌手撕鸡，配脆饼" },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const out = arg("out") ?? join(process.cwd(), "knowledge/samples");
  const only = arg("only")?.split(",");
  mkdirSync(out, { recursive: true });
  const db = await getDb();
  const model = modelFor("tutorial");
  let total = 0;

  const todo = SAMPLES.filter((s) => !only || only.includes(s.slug));
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < todo.length) {
        const s = todo[next++];
        const rep = getCuisine(s.cuisine)?.representative_dishes.find((d) => d.zh === s.zh);
        if (!rep) {
          console.log(`  ${s.slug}：知识库里没有这道代表菜，跳过`);
          continue;
        }
        const dish: RecommendedDish = {
          dishId: s.slug,
          nameZh: rep.zh,
          nameEn: rep.en,
          nameOriginal: rep.original ?? null,
          cuisineId: s.cuisine,
          flavorTags: rep.flavors,
          summary: s.summary,
          totalMinutes: 0,
          difficulty: rep.difficulty,
          uses: [],
          toBuy: [],
          imageUrl: null,
        };
        try {
          const r = await callModel(
            db,
            null,
            tutorialRequest({
              dish,
              params: { servings: 2, units: "metric", equipment: [], pantry: [], summary: "", scene: s.scene ?? null },
              model,
            }),
          );
          const content = tutorialContentSchema.parse(JSON.parse(r.text));
          if (restrictedInTutorial(content, [])) throw new Error("意外的忌口命中");
          const cost = textCostUsd(model, r.usage);
          total += cost;
          writeFileSync(
            join(out, `${s.slug}.json`),
            `${JSON.stringify(
              {
                slug: s.slug,
                status: "draft",
                reviewed_by: null,
                reviewed_at: null,
                cuisine_id: s.cuisine,
                generated_at: new Date().toISOString(),
                model,
                content,
              },
              null,
              2,
            )}\n`,
          );
          console.log(`  ${s.slug}：${content.steps.length} 步，约 $${cost.toFixed(4)}`);
        } catch (e) {
          console.log(`  ${s.slug}：失败 ${(e as Error).message.slice(0, 200)}`);
        }
      }
    }),
  );
  console.log(`合计约 $${total.toFixed(4)}，写入 ${out}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
