import { describe, expect, it } from "vitest";
import { perImageBase64Budget } from "./downscaleReceiptImage";

/**
 * Covers the budget arithmetic only. `downscaleReceiptImage` itself is not
 * exercised here: it dynamically imports `expo-image-manipulator`, a native
 * module with no Node build, and every one of its failure paths already
 * falls back to returning the input unchanged.
 *
 * `MAX_RECEIPT_IMAGES` is restated as a literal rather than imported —
 * `parseReceiptImage.ts` pulls in the Supabase client and React Native,
 * which Vitest can't parse without the stubbing this spec has no other need
 * for.
 */
const MAX_RECEIPT_IMAGES = 3;

describe("perImageBase64Budget", () => {
  it("splits the request budget across the per-receipt photo cap", () => {
    expect(perImageBase64Budget(4_000_000, 3)).toBe(1_333_333);
  });

  it("keeps a full batch of budgeted images within the request budget", () => {
    // The property that actually matters — and the one whose absence caused
    // the bug this exists for. Before the split, three photos each just
    // under the full 4MB threshold were each left un-downscaled and their
    // ~12MB sum blew the proxy's 10MB body cap.
    const budget = 4_000_000;
    const perImage = perImageBase64Budget(budget, MAX_RECEIPT_IMAGES);
    expect(perImage * MAX_RECEIPT_IMAGES).toBeLessThanOrEqual(budget);
  });

  it("floors rather than rounding, so the sum can never exceed the budget", () => {
    // 10 / 3 is 3.33; rounding up to 4 would let three images total 12.
    expect(perImageBase64Budget(10, 3)).toBe(3);
  });

  it("gives a single-image request the whole budget", () => {
    expect(perImageBase64Budget(4_000_000, 1)).toBe(4_000_000);
  });

  it("treats a nonsensical image count as a single image rather than dividing by it", () => {
    // Guards the call site against a misconfigured cap shrinking every image
    // to nothing — or, at a count of 0, producing Infinity.
    expect(perImageBase64Budget(4_000_000, 0)).toBe(4_000_000);
    expect(perImageBase64Budget(4_000_000, -3)).toBe(4_000_000);
    expect(perImageBase64Budget(4_000_000, Number.NaN)).toBe(4_000_000);
  });

  it("returns 0 for a non-positive or non-finite budget", () => {
    // 0 means "downscale everything" at the call site, which is the safe
    // direction to fail: a too-small upload beats a rejected one.
    expect(perImageBase64Budget(0, 3)).toBe(0);
    expect(perImageBase64Budget(-1, 3)).toBe(0);
    expect(perImageBase64Budget(Number.NaN, 3)).toBe(0);
    expect(perImageBase64Budget(Number.POSITIVE_INFINITY, 3)).toBe(0);
  });
});
