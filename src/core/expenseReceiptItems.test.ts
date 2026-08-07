import { describe, expect, it } from "vitest";
import {
  parseReceiptItems,
  receiptItemsSubtotalMinor,
  serializeReceiptItems,
  type ExpenseReceiptItem,
} from "./expenseReceiptItems";

const item = (over: Partial<ExpenseReceiptItem> = {}): ExpenseReceiptItem => ({
  id: "i1",
  label: "چلوکباب",
  amountMinor: 120_000,
  sharerIds: ["u1"],
  ...over,
});

describe("serializeReceiptItems / parseReceiptItems", () => {
  it("round-trips a full item list", () => {
    const items = [item(), item({ id: "i2", label: "نوشابه", amountMinor: 15_000, qty: 2 })];
    expect(parseReceiptItems(serializeReceiptItems(items))).toEqual(items);
  });

  it("stores nothing for an empty list", () => {
    // NULL, not "[]", so "never itemized" and "all items deleted" are one
    // state rather than two the edit screen would have to tell apart.
    expect(serializeReceiptItems([])).toBeNull();
  });

  it("omits an unrenderable quantity instead of storing it", () => {
    const raw = serializeReceiptItems([item({ qty: 1 }), item({ id: "i2", qty: 1.5 })])!;
    expect(raw).not.toContain("qty");
    expect(parseReceiptItems(raw).every((i) => i.qty === undefined)).toBe(true);
  });

  it("keeps a quantity of 2 or more", () => {
    expect(parseReceiptItems(serializeReceiptItems([item({ qty: 4 })]))[0]?.qty).toBe(4);
  });

  it("preserves an unassigned item rather than dropping it", () => {
    // A part-assigned receipt has to survive a save and reopen intact.
    const parsed = parseReceiptItems(serializeReceiptItems([item({ sharerIds: [] })]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.sharerIds).toEqual([]);
  });

  it("preserves a negative amount (a discount line)", () => {
    const parsed = parseReceiptItems(serializeReceiptItems([item({ amountMinor: -5_000 })]));
    expect(parsed[0]?.amountMinor).toBe(-5_000);
  });
});

describe("parseReceiptItems, on bad data", () => {
  // Every case here must degrade to "no itemization" and never throw: the
  // expense's own amount_minor and its splits rows remain the source of
  // truth for the money, so bad item JSON may cost the display and no more.
  it("returns an empty list for null, empty, or malformed input", () => {
    expect(parseReceiptItems(null)).toEqual([]);
    expect(parseReceiptItems(undefined)).toEqual([]);
    expect(parseReceiptItems("")).toEqual([]);
    expect(parseReceiptItems("   ")).toEqual([]);
    expect(parseReceiptItems("{not json")).toEqual([]);
    expect(parseReceiptItems('{"a":1}')).toEqual([]);
    expect(parseReceiptItems("null")).toEqual([]);
  });

  it("drops only the malformed items, keeping the valid ones", () => {
    // One bad row must not hide the other nine.
    const raw = JSON.stringify([
      item(),
      { id: "i2", label: "no amount", sharerIds: [] },
      { id: "", label: "blank id", amountMinor: 1, sharerIds: [] },
      { id: "i4", label: "float amount", amountMinor: 1.5, sharerIds: [] },
      { id: "i5", label: "bad sharers", amountMinor: 1, sharerIds: [1, 2] },
      item({ id: "i6", label: "good" }),
    ]);
    expect(parseReceiptItems(raw).map((i) => i.id)).toEqual(["i1", "i6"]);
  });

  it("scrubs an out-of-range quantity without discarding the item", () => {
    const raw = JSON.stringify([{ ...item(), qty: "many" }]);
    const parsed = parseReceiptItems(raw);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.qty).toBeUndefined();
    expect(parsed[0]?.amountMinor).toBe(120_000);
  });
});

describe("receiptItemsSubtotalMinor", () => {
  it("sums the item amounts", () => {
    expect(receiptItemsSubtotalMinor([item(), item({ amountMinor: 15_000 })])).toBe(135_000);
  });

  it("is 0 for no items", () => {
    expect(receiptItemsSubtotalMinor([])).toBe(0);
  });

  it("nets out a discount line", () => {
    expect(receiptItemsSubtotalMinor([item(), item({ amountMinor: -20_000 })])).toBe(100_000);
  });
});
