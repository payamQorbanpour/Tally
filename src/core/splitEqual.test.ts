import { describe, expect, it } from "vitest";
import { splitEqualMinor } from "./splitEqual";

describe("splitEqualMinor", () => {
  it("splits 100 cents across 3", () => {
    const m = splitEqualMinor(100, ["a", "b", "c"]);
    expect([...m.values()].reduce((s, v) => s + v, 0)).toBe(100);
    expect(m.get("a")).toBe(34);
    expect(m.get("b")).toBe(33);
    expect(m.get("c")).toBe(33);
  });
});
