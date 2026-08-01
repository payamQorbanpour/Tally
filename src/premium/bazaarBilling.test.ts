import { describe, expect, it, vi } from "vitest";
import { classifyPoolakeyError } from "./bazaarBilling";

// `bazaarBilling.ts` imports `Platform` from `react-native`. Vitest runs in
// Node and can't parse the Flow-typed RN sources, so stub it out — mirrors
// the pattern used in `src/core/aiProxy.test.ts` and
// `src/observability/sentry.test.ts` for the same reason. Only the pure
// `classifyPoolakeyError` helper is under test here; it never touches
// `Platform` at runtime.
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));

describe("classifyPoolakeyError", () => {
  it("maps a user-cancelled purchase to cancelled, not failed", () => {
    expect(classifyPoolakeyError(new Error("USER_CANCELED")).kind).toBe("cancelled");
  });

  it("maps a missing Bazaar app to unavailable", () => {
    expect(classifyPoolakeyError(new Error("BAZAAR_IS_NOT_INSTALLED")).kind).toBe("unavailable");
  });

  it("keeps anything else as failed with the reason preserved", () => {
    const r = classifyPoolakeyError(new Error("boom"));
    expect(r).toEqual({ kind: "failed", reason: "boom" });
  });

  it("survives a non-Error rejection", () => {
    expect(classifyPoolakeyError("nope")).toEqual({ kind: "failed", reason: "nope" });
  });
});
