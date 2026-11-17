import { describe, expect, it } from "vitest";
import { normalizeRecognized } from "./recognize";

describe("normalizeRecognized", () => {
  it("maps names to dictionary entries, keeps unknown ones, and dedupes preferring high confidence", () => {
    const r = normalizeRecognized({
      not_food: false,
      items: [
        { name_zh: "西红柿", name_en: "tomato", confidence: "low", quantity_hint: null },
        { name_zh: "番茄", name_en: "tomatoes", confidence: "high", quantity_hint: "2 个" },
        { name_zh: "芫荽", name_en: "cilantro", confidence: "high", quantity_hint: null },
        { name_zh: "龙眼", name_en: "longan", confidence: "low", quantity_hint: null },
      ],
    });
    expect(r.notFood).toBe(false);
    expect(r.items).toEqual([
      { name: "番茄", inDictionary: true, confidence: "high", quantityHint: "2 个" },
      { name: "香菜", inDictionary: true, confidence: "high", quantityHint: null },
      { name: "龙眼", inDictionary: false, confidence: "low", quantityHint: null },
    ]);
  });

  it("reports not_food only when nothing was found", () => {
    expect(normalizeRecognized({ not_food: true, items: [] }).notFood).toBe(true);
  });
});
