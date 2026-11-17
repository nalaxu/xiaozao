import { describe, expect, it } from "vitest";
import { dayLabel, groupByDay } from "./day-groups";

describe("groupByDay", () => {
  const now = new Date(2026, 10, 17, 9, 0);
  it("labels today, yesterday and older days", () => {
    expect(dayLabel(new Date(2026, 10, 17, 0, 5), now)).toBe("今天");
    expect(dayLabel(new Date(2026, 10, 16, 23, 59), now)).toBe("昨天");
    expect(dayLabel(new Date(2026, 10, 3), now)).toBe("11月3日");
    expect(dayLabel(new Date(2025, 11, 30), now)).toBe("2025年12月30日");
  });

  it("groups consecutive items by local day", () => {
    const items = [
      new Date(2026, 10, 17, 8),
      new Date(2026, 10, 17, 7),
      new Date(2026, 10, 15, 20),
    ].map((d) => ({ at: d.toISOString() }));
    const groups = groupByDay(items, (i) => i.at, now);
    expect(groups.map((g) => [g.label, g.items.length])).toEqual([
      ["今天", 2],
      ["11月15日", 1],
    ]);
  });
});
