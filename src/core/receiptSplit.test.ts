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
    // Item subtotals: payam gets item "a" whole (123,456,789); item "b"
    // divides evenly three ways (987,654,321 / 3 = 329,218,107, no
    // remainder) across lyra/eliana/arman. subtotalSum = 1,111,111,110.
    //
    // VAT (111,111,111) is then distributed in exact proportion to those
    // subtotals via the largest-remainder method. Derived independently
    // with BigInt (not by running this module and pasting its output):
    //   floor(111_111_111n * w / 1_111_111_110n) per member, remainder
    //   = numerator - floor*denominator; the 3 leftover minor units (floor
    //   sum is 111,111,108) go to the largest remainders in order —
    //   payam (999,999,999), then lyra/eliana (tied at 777,777,777, ties
    //   broken by memberOrder) — landing on payam, lyra, eliana.
    //   VAT shares: payam 12,345,679; lyra 32,921,811; eliana 32,921,811;
    //   arman 32,921,810.
    expect(owedByMemberId.get("payam")).toBe(123_456_789 + 12_345_679);
    expect(owedByMemberId.get("lyra")).toBe(329_218_107 + 32_921_811);
    expect(owedByMemberId.get("eliana")).toBe(329_218_107 + 32_921_811);
    expect(owedByMemberId.get("arman")).toBe(329_218_107 + 32_921_810);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(123_456_789 + 987_654_321 + 111_111_111);
  });

  // A stale sharer id (e.g. left behind by a mid-flow group switch: it
  // survives an inclusion filter upstream without surviving into the new
  // group's member list) can end up in an item line's `sharerIds` and thus
  // as a key in the spread pass's weight map, without being present in
  // `memberOrder`. The largest-remainder loop must not degrade to an
  // O(amount) scan in that case — see the precondition comment on
  // `distributeProportionally`.
  it("terminates promptly and still reconciles when a weight key is absent from memberOrder", () => {
    const start = performance.now();
    const { owedByMemberId } = computeReceiptOwed(
      [
        // "ghost" is not in ORDER — a stale id.
        item("a", 10_000, ["payam", "ghost"]),
        spread("vat", 924_000_000),
      ],
      ORDER,
    );
    const elapsed = performance.now() - start;
    // Was ~2.4s before the fix (leftover degrades to an O(amount) loop);
    // comfortably under a second once weightSum is derived from `ordered`.
    expect(elapsed).toBeLessThan(500);
    const total = [...owedByMemberId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(10_000 + 924_000_000);
  });
});

