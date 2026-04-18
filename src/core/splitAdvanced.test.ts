import { describe, expect, it } from "vitest";
import {
  splitEqualWithAdjustmentsMinor,
  splitExactMinor,
  splitPercentMinor,
  splitSharesMinor,
} from "./splitAdvanced";

describe("splitExactMinor", () => {
  it("accepts matching parts", () => {
    const m = splitExactMinor(100, [
      { userId: "a", minor: 60 },
      { userId: "b", minor: 40 },
    ]);
    expect(m.get("a")).toBe(60);
    expect(m.get("b")).toBe(40);
  });

  it("rejects mismatch", () => {
    expect(() =>
      splitExactMinor(100, [
        { userId: "a", minor: 50 },
        { userId: "b", minor: 40 },
      ]),
    ).toThrow();
  });
});

describe("splitPercentMinor", () => {
  it("sums to totalMinor", () => {
    const m = splitPercentMinor(10000, [
      { userId: "a", percent: 33 },
      { userId: "b", percent: 33 },
      { userId: "c", percent: 34 },
    ]);
    let s = 0;
    for (const v of m.values()) s += v;
    expect(s).toBe(10000);
  });

  it("rejects percent sum != 100", () => {
    expect(() =>
      splitPercentMinor(100, [
        { userId: "a", percent: 50 },
        { userId: "b", percent: 40 },
      ]),
    ).toThrow();
  });
});

describe("splitSharesMinor", () => {
  it("splits 100 across 2:1", () => {
    const m = splitSharesMinor(100, [
      { userId: "a", shares: 2 },
      { userId: "b", shares: 1 },
    ]);
    expect([...m.values()].reduce((x, y) => x + y, 0)).toBe(100);
    expect(m.get("a")).toBe(67);
    expect(m.get("b")).toBe(33);
  });
});

describe("splitEqualWithAdjustmentsMinor", () => {
  it("applies zero-sum adjustments on top of equal split", () => {
    const adj = new Map<string, number>([
      ["a", 50],
      ["b", -50],
    ]);
    const m = splitEqualWithAdjustmentsMinor(1000, ["a", "b"], adj);
    expect(m.get("a")).toBe(550);
    expect(m.get("b")).toBe(450);
  });

  it("rejects non-zero-sum adjustments", () => {
    expect(() =>
      splitEqualWithAdjustmentsMinor(100, ["a", "b"], new Map([
        ["a", 10],
        ["b", 0],
      ])),
    ).toThrow(/sum to zero/);
  });
});
