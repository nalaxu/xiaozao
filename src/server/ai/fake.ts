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
      nutrition: {
        kcal: 320 + d.difficulty * 90,
        protein_g: 18 + d.difficulty * 4,
        fat_g: 14 + d.difficulty * 5,
        carbs_g: 20 + d.difficulty * 6,
        fiber_g: 3,
        sodium_mg: 900,
      },
      visual: `${d.en}, home-style plating`,
    })),
  });
}

function metaOf<T>(req: ModelRequest): T | null {
  const text = req.user.map((c) => (c.type === "text" ? c.text : "")).join("");
  const m = /<request_meta>([\s\S]*)<\/request_meta>/.exec(text);
  return m ? (JSON.parse(m[1]) as T) : null;
}

function fakeTutorial(req: ModelRequest): string {
  const meta = metaOf<{ dish: string; cuisine: string; servings: number; uses: string[] }>(req);
  const c = kb.cuisines.find((x) => x.id === meta?.cuisine) ?? kb.cuisines[0];
  const d = c.representative_dishes.find((x) => x.zh === meta?.dish);
  const servings = meta?.servings ?? 2;
  const main = meta?.uses?.length ? meta.uses : ["鸡肉"];
  return JSON.stringify({
    overview: {
      name_zh: meta?.dish ?? d?.zh ?? "示例菜",
      name_en: d?.en ?? "Sample dish",
      name_original: d?.original ?? null,
      cuisine_id: c.id,
      flavor_desc: d?.key ?? "（本地假模型生成的示例内容）",
      total_minutes: 25,
      active_minutes: 15,
      difficulty: d?.difficulty ?? 2,
      servings,
    },
    ingredients: [
      ...main.map((name, i) => ({
        group: "main",
        name_zh: name,
        name_en: name,
        amount: i === 0 ? 150 * servings : 1 * servings,
        unit: i === 0 ? "g" : "piece",
        prep: "切块",
        optional: false,
      })),
      { group: "aux", name_zh: "蒜", name_en: "garlic", amount: 3, unit: "clove", prep: "拍碎", optional: false },
      { group: "aux", name_zh: "香菜", name_en: "cilantro", amount: null, unit: "to_taste", prep: null, optional: true },
      ...c.core_seasonings.slice(0, 3).map((s, i) => ({
        group: "seasoning",
        name_zh: s.zh,
        name_en: s.en,
        amount: Math.round([1, 2, 0.5][i] * Math.sqrt(servings / 2) * 2) / 2,
        unit: ["tbsp", "tsp", "tsp"][i],
        prep: null,
        optional: false,
      })),
      { group: "seasoning", name_zh: "高汤", name_en: "stock", amount: 250, unit: "ml", prep: null, optional: true },
    ],
    substitutions: c.overseas.slice(0, 2).map((o) => ({ for: o.item, substitute: o.substitute, difference: o.difference })),
    equipment: ["炒锅", "砧板"],
    key_points: ["这是本地假模型生成的示例，只用来检查页面", "火候以判断标准为准，不要只看时间"],
    steps: [
      ...c.techniques.slice(0, 3).map((t, i) => ({
        action: `${t.name}：${t.key_points}`,
        heat: (["medium_high", "medium", "low"] as const)[i],
        oven_c: null,
        timer_seconds: [null, 180, 600][i],
        cue: ["油面微微起纹、放一根葱丝会冒小泡", "边缘微焦、香味出来", "汤汁收到能挂在勺背上"][i],
        warning: i === 0 ? "热油容易溅，下料前把食材擦干" : null,
      })),
      { action: "出锅装盘，撒上香菜。", heat: "off", oven_c: null, timer_seconds: null, cue: "趁热吃", warning: null },
    ],
    background: c.overview,
    safety_notes: ["禽肉中心温度至少 74°C，切开不能带粉红色。"],
    // 整道菜的逐项营养，主料按人数放大
    nutrition: [
      ...main.map((name, i) => {
        const [g, kcal, p, f, carbs, fiber, na] = i === 0 ? [150, 180, 30, 6, 0, 0, 100] : [60, 30, 1, 0.2, 6, 1.5, 5];
        const n = servings;
        return { name_zh: name, grams: g * n, kcal: kcal * n, protein_g: p * n, fat_g: f * n, carbs_g: carbs * n, fiber_g: fiber * n, sodium_mg: na * n };
      }),
      { name_zh: "蒜", grams: 9, kcal: 13, protein_g: 0.6, fat_g: 0, carbs_g: 3, fiber_g: 0.2, sodium_mg: 2 },
      { name_zh: "食用油", grams: 10 * servings, kcal: 90 * servings, protein_g: 0, fat_g: 10 * servings, carbs_g: 0, fiber_g: 0, sodium_mg: 0 },
      { name_zh: c.core_seasonings[0].zh, grams: 15, kcal: 10, protein_g: 1, fat_g: 0, carbs_g: 1.5, fiber_g: 0, sodium_mg: 850 },
    ],
  });
}

function fakeFollowup(req: ModelRequest): string {
  const photo = req.user.some((c) => c.type === "image");
  return JSON.stringify({
    answer: photo
      ? "（本地假模型的示例回答）从照片看锅里颜色已经开始变深，边缘有点焦黄，火可以调小一档，再翻炒半分钟就能进行下一步。"
      : "（本地假模型的示例回答）可以。没有的话用手头相近的调料代替，味道会淡一些，出锅前尝一下再补盐。",
    on_topic: true,
  });
}

export function fakeClient(): ModelClient {
  return {
    async run(req, onDelta) {
      await sleep(req.feature === "recognize" ? 1200 : 600);
      const text =
        req.feature === "recognize"
          ? fakeRecognize()
          : req.feature === "tutorial"
            ? fakeTutorial(req)
            : req.feature === "followup"
              ? fakeFollowup(req)
              : fakeRecommend(req);
      await emit(text, onDelta);
      return { text, usage: ZERO_USAGE };
    },
  };
}
