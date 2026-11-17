// 把 knowledge/ 下的 YAML 校验并编译为 src/generated/kb.json。
// 用法：npm run kb            （只收录已审条目）
//       KB_INCLUDE_DRAFT=1 npm run kb   （本地预览草稿）
//       npm run kb -- --check   （只校验，不写文件）
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parse } from "yaml";
import { compileKnowledge } from "../src/lib/kb/compile";

// 通过 npm run 调用时工作目录即项目根目录
const root = process.cwd();
const kbDir = join(root, "knowledge");
const outFile = join(root, "src", "generated", "kb.json");
const checkOnly = process.argv.includes("--check");

const read = (file: string) => {
  const text = readFileSync(file, "utf8");
  return { text, data: parse(text) as unknown };
};

const sources: string[] = [];
const load = (file: string) => {
  const { text, data } = read(file);
  sources.push(text);
  return data;
};

const flavors = load(join(kbDir, "flavors.yaml"));
const scenes = load(join(kbDir, "scenes.yaml"));
const ingredients = load(join(kbDir, "ingredients.yaml"));
const allergens = load(join(kbDir, "allergens.yaml"));
const cuisines: Record<string, unknown> = {};
for (const f of readdirSync(join(kbDir, "cuisines")).filter((f) => f.endsWith(".yaml")).sort()) {
  cuisines[basename(f, ".yaml")] = load(join(kbDir, "cuisines", f));
}

const version = createHash("sha256").update(sources.join("\n")).digest("hex").slice(0, 12);
const { kb, errors, warnings } = compileKnowledge(
  { flavors, scenes, ingredients, allergens, cuisines },
  { includeDrafts: process.env.KB_INCLUDE_DRAFT === "1", version },
);

for (const w of warnings) console.warn(`提示: ${w}`);
if (!kb) {
  for (const e of errors) console.error(`错误: ${e}`);
  console.error(`知识库校验失败（${errors.length} 处）`);
  process.exit(1);
}

const dishCount = kb.cuisines.reduce((n, c) => n + c.representative_dishes.length, 0);
console.log(
  `知识库 ${version}：菜系 ${kb.cuisines.length} 个，代表菜 ${dishCount} 道，味型 ${kb.flavors.length} 个，场景 ${kb.scenes.length} 个，食材 ${kb.ingredients.length} 个`,
);

if (!checkOnly) {
  mkdirSync(join(root, "src", "generated"), { recursive: true });
  writeFileSync(outFile, JSON.stringify(kb));
  console.log(`已写入 ${outFile.replace(`${root}/`, "")}`);
}
