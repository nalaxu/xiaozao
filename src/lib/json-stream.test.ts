import { describe, expect, it } from "vitest";
import { ArrayItemExtractor } from "./json-stream";

describe("ArrayItemExtractor", () => {
  it("yields each object once it is complete, across arbitrary chunk boundaries", () => {
    const text = JSON.stringify({
      dishes: [
        { name: "鱼香{茄子}", tags: ["a", "b"], nested: { x: "}" } },
        { name: 'quote " inside', n: 2 },
        { name: "third" },
      ],
    });
    for (const size of [1, 3, 7, 50, text.length]) {
      const ex = new ArrayItemExtractor<{ name: string }>("dishes");
      const got: string[] = [];
      for (let i = 0; i < text.length; i += size) {
        got.push(...ex.push(text.slice(i, i + size)).map((d) => d.name));
      }
      expect(got).toEqual(["鱼香{茄子}", 'quote " inside', "third"]);
    }
  });

  it("does not emit a partial object", () => {
    const ex = new ArrayItemExtractor("dishes");
    expect(ex.push('{"dishes":[{"a":1},{"a":')).toEqual([{ a: 1 }]);
    expect(ex.push("2")).toEqual([]);
    expect(ex.push("}]}")).toEqual([{ a: 2 }]);
  });

  it("ignores objects after the array ends", () => {
    const ex = new ArrayItemExtractor("dishes");
    expect(ex.push('{"dishes":[{"a":1}],"other":{"b":2}}')).toEqual([{ a: 1 }]);
  });
});
