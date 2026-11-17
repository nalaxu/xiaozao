import { describe, expect, it } from "vitest";
import { formatClock, remainingSeconds, timerLabel } from "./timers";

describe("timers", () => {
  it("counts down from the end time, never below zero", () => {
    const t = { endsAt: 10_000 };
    expect(remainingSeconds(t, 0)).toBe(10);
    expect(remainingSeconds(t, 9_001)).toBe(1);
    expect(remainingSeconds(t, 10_000)).toBe(0);
    expect(remainingSeconds(t, 99_000)).toBe(0);
  });

  it("formats clock values", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(720)).toBe("12:00");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("names a timer after the main ingredient the step mentions", () => {
    const ings = [
      { name_zh: "盐", group: "seasoning" as const },
      { name_zh: "洋葱", group: "aux" as const },
      { name_zh: "鸡腿", group: "main" as const },
      { name_zh: "米饭", group: "main" as const },
    ];
    expect(timerLabel({ action: "下洋葱和鸡腿块，加盐煎到两面金黄" }, ings, 2)).toBe("鸡腿");
    expect(timerLabel({ action: "洋葱炒软" }, ings, 0)).toBe("洋葱");
    expect(timerLabel({ action: "静置" }, ings, 4)).toBe("第 5 步");
  });
});
