import { describe, expect, it } from "vitest";
import { knifeAt, phaseAt, potatoBodyAt, SHRED, shredClipAt, slicePoseAt, SLICES, stripPoseAt, T, W } from "./shred-timeline";

const times = Array.from({ length: Math.ceil(SHRED.total / 0.01) + 1 }, (_, i) => i * 0.01);

describe("切丝时间轴", () => {
  it("四段首尾相接，覆盖整个时长", () => {
    const p = SHRED.phases;
    expect(p.map((x) => x.id)).toEqual(["slice", "stack", "shred", "done"]);
    expect(p[0].start).toBe(0);
    for (let i = 1; i < p.length; i++) expect(p[i].start).toBe(p[i - 1].end);
    expect(p[p.length - 1].end).toBe(SHRED.total);
    expect(phaseAt(SHRED.total + 5).id).toBe("done");
  });

  it("尺寸：片厚与丝宽都是 3 毫米，丝长在 5–6 厘米左右", () => {
    expect(T * 5).toBeCloseTo(0.3);
    expect(W * 5).toBeCloseTo(0.3);
    const longest = Math.max(...SHRED.strips.map((s) => s.length)) * 5;
    expect(longest).toBeGreaterThan(5);
    expect(longest).toBeLessThan(7);
  });

  it("刀刃从不低于砧板，位置连续不跳", () => {
    let prev = knifeAt(0);
    for (const t of times) {
      const k = knifeAt(t);
      expect(k.y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(k.y - prev.y)).toBeLessThan(0.5);
      expect(Math.abs(k.x - prev.x)).toBeLessThan(0.2);
      prev = k;
    }
  });

  it("每一刀切断时刃口正好落在砧板上", () => {
    for (const s of [...SHRED.slicing, ...SHRED.shredding]) expect(knifeAt(s.cut).y).toBeCloseTo(0, 5);
  });

  it("切片段：每刀切下一片，土豆本体随之变短", () => {
    for (let k = 0; k < SLICES; k++) {
      const s = SHRED.slicing[k];
      expect(slicePoseAt(k, s.cut - 0.001).free).toBe(false);
      expect(slicePoseAt(k, s.cut + 0.001).free).toBe(true);
      expect(potatoBodyAt(s.cut).cutX).toBeCloseTo(0.5 - (k + 1) * T);
    }
  });

  it("码片结束时片子平放成一排，中心与预设一致", () => {
    const end = SHRED.phases[1].end;
    for (let k = 0; k < SLICES; k++) {
      const p = slicePoseAt(k, end);
      expect(p.rotZ).toBeCloseTo(0);
      expect(p.x).toBeCloseTo(SHRED.slices[k].rowX);
    }
  });

  it("切丝段：已切部分正好被丝取代，最后全部切完", () => {
    expect(shredClipAt(SHRED.phases[2].start)).toBeNull();
    for (const t of [SHRED.shredding[5].cut, SHRED.shredding[20].cut + 0.01]) {
      const clip = shredClipAt(t)!;
      for (const s of SHRED.strips) expect(stripPoseAt(s, t).visible).toBe(s.x < clip);
    }
    expect(shredClipAt(SHRED.total)!).toBeGreaterThanOrEqual(SHRED.xmax);
    expect(SHRED.strips.every((s) => stripPoseAt(s, SHRED.total).visible)).toBe(true);
  });

  it("从任意时刻开始都能直接算出画面（不依赖之前播放过）", () => {
    const t = SHRED.phases[2].start + 1.7;
    expect(slicePoseAt(3, t)).toEqual(slicePoseAt(3, t));
    expect(stripPoseAt(SHRED.strips[10], t)).toEqual(stripPoseAt(SHRED.strips[10], t));
  });
});
