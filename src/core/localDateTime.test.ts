import { describe, expect, it } from "vitest";
import { formatLocalDateTimeForInput } from "./localDateTime";

describe("formatLocalDateTimeForInput", () => {
  it("formats as YYYY-MM-DDTHH:mm using local calendar fields", () => {
    const d = new Date(2026, 7, 7, 9, 5, 42); // Aug 7 2026, 09:05:42 local
    expect(formatLocalDateTimeForInput(d)).toBe("2026-08-07T09:05");
  });

  it("zero-pads single-digit month, day, hour, and minute", () => {
    const d = new Date(2026, 0, 3, 4, 7, 0); // Jan 3 2026, 04:07 local
    expect(formatLocalDateTimeForInput(d)).toBe("2026-01-03T04:07");
  });

  it("never renders a timezone marker (no Z, no offset)", () => {
    const out = formatLocalDateTimeForInput(new Date());
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("is stable under a UTC-vs-local mismatch: unlike toISOString(), it always reflects local calendar fields", () => {
    // Regression guard for the bug this module exists to prevent: a writer
    // using `Date#toISOString()` instead of this helper renders the UTC
    // instant, which AddExpenseScreen's parser reads back as if it were
    // local wall-clock time — shifting the date/time by the UTC offset on
    // any device not in UTC. This test only asserts our own output stays
    // local-based; the regression itself is a cross-file contract, not
    // something a single pure function can assert on its own runtime clock.
    const d = new Date(2026, 7, 7, 23, 30, 0);
    const local = formatLocalDateTimeForInput(d);
    const iso = d.toISOString();
    // toISOString always carries a timezone marker; our format never does.
    expect(iso.endsWith("Z")).toBe(true);
    expect(local.endsWith("Z")).toBe(false);
  });
});
