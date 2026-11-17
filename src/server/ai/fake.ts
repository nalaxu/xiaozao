// 本地开发用的假模型：没有 OPENAI_API_KEY 时按知识库拼出结构正确的结果，并模拟流式输出。
// 只在非生产环境启用（见 call.ts）。结果不代表真实模型质量。
import { kb } from "@/lib/kb";
import { ZERO_USAGE, type ModelClient, type ModelRequest } from "./types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function emit(text: string, onDelta?: (c: string) => void) {
  for (let i = 0; i < text.length; i += 48) {
    onDelta?.(text.slice(i, i + 48));
    await sleep(25);
  }
}

function fakeRecognize(): string {
  return JSON.stringify({
    not_food: false,
    items: [
      { name_zh: "鸡蛋", name_en: "eggs", confidence: "high", quantity_hint: "6 个" },
      { name_zh: "西红柿", name_en: "tomato", confidence: "high", quantity_hint: "2 个" },
      { name_zh: "洋葱", name_en: "onion", confidence: "high", quantity_hint: null },
      { name_zh: "青椒", name_en: "green pepper", confidence: "low", quantity_hint: null },
    ],
  });
}

interface Meta {
  candidates: string[];
  count: number;
  flavors: string[];
  scene: string | null;
  main: string[];
  exclude: string[];
}

function fakeRecommend(req: ModelRequest): string {
  const text = req.user.map((c) => (c.type === "text" ? c.text : "")).join("");
  const m = /<request_meta>([\s\S]*)<\/request_meta>/.exec(text);
  const meta: Meta = m ? JSON.parse(m[1]) : { candidates: [], count: 4, flavors: [], scene: null, main: [], exclude: [] };
  const exclude = new Set(meta.exclude);
  const pools = meta.candidates.map((id) => {
    const c = kb.cuisines.find((x) => x.id === id)!;
    return c.representative_dishes
      .filter((d) => !exclude.has(d.zh))
      .filter((d) => !meta.flavors.length || d.flavors.some((f) => meta.flavors.includes(f)))
      .filter((d) => !meta.scene || meta.scene === "rice-companion" || d.scenes.includes(meta.scene) || d.difficulty === 1)
      .map((d) => ({ c, d }));
  });
  const picked: { c: (typeof kb.cuisines)[number]; d: (typeof kb.cuisines)[number]["representative_dishes"][number] }[] = [];
  for (let round = 0; picked.length < meta.count && round < 12; round++) {
    for (const pool of pools) {
      if (pool[round] && picked.length < meta.count) picked.push(pool[round]);
    }
  }
  const quick = meta.scene === "quick" || meta.scene === "late-night";
  return JSON.stringify({
    dishes: picked.map(({ c, d }) => ({
      name_zh: d.zh,
      name_en: d.en,
      name_original: d.original ?? null,
      cuisine_id: c.id,
      flavor_tags: d.flavors,
      summary: d.key.slice(0, 20),
      total_minutes: quick ? 15 : 15 + d.difficulty * 15,
      difficulty: d.difficulty,
      uses: meta.main.slice(0, 2),
      key_ingredients: meta.main.slice(0, 2),
      to_buy: meta.scene === "clear-fridge" ? [] : [{ name: c.core_seasonings[0].zh, required: true }],
      visual: `${d.en}, home-style plating`,
    })),
  });
}

export function fakeClient(): ModelClient {
  return {
    async run(req, onDelta) {
      await sleep(req.feature === "recognize" ? 1200 : 600);
      const text = req.feature === "recognize" ? fakeRecognize() : fakeRecommend(req);
      await emit(text, onDelta);
      return { text, usage: ZERO_USAGE };
    },
  };
}
