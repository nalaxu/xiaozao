import { describe, expect, it } from "vitest";
import { thumbOf, toOfflineRecord, toPrune } from "./offline";

describe("offline store rules", () => {
  it("keeps all favorites and only the 5 most recently opened others", () => {
    const list = [
      ...Array.from({ length: 7 }, (_, i) => ({ id: `r${i}`, favorite: false, openedAt: 100 - i })),
      { id: "f-old", favorite: true, openedAt: 0 },
      { id: "f-new", favorite: true, openedAt: 200 },
    ];
    expect(toPrune(list).sort()).toEqual(["r5", "r6"]);
    expect(toPrune(list.slice(0, 3))).toEqual([]);
  });

  it("derives the thumbnail url", () => {
    expect(thumbOf("https://img.example/dishes/a/768.webp")).toBe("https://img.example/dishes/a/384.webp");
    expect(thumbOf(null)).toBeNull();
  });

  it("only stores finished tutorials", () => {
    const base = {
      id: "t",
      units: "metric" as const,
      favorite: false,
      cookedAt: null,
      dish: { id: "d", nameZh: "菜", cuisineId: "thai", imageUrl: null },
    };
    expect(toOfflineRecord({ ...base, status: "streaming", content: null })).toBeNull();
    expect(toOfflineRecord({ ...base, status: "done", content: {} as never, cuisine: null })).toMatchObject({ id: "t", cuisine: undefined });
  });
});