describe("computeReceiptOwed — spreadByLineId (per-item-line surcharge)", () => {
  // Same golden fixture as the per-member VAT test, so the two allocations
  // can be sanity-checked against each other: line "a" is solely payam's,
  // so its weight (15,500,000) happens to equal payam's own item subtotal,
  // yet the *other* two lines split a different way per-line than per-member
  // (a line's own amount vs. a person's summed shares across lines), so this
  // also demonstrates the two passes are genuinely independent computations
  // that happen to reconcile to the same grand total.
  //
  // Expected values derived by hand with BigInt reasoning (weightSum =
  // 55,700,000 = 15,500,000 + 26,000,000 + 14,200,000):
  //   a: floor(9,244,560 * 15,500,000 / 55,700,000) = 2,572,543, remainder 349/557
  //   b: floor(9,244,560 * 26,000,000 / 55,700,000) = 4,315,234, remainder 262/557
  //   c: floor(9,244,560 * 14,200,000 / 55,700,000) = 2,356,781, remainder 503/557
  //   floor sum = 9,244,558, leftover = 2 → largest remainders are c (503),
  //   then a (349) → c and a each get +1.
  it("allocates the spread total across item lines in proportion to each line's own amount", () => {
    const { spreadByLineId } = computeReceiptOwed(
      [
        item("a", 15_500_000, ["payam"]),
        item("b", 26_000_000, ["lyra", "eliana"]),
        item("c", 14_200_000, ["lyra", "eliana", "arman"]),
        spread("vat", 9_244_560),
      ],
      ORDER,
    );
    expect(spreadByLineId.get("a")).toBe(2_572_544);
    expect(spreadByLineId.get("b")).toBe(4_315_234);
    expect(spreadByLineId.get("c")).toBe(2_356_782);
    const total = [...spreadByLineId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(9_244_560);
  });

  // Each spread line reconciles to itself independently (matching how the
  // per-member pass handles multiple spread lines), so the accumulated
  // total across two spread lines equals their combined sum.
  //
  // vat=999 divides evenly: a=333, b=666 (10,000:20,000 is exactly 1:2).
  // svc=1,777 does not: floor(1,777*10,000/30,000)=592 rem 10,000/30,000;
  // floor(1,777*20,000/30,000)=1,184 rem 20,000/30,000; floor sum=1,776,
  // leftover=1 → b's remainder (20,000) beats a's (10,000) → b gets +1.
  // svc: a=592, b=1,185.
  it("reconciles exactly with several spread lines, each accumulated per item line", () => {
    const { spreadByLineId } = computeReceiptOwed(
      [
        item("a", 10_000, ["payam"]),
        item("b", 20_000, ["lyra", "eliana"]),
        spread("vat", 999),
        spread("svc", 1_777),
      ],
      ORDER,
    );
    expect(spreadByLineId.get("a")).toBe(333 + 592);
    expect(spreadByLineId.get("b")).toBe(666 + 1_185);
    const total = [...spreadByLineId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(999 + 1_777);
  });

  // A negative (discount) spread line reduces each item line's carried
  // amount proportionally, via the same largest-remainder machinery.
  //
  // weightSum = 17,000. numerator_a = -100 * 10,000 = -1,000,000;
  // floorDivBigInt(-1,000,000, 17,000) = -59 (floors toward -Infinity),
  // remainder = -1,000,000 - (-59*17,000) = 3,000.
  // numerator_b = -100 * 7,000 = -700,000; floorDivBigInt = -42,
  // remainder = -700,000 - (-42*17,000) = 14,000.
  // floor sum = -101, leftover = -100 - (-101) = 1 (step = +1) →
  // largest remainder is b (14,000 > 3,000) → b gets +1: a=-59, b=-41.
  it("allocates a negative (discount) spread line proportionally, still reconciling exactly", () => {
    const { spreadByLineId } = computeReceiptOwed(
      [item("a", 10_000, ["payam"]), item("b", 7_000, ["lyra"]), spread("disc", -100)],
      ORDER,
    );
    expect(spreadByLineId.get("a")).toBe(-59);
    expect(spreadByLineId.get("b")).toBe(-41);
    const total = [...spreadByLineId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(-100);
  });

  it("is empty in the degenerate case — no item lines at all", () => {
    const { spreadByLineId } = computeReceiptOwed([spread("vat", 9_000)], ORDER);
    expect(spreadByLineId.size).toBe(0);
  });

  it("is empty in the degenerate case even when the spread line has its own sharers", () => {
    const { spreadByLineId } = computeReceiptOwed(
      [{ id: "vat", amountMinor: 9_000, sharerIds: ["payam", "lyra"], kind: "spread" }],
      ORDER,
    );
    expect(spreadByLineId.size).toBe(0);
  });

  // An unassigned item line is already excluded from `itemSubtotal` and
  // `perLineByMember` elsewhere in this module — nobody has claimed it, so
  // it carries no tax of its own either. Only "a" (assigned) participates;
  // "b" (unassigned) gets no entry, and the whole 300 lands on "a".
  it("excludes an unassigned item line from the allocation, same as perLineByMember", () => {
    const { spreadByLineId, unassignedLineIds } = computeReceiptOwed(
      [item("a", 1_000, ["payam"]), item("b", 2_000, []), spread("vat", 300)],
      ORDER,
    );
    expect(unassignedLineIds).toEqual(["b"]);
    expect(spreadByLineId.get("a")).toBe(300);
    expect(spreadByLineId.has("b")).toBe(false);
    const total = [...spreadByLineId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(300);
  });

  // At IRR magnitudes, spreadTotal * itemLine weight clears 2^53
  // (9,007,199,254,740,992): 100,000,000 * 900,000,000 = 9e16. Both
  // products here divide the 1,000,000,000 weightSum evenly, so this pins
  // the BigInt floor being exact at magnitude rather than exercising the
  // remainder path (that's covered by the other tests above).
  it("stays exact at IRR magnitudes where the product exceeds 2^53", () => {
    const { spreadByLineId } = computeReceiptOwed(
      [
        item("a", 900_000_000, ["payam"]),
        item("b", 100_000_000, ["lyra"]),
        spread("vat", 100_000_000),
      ],
      ORDER,
    );
    expect(spreadByLineId.get("a")).toBe(90_000_000);
    expect(spreadByLineId.get("b")).toBe(10_000_000);
    const total = [...spreadByLineId.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(100_000_000);
  });
});
