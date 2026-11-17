import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { compileKnowledge, type RawKnowledge } from "./compile";

const kbDir = join(process.cwd(), "knowledge");
const load = (f: string) => parse(readFileSync(join(kbDir, f), "utf8")) as Record<string, unknown>;

function realKnowledge(): RawKnowledge {
  const cuisines: Record<string, unknown> = {};
  for (const f of readdirSync(join(kbDir, "cuisines")).filter((f) => f.endsWith(".yaml"))) {
    cuisines[basename(f, ".yaml")] = load(`cuisines/${f}`);
  }
  return {
    flavors: load("flavors.yaml"),
    scenes: load("scenes.yaml"),
    ingredients: load("ingredients.yaml"),
    cuisines,
  };
}

const clone = <T>(x: T): T => structuredClone(x);

describe("compileKnowledge", () => {
  it("当前知识库校验通过", () => {
    const { kb, errors } = compileKnowledge(realKnowledge());
    expect(errors).toEqual([]);
    expect(kb?.cuisines).toHaveLength(14);
    expect(kb?.cuisines.every((c) => !("review_notes" in c))).toBe(true);
  });

  it("草稿菜系不进入线上，除非显式包含", () => {
    const raw = realKnowledge();
    const sichuan = clone(raw.cuisines.sichuan) as Record<string, unknown>;
    sichuan.status = "draft";
    raw.cuisines.sichuan = sichuan;

    const published = compileKnowledge(raw);
    expect(published.kb?.cuisines.map((c) => c.id)).not.toContain("sichuan");
    expect(published.kb?.flavors.find((f) => f.id === "numbing-spicy")?.cuisines).toEqual([]);
    expect(published.warnings.join()).toContain("sichuan");

    const preview = compileKnowledge(raw, { includeDrafts: true });
    expect(preview.kb?.cuisines.map((c) => c.id)).toContain("sichuan");
  });

  it("菜系味型与 flavors.yaml 不一致时报错", () => {
    const raw = realKnowledge();
    const sichuan = clone(raw.cuisines.sichuan) as { flavor_tags: string[] };
    sichuan.flavor_tags = sichuan.flavor_tags.filter((t) => t !== "garlicky");
    raw.cuisines.sichuan = sichuan;
    const { kb, errors } = compileKnowledge(raw);
    expect(kb).toBeNull();
    expect(errors.join("\n")).toContain("garlicky 列了此菜系");
  });

  it("引用未知场景、食材词典缺失时报错", () => {
    const raw = realKnowledge();
    const c = clone(raw.cuisines.thai) as {
      common_ingredients: string[];
      representative_dishes: { scenes: string[] }[];
    };
    c.representative_dishes[0].scenes = ["brunch"];
    c.common_ingredients.push("独角兽肉");
    raw.cuisines.thai = c;
    const errors = compileKnowledge(raw).errors.join("\n");
    expect(errors).toContain("未知场景 brunch");
    expect(errors).toContain("食材词典缺少 独角兽肉");
  });

  it("难度越界时报出具体字段", () => {
    const raw = realKnowledge();
    const c = clone(raw.cuisines.thai) as { representative_dishes: { difficulty: number }[] };
    c.representative_dishes[1].difficulty = 4;
    raw.cuisines.thai = c;
    const { kb, errors } = compileKnowledge(raw);
    expect(kb).toBeNull();
    expect(errors.join("\n")).toContain("cuisines/thai.yaml: representative_dishes.1.difficulty");
  });

  it("id 与文件名不一致时报错", () => {
    const raw = realKnowledge();
    raw.cuisines["thai-copy"] = raw.cuisines.thai;
    expect(compileKnowledge(raw).errors.join()).toContain("thai-copy.yaml: id 与文件名不一致");
  });
});
