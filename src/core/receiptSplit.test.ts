import { describe, expect, it } from "vitest";
import { computeReceiptOwed, type SplitLine } from "./receiptSplit";

const ORDER = ["payam", "lyra", "eliana", "arman"];

function item(id: string, amountMinor: number, sharerIds: string[]): SplitLine {
  return { id, amountMinor, sharerIds, kind: "item" };
}

describe("computeReceiptOwed — item lines", () => {
  it("gives a solo line entirely to its one sharer", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [item("a", 15_500_000, ["payam"])],
      ORDER,
    );
    expect(owedByMemberId.get("payam")).toBe(15_500_000);
    expect(owedByMemberId.size).toBe(1);
  });

  it("splits an evenly divisible line exactly", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [item("a", 26_000_000, ["lyra", "eliana"])],
      ORDER,
    );
    expect(owedByMemberId.get("lyra")).toBe(13_000_000);
    expect(owedByMemberId.get("eliana")).toBe(13_000_000);
  });

  it("hands the leftover unit to the earliest member in memberOrder", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [item("a", 14_200_000, ["arman", "eliana", "lyra"])],
      ORDER,
    );
    // Sharers listed arman-first, but lyra outranks them in memberOrder.
    expect(owedByMemberId.get("lyra")).toBe(4_733_334);
    expect(owedByMemberId.get("eliana")).toBe(4_733_333);
    expect(owedByMemberId.get("arman")).toBe(4_733_333);
  });

  it("reports unassigned lines and excludes them from the map", () => {
    const { owedByMemberId, unassignedLineIds } = computeReceiptOwed(
      [item("a", 1_000, ["payam"]), item("b", 5_000, [])],
      ORDER,
    );
    expect(unassignedLineIds).toEqual(["b"]);
    expect(owedByMemberId.get("payam")).toBe(1_000);
  });

  it("exposes each line's per-member slices", () => {
    const { perLineByMember } = computeReceiptOwed(
      [item("a", 26_000_000, ["lyra", "eliana"])],
      ORDER,
    );
    expect(perLineByMember.get("a")?.get("lyra")).toBe(13_000_000);
  });

  it("is order-independent", () => {
    const lines = [
      item("a", 15_500_000, ["payam"]),
      item("b", 14_200_000, ["lyra", "eliana", "arman"]),
    ];
    const forward = computeReceiptOwed(lines, ORDER).owedByMemberId;
    const reversed = computeReceiptOwed([...lines].reverse(), ORDER).owedByMemberId;
    expect([...forward].sort()).toEqual([...reversed].sort());
  });

  it("ignores a duplicated sharer instead of losing money", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [{ id: "a", amountMinor: 90, sharerIds: ["payam", "payam", "lyra"], kind: "item" }],
      ORDER,
    );
    expect(owedByMemberId.get("payam")).toBe(45);
    expect(owedByMemberId.get("lyra")).toBe(45);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(90);
  });
});

function spread(id: string, amountMinor: number): SplitLine {
  return { id, amountMinor, sharerIds: [], kind: "spread" };
}

describe("computeReceiptOwed — spread lines", () => {
  // The golden case from the design spec.
  it("distributes VAT in proportion to each person's item subtotal", () => {
    const { owedByMemberId, unassignedLineIds } = computeReceiptOwed(
      [
        item("a", 15_500_000, ["payam"]),
        item("b", 26_000_000, ["lyra", "eliana"]),
        item("c", 14_200_000, ["lyra", "eliana", "arman"]),
        spread("vat", 9_244_560),
      ],
      ORDER,
    );
    expect(owedByMemberId.get("payam")).toBe(18_072_544);
    expect(owedByMemberId.get("lyra")).toBe(20_676_545);
    expect(owedByMemberId.get("eliana")).toBe(20_676_544);
    expect(owedByMemberId.get("arman")).toBe(5_518_927);
    // A spread line alongside real items never blocks Save.
    expect(unassignedLineIds).toEqual([]);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(15_500_000 + 26_000_000 + 14_200_000 + 9_244_560);
  });

  it("reconciles exactly with several spread lines", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [
        item("a", 10_000, ["payam"]),
        item("b", 20_000, ["lyra", "eliana"]),
        spread("vat", 999),
        spread("svc", 1_777),
      ],
      ORDER,
    );
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(10_000 + 20_000 + 999 + 1_777);
  });

  it("reduces everyone proportionally for a negative spread line", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [
        item("a", 30_000, ["payam"]),
        item("b", 10_000, ["lyra"]),
        spread("disc", -4_000),
      ],
      ORDER,
    );
    expect(owedByMemberId.get("payam")).toBe(27_000);
    expect(owedByMemberId.get("lyra")).toBe(9_000);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(36_000);
  });

  it("treats spread lines as item lines when there are no item lines", () => {
    const { owedByMemberId, unassignedLineIds } = computeReceiptOwed(
      [spread("vat", 9_000)],
      ORDER,
    );
    // Nothing to be proportional to — it needs its own sharers, and blocks Save.
    expect(unassignedLineIds).toEqual(["vat"]);
    expect(owedByMemberId.size).toBe(0);
  });

  it("splits a sharer-bearing spread line directly in the degenerate case", () => {
    const { owedByMemberId, unassignedLineIds } = computeReceiptOwed(
      [{ id: "vat", amountMinor: 9_000, sharerIds: ["payam", "lyra"], kind: "spread" }],
      ORDER,
    );
    expect(unassignedLineIds).toEqual([]);
    expect(owedByMemberId.get("payam")).toBe(4_500);
    expect(owedByMemberId.get("lyra")).toBe(4_500);
  });

  it("contributes nothing when every item line is unassigned", () => {
    const { owedByMemberId, unassignedLineIds } = computeReceiptOwed(
      [item("a", 10_000, []), spread("vat", 900)],
      ORDER,
    );
    expect(unassignedLineIds).toEqual(["a"]);
    expect(owedByMemberId.size).toBe(0);
  });

  it("stays exact at IRT receipt magnitudes", () => {
    const { owedByMemberId } = computeReceiptOwed(
      [
        item("a", 123_456_789, ["payam"]),
        item("b", 987_654_321, ["lyra", "eliana", "arman"]),
        spread("vat", 111_111_111),
      ],
      ORDER,
    );
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(123_456_789 + 987_654_321 + 111_111_111);
  });
});
