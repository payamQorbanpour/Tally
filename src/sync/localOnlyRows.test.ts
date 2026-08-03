import { describe, expect, it } from "vitest";
import { diffLocalOnlyIds } from "./localOnlyRows";

describe("diffLocalOnlyIds", () => {
  it("keeps only the local ids the account doesn't have", () => {
    expect(diffLocalOnlyIds(["a", "b", "c"], new Set(["b"]))).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns nothing when every local row is already in the account", () => {
    expect(diffLocalOnlyIds(["a", "b"], new Set(["a", "b", "z"]))).toEqual([]);
  });

  it("returns everything when the account is empty", () => {
    expect(diffLocalOnlyIds(["a", "b"], new Set())).toEqual(["a", "b"]);
  });

  it("handles an empty local table", () => {
    expect(diffLocalOnlyIds([], new Set(["a"]))).toEqual([]);
  });

  // Marking a row that DOES exist remotely would make `shouldApplyRemoteRow`
  // skip a legitimately newer remote version during the pull, after which the
  // push would overwrite the server with stale local data. Precision is the
  // whole point of this function.
  it("never includes an id present on both sides", () => {
    const out = diffLocalOnlyIds(["shared", "local"], new Set(["shared"]));
    expect(out).not.toContain("shared");
    expect(out).toEqual(["local"]);
  });

  it("preserves duplicates rather than silently deduping", () => {
    expect(diffLocalOnlyIds(["a", "a"], new Set())).toEqual(["a", "a"]);
  });
});
