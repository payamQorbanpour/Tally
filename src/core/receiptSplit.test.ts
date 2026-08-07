import { describe, expect, it } from "vitest";
import { computeReceiptSplit, type ReceiptItem } from "./receiptSplit";

const ORDER = ["payam", "lyra", "eliana", "arman"];

function item(id: string, amountMinor: number, sharerIds: string[]): ReceiptItem {
  return { id, amountMinor, sharerIds };
}

function allValues(result: {
  owedByMemberId: Map<string, number>;
  vatByItemId: Map<string, number>;
  discountByItemId: Map<string, number>;
  receiptTotalMinor: number;
}): number[] {
  return [
    ...result.owedByMemberId.values(),
    ...result.vatByItemId.values(),
    ...result.discountByItemId.values(),
    result.receiptTotalMinor,
  ];
}

describe("computeReceiptSplit — items only (vatRatePpm 0, discountMinor 0)", () => {
  it("gives a solo item entirely to its one sharer", () => {
    const { owedByMemberId } = computeReceiptSplit({
      items: [item("a", 15_500_000, ["payam"])],
      vatRatePpm: 0,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(owedByMemberId.get("payam")).toBe(15_500_000);
    expect(owedByMemberId.size).toBe(1);
  });

  it("splits an evenly divisible item exactly", () => {
    const { owedByMemberId } = computeReceiptSplit({
      items: [item("a", 26_000_000, ["lyra", "eliana"])],
      vatRatePpm: 0,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(owedByMemberId.get("lyra")).toBe(13_000_000);
    expect(owedByMemberId.get("eliana")).toBe(13_000_000);
  });

  it("hands the leftover unit to the earliest member in memberOrder", () => {
    const { owedByMemberId } = computeReceiptSplit({
      items: [item("a", 14_200_000, ["arman", "eliana", "lyra"])],
      vatRatePpm: 0,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    // Sharers listed arman-first, but lyra outranks them in memberOrder.
    expect(owedByMemberId.get("lyra")).toBe(4_733_334);
    expect(owedByMemberId.get("eliana")).toBe(4_733_333);
    expect(owedByMemberId.get("arman")).toBe(4_733_333);
  });

  it("reports unassigned items and excludes them from owedByMemberId", () => {
    const { owedByMemberId, unassignedItemIds } = computeReceiptSplit({
      items: [item("a", 1_000, ["payam"]), item("b", 5_000, [])],
      vatRatePpm: 0,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(unassignedItemIds).toEqual(["b"]);
    expect(owedByMemberId.get("payam")).toBe(1_000);
    expect(owedByMemberId.has("b")).toBe(false);
  });

  it("ignores a duplicated sharer instead of losing money", () => {
    const { owedByMemberId } = computeReceiptSplit({
      items: [{ id: "a", amountMinor: 90, sharerIds: ["payam", "payam", "lyra"] }],
      vatRatePpm: 0,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(owedByMemberId.get("payam")).toBe(45);
    expect(owedByMemberId.get("lyra")).toBe(45);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(90);
  });

  it("is order-independent when there is no discount to tie-break", () => {
    const items = [
      item("a", 15_500_000, ["payam"]),
      item("b", 14_200_000, ["lyra", "eliana", "arman"]),
    ];
    const forward = computeReceiptSplit({
      items,
      vatRatePpm: 165_970,
      discountMinor: 0,
      memberOrder: ORDER,
    }).owedByMemberId;
    const reversed = computeReceiptSplit({
      items: [...items].reverse(),
      vatRatePpm: 165_970,
      discountMinor: 0,
      memberOrder: ORDER,
    }).owedByMemberId;
    expect([...forward].sort()).toEqual([...reversed].sort());
  });

  it("returns an empty result for an empty receipt", () => {
    const result = computeReceiptSplit({
      items: [],
      vatRatePpm: 100_000,
      discountMinor: 500,
      memberOrder: ORDER,
    });
    expect(result.owedByMemberId.size).toBe(0);
    expect(result.vatByItemId.size).toBe(0);
    expect(result.discountByItemId.size).toBe(0);
    expect(result.unassignedItemIds).toEqual([]);
    expect(result.receiptTotalMinor).toBe(0);
  });
});

describe("computeReceiptSplit — VAT (a receipt-wide percentage, not a per-line toggle)", () => {
  // The worked case from the task: 3,800,000 at 10% contributes exactly
  // 380,000 of tax. vatRatePpm for 10% is 100,000 (10% = 100,000 / 1,000,000).
  it("computes VAT on a single item at Iranian rates", () => {
    const { owedByMemberId, vatByItemId } = computeReceiptSplit({
      items: [item("a", 3_800_000, ["payam"])],
      vatRatePpm: 100_000,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(vatByItemId.get("a")).toBe(380_000);
    expect(owedByMemberId.get("payam")).toBe(3_800_000 + 380_000);
  });

  // Hand-derived: each item's VAT is 10% of its own (undiscounted) amount —
  // a=1,550,000; b=2,600,000; c=1,420,000, all exact (each amount is
  // divisible by 10). Item "c" (14,200,000 + 1,420,000 = 15,620,000) splits
  // 3 ways: base 5,206,666, remainder 2 → the earliest 2 sharers in
  // memberOrder (lyra, eliana) get +1.
  it("reconciles exactly across a multi-item receipt", () => {
    const { owedByMemberId, receiptTotalMinor } = computeReceiptSplit({
      items: [
        item("a", 15_500_000, ["payam"]),
        item("b", 26_000_000, ["lyra", "eliana"]),
        item("c", 14_200_000, ["lyra", "eliana", "arman"]),
      ],
      vatRatePpm: 100_000,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(receiptTotalMinor).toBe(55_700_000 + 5_570_000);
    expect(owedByMemberId.get("payam")).toBe(17_050_000);
    expect(owedByMemberId.get("lyra")).toBe(14_300_000 + 5_206_667);
    expect(owedByMemberId.get("eliana")).toBe(14_300_000 + 5_206_667);
    expect(owedByMemberId.get("arman")).toBe(5_206_666);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(receiptTotalMinor);
  });

  // The bug that prompted this rework: in the old model, an unassigned
  // item's VAT concentrated onto whichever items happened to be assigned.
  // Here, two identical items — one assigned, one not — must get IDENTICAL
  // VAT, proving the assigned item's VAT is not inflated by the other's
  // lack of assignment.
  it("gives every item its own VAT regardless of assignment, without inflating assigned items", () => {
    const { vatByItemId, owedByMemberId, unassignedItemIds, receiptTotalMinor } =
      computeReceiptSplit({
        items: [item("a", 1_420_000, ["payam"]), item("b", 1_420_000, [])],
        vatRatePpm: 100_000,
        discountMinor: 0,
        memberOrder: ORDER,
      });
    // Old buggy behavior would have put +709,582 on "a" alone. Both items
    // must independently show 10% of their own amount.
    expect(vatByItemId.get("a")).toBe(142_000);
    expect(vatByItemId.get("b")).toBe(142_000);
    expect(unassignedItemIds).toEqual(["b"]);
    // Only the assigned item's total lands on a member...
    expect(owedByMemberId.get("payam")).toBe(1_420_000 + 142_000);
    expect(owedByMemberId.size).toBe(1);
    // ...but the receipt's real total still includes "b"'s VAT, because the
    // bill itself doesn't care who has claimed what yet.
    expect(receiptTotalMinor).toBe((1_420_000 + 142_000) * 2);
    const owedSum = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(owedSum).toBe(receiptTotalMinor - (1_420_000 + 142_000));
  });

  // 16.597% — the shape a real, receipt-derived rate takes (printed tax ÷
  // item subtotal), which almost never lands on a round percentage. ppm =
  // 16.597 * 10,000 = 165,970 exactly (1% = 10,000 ppm), so the rate itself
  // survives without precision loss; this test exercises the rounding of
  // amount * rate, which does not divide evenly.
  //
  // numerator = 333,333 * 165,970 = 55,323,278,010.
  // 55,323,278,010 / 1,000,000 = 55,323.27801 → rounds down (< .5) to 55,323.
  it("handles a rate that does not divide evenly, like 16.597%", () => {
    const { vatByItemId, owedByMemberId } = computeReceiptSplit({
      items: [item("a", 333_333, ["payam"])],
      vatRatePpm: 165_970,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(vatByItemId.get("a")).toBe(55_323);
    expect(owedByMemberId.get("payam")).toBe(333_333 + 55_323);
  });

  // amount * rate = 90,000,000,000 * 165,970 = 14,937,300,000,000,000,
  // which clears 2^53 (9,007,199,254,740,992) by roughly two orders of
  // magnitude — exactly the regime `BigInt` exists to protect. The product
  // happens to divide `scale` (1,000,000) evenly, so this isolates the
  // magnitude concern from the rounding concern (covered by the 16.597%
  // test above): vat = 14,937,300,000,000,000 / 1,000,000 = 14,937,300,000
  // exactly. Item total = 90,000,000,000 + 14,937,300,000 = 104,937,300,000,
  // which splits evenly two ways with no remainder.
  it("stays exact at IRR magnitudes where the product exceeds 2^53", () => {
    const { vatByItemId, owedByMemberId, receiptTotalMinor } = computeReceiptSplit({
      items: [item("a", 90_000_000_000, ["payam", "lyra"])],
      vatRatePpm: 165_970,
      discountMinor: 0,
      memberOrder: ORDER,
    });
    expect(vatByItemId.get("a")).toBe(14_937_300_000);
    expect(receiptTotalMinor).toBe(104_937_300_000);
    expect(owedByMemberId.get("payam")).toBe(52_468_650_000);
    expect(owedByMemberId.get("lyra")).toBe(52_468_650_000);
  });

  it("contributes VAT even when every item is unassigned", () => {
    const { owedByMemberId, unassignedItemIds, vatByItemId, receiptTotalMinor } =
      computeReceiptSplit({
        items: [item("a", 10_000, [])],
        vatRatePpm: 100_000,
        discountMinor: 0,
        memberOrder: ORDER,
      });
    expect(unassignedItemIds).toEqual(["a"]);
    // The old spread model zeroed this out entirely (no item subtotal to be
    // proportional to). The new model does not: VAT is a function of the
    // item's own amount, full stop.
    expect(vatByItemId.get("a")).toBe(1_000);
    expect(owedByMemberId.size).toBe(0);
    expect(receiptTotalMinor).toBe(11_000);
  });
});

describe("computeReceiptSplit — discount (a fixed amount, applied before VAT)", () => {
  // weights 30,000 / 10,000 (weightSum 40,000), discount 4,000 divides both
  // exactly: a gets 4,000 * 30,000/40,000 = 3,000; b gets 1,000. No VAT, so
  // this isolates the discount distribution itself.
  it("distributes a fixed discount across items in proportion to their amounts", () => {
    const { owedByMemberId, discountByItemId } = computeReceiptSplit({
      items: [item("a", 30_000, ["payam"]), item("b", 10_000, ["lyra"])],
      vatRatePpm: 0,
      discountMinor: 4_000,
      memberOrder: ORDER,
    });
    expect(discountByItemId.get("a")).toBe(3_000);
    expect(discountByItemId.get("b")).toBe(1_000);
    expect(owedByMemberId.get("payam")).toBe(27_000);
    expect(owedByMemberId.get("lyra")).toBe(9_000);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(36_000);
  });

  // Three equal-weight items force a three-way tie on the largest-remainder
  // pass (100 / 3 = 33.33 each). Items have no member-order equivalent, so
  // ties break on the item's position in the caller's own array — NOT on
  // which member happens to share it. Proven here by assigning the
  // tie-winning item ("a", declared first) to "arman", who ranks LAST in
  // memberOrder: arman still gets the extra unit, because it rides on the
  // item's position, not his.
  it("breaks discount remainder ties by item declaration order, not memberOrder", () => {
    const { discountByItemId, owedByMemberId } = computeReceiptSplit({
      items: [
        item("a", 100, ["arman"]),
        item("b", 100, ["payam"]),
        item("c", 100, ["lyra"]),
      ],
      vatRatePpm: 0,
      discountMinor: 100,
      memberOrder: ORDER,
    });
    expect(discountByItemId.get("a")).toBe(34);
    expect(discountByItemId.get("b")).toBe(33);
    expect(discountByItemId.get("c")).toBe(33);
    expect(owedByMemberId.get("arman")).toBe(66);
    expect(owedByMemberId.get("payam")).toBe(67);
    expect(owedByMemberId.get("lyra")).toBe(67);
  });

  // A discount exactly equal to the item subtotal must not push anyone
  // negative: every item's net-of-discount amount lands on exactly 0.
  it("clamps a discount equal to the full subtotal without going negative", () => {
    const { owedByMemberId, discountByItemId, receiptTotalMinor } = computeReceiptSplit({
      items: [item("a", 10_000, ["payam"]), item("b", 5_000, ["lyra"])],
      vatRatePpm: 100_000,
      discountMinor: 15_000,
      memberOrder: ORDER,
    });
    expect(discountByItemId.get("a")).toBe(10_000);
    expect(discountByItemId.get("b")).toBe(5_000);
    expect(owedByMemberId.get("payam")).toBe(0);
    expect(owedByMemberId.get("lyra")).toBe(0);
    expect(receiptTotalMinor).toBe(0);
    for (const v of owedByMemberId.values()) expect(v).toBeGreaterThanOrEqual(0);
  });

  // A discount LARGER than the subtotal (a bad input — a typo, or a stale
  // value left over from editing) is clamped rather than trusted, so a
  // single 10,000 item can never go negative no matter how large the
  // discount field says it is.
  it("clamps a discount larger than the subtotal, still never going negative", () => {
    const { owedByMemberId, receiptTotalMinor } = computeReceiptSplit({
      items: [item("a", 10_000, ["payam"])],
      vatRatePpm: 100_000,
      discountMinor: 999_999_999,
      memberOrder: ORDER,
    });
    expect(owedByMemberId.get("payam")).toBe(0);
    expect(receiptTotalMinor).toBe(0);
  });

  // Pins the before-vs-after-VAT decision. Real receipts discount the price
  // before computing tax on what's left, so that's what this module does:
  // net = 100,000 − 20,000 = 80,000; vat = 10% of 80,000 = 8,000; total =
  // 88,000. Discounting AFTER VAT instead would give vat = 10,000 on the
  // full 100,000, then total = 100,000 + 10,000 − 20,000 = 90,000 — a
  // different, larger number. This test fails under that alternative
  // ordering, which is the point: it locks in the decision as behavior,
  // not just documentation.
  it("applies the discount before VAT, not after", () => {
    const { owedByMemberId, vatByItemId, discountByItemId, receiptTotalMinor } =
      computeReceiptSplit({
        items: [item("a", 100_000, ["payam"])],
        vatRatePpm: 100_000,
        discountMinor: 20_000,
        memberOrder: ORDER,
      });
    expect(discountByItemId.get("a")).toBe(20_000);
    expect(vatByItemId.get("a")).toBe(8_000);
    expect(receiptTotalMinor).toBe(88_000);
    expect(owedByMemberId.get("payam")).toBe(88_000);
  });
});

describe("computeReceiptSplit — integer-only output", () => {
  // A screenshot once showed "+709,582.44" — a fractional amount in a
  // currency with no sub-unit. Every numeric value this module returns must
  // be an integer minor unit, always, regardless of how awkward the rate or
  // discount is. This combines a non-round rate, an uneven discount, and an
  // uneven 3-way split specifically to stress every rounding path at once.
  it("never returns a fractional minor unit anywhere in the result", () => {
    const result = computeReceiptSplit({
      items: [
        item("a", 15_500_000, ["payam"]),
        item("b", 26_000_000, ["lyra", "eliana"]),
        item("c", 14_200_000, ["lyra", "eliana", "arman"]),
        item("d", 999_999, []),
      ],
      vatRatePpm: 165_970,
      discountMinor: 3_333_333,
      memberOrder: ORDER,
    });
    for (const v of allValues(result)) {
      expect(Number.isInteger(v)).toBe(true);
    }
  });
});
