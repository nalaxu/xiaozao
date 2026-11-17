import { describe, expect, it } from "vitest";
import { kb } from "@/lib/kb";
import { buildRestrictions, findRestricted, restrictionMatcher } from "./restrictions";

const expand = restrictionMatcher(kb.ingredients);
const rules = (allergens: string[], avoid: string[] = []) => buildRestrictions(avoid, allergens, kb.allergens, expand);

describe("allergen rules (knowledge/allergens.yaml)", () => {
  it("covers all 9 categories", () => {
    expect(kb.allergens.map((a) => a.id).sort()).toEqual(
      ["dairy", "egg", "fish", "gluten", "peanut", "sesame", "shellfish", "soy", "tree-nut"],
    );
  });

  it("catches hidden ingredients in sauces", () => {
    expect(findRestricted(["蚝油"], rules(["shellfish"]))).not.toBeNull();
    expect(findRestricted(["fish sauce"], rules(["fish"]))).not.toBeNull();
    expect(findRestricted(["生抽"], rules(["gluten"]))).not.toBeNull();
    expect(findRestricted(["Worcestershire sauce"], rules(["fish"]))).not.toBeNull();
    expect(findRestricted(["宫保鸡丁"], rules(["peanut"]))).not.toBeNull();
  });

  it("does not flag known look-alikes", () => {
    expect(findRestricted(["椰奶", "coconut milk"], rules(["dairy"]))).toBeNull();
    expect(findRestricted(["茄子", "eggplant"], rules(["egg"]))).toBeNull();
    expect(findRestricted(["鱼香茄子", "fish-fragrant eggplant"], rules(["fish", "egg"]))).toBeNull();
    expect(findRestricted(["无麸质酱油", "rice noodles"], rules(["gluten"]))).toBeNull();
    expect(findRestricted(["lemon peel"], rules(["fish"]))).toBeNull();
  });

  it("applies exceptions only within their own category", () => {
    // “peanut butter”是奶的例外，但对花生过敏时仍要命中
    expect(findRestricted(["peanut butter"], rules(["dairy"]))).toBeNull();
    expect(findRestricted(["peanut butter"], rules(["dairy", "peanut"]))).toBe("peanut");
    // 忌口里写了椰奶，即使奶的规则排除椰奶也要命中
    expect(findRestricted(["椰奶"], rules(["dairy"], ["椰奶"]))).toBe("椰奶");
  });

  it("expands avoided dictionary ingredients to all their names", () => {
    expect(findRestricted(["fresh cilantro"], rules([], ["香菜"]))).not.toBeNull();
  });
});
