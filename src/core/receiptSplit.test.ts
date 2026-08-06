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
});
