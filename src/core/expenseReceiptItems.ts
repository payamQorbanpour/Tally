/**
 * The itemization behind a saved expense: the receipt lines an AI scan (or
 * the user) produced, kept alongside the expense so reopening it shows the
 * items rather than one opaque total.
 *
 * Why this exists: an expense saved from a receipt scan used to collapse to
 * a single row — a merchant name, an amount, and per-person splits.
 * Everything the scan actually read (which dishes, what each cost, who
 * shared what) was discarded at save time, so one wrong price or one missing
 * item meant redoing the whole scan instead of editing a line.
 *
 * Stored as JSON in `expenses.receipt_items` rather than in a child table:
 * items are only ever read and written together with their expense, never
 * queried or aggregated across expenses, and the existing `expenses` row
 * already carries the sync plumbing and row-level security that a new table
 * would have to reproduce.
 *
 * Pure and framework-free — no React, no SQLite, no network — so the
 * validation rules stay unit testable and the writer (`tallyRepo`) and the
 * readers (the expense screens) share exactly one definition of a
 * well-formed item.
 */

/** One persisted receipt line. */
export type ExpenseReceiptItem = {
  /** Stable per-item id, so an edit screen can key rows and track changes
   *  across re-renders without reindexing on every insert or delete. */
  id: string;
  label: string;
  /**
   * Integer minor units in the expense's own currency — the same scale as
   * `expenses.amount_minor`, never a float in major units. The currency
   * itself is deliberately not stored per item: it is always the group's,
   * and a second copy here could drift out of agreement with the group.
   */
  amountMinor: number;
  /**
   * Printed quantity, when the receipt showed one above 1 — the `x2` badge.
   * Display only: `amountMinor` is already the line total for every unit, so
   * nothing multiplies by this. Mirrors `ParsedReceiptLine.qty`.
   */
  qty?: number;
  /** Member ids sharing this line. Empty means unassigned — kept rather than
   *  dropped, so a part-assigned receipt survives a save and reopen intact. */
  sharerIds: string[];
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((s) => typeof s === "string");
}

/**
 * Structural check for one stored item. Strict about the fields carrying
 * money or identity and — as everywhere else `qty` appears — permissive
 * about the badge: an out-of-range quantity is scrubbed by
 * {@link parseReceiptItems} rather than invalidating the item, because a
 * cosmetic value must never cost the user their itemization.
 */
function isReceiptItem(v: unknown): v is ExpenseReceiptItem {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    o.id !== "" &&
    typeof o.label === "string" &&
    typeof o.amountMinor === "number" &&
    Number.isInteger(o.amountMinor) &&
    isStringArray(o.sharerIds)
  );
}

/** Keep a quantity only when it's an integer worth rendering — the same rule
 *  as `coerceQty` in `parseReceiptImage.ts`, so "quantity of one" and "no
 *  quantity" stay indistinguishable at every layer. */
function normalizeQty(v: unknown): number | undefined {
  return typeof v === "number" && Number.isInteger(v) && v >= 2 ? v : undefined;
}

/**
 * Encode items for the `receipt_items` column, or `null` when there is
 * nothing to store.
 *
 * An empty list serializes to `null`, not `"[]"`, so "never itemized" and
 * "every item deleted" share one representation. The alternative would make
 * the edit screen distinguish two states that mean the same thing to a user
 * looking at a plain expense.
 */
export function serializeReceiptItems(items: readonly ExpenseReceiptItem[]): string | null {
  if (items.length === 0) return null;
  return JSON.stringify(
    items.map((i) => {
      const qty = normalizeQty(i.qty);
      return {
        id: i.id,
        label: i.label,
        amountMinor: i.amountMinor,
        // Omitted rather than written as null/undefined, so the stored shape
        // is identical for "no quantity" whichever path produced the item.
        ...(qty !== undefined ? { qty } : {}),
        sharerIds: i.sharerIds,
      };
    }),
  );
}

/**
 * Decode the `receipt_items` column. Never throws, never returns a
 * partially-valid item.
 *
 * Every whole-payload failure — NULL, empty string, malformed JSON, a
 * non-array — yields `[]`, which callers render as "this expense has no
 * itemization". That is a truthful and harmless fallback: the expense's own
 * `amount_minor` and its `splits` rows remain the source of truth for the
 * money, so bad item JSON degrades the display without ever putting a
 * balance at risk. Individual malformed items are dropped instead of failing
 * the whole list, so one bad row can't hide the other nine.
 */
export function parseReceiptItems(raw: string | null | undefined): ExpenseReceiptItem[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: ExpenseReceiptItem[] = [];
  for (const row of parsed) {
    if (!isReceiptItem(row)) continue;
    const qty = normalizeQty((row as { qty?: unknown }).qty);
    out.push({
      id: row.id,
      label: row.label,
      amountMinor: row.amountMinor,
      ...(qty !== undefined ? { qty } : {}),
      sharerIds: row.sharerIds,
    });
  }
  return out;
}

/**
 * Sum of every item's amount, in minor units — the figure an edit screen
 * reconciles against the expense's own `amount_minor`.
 *
 * The two can legitimately differ: a receipt-wide VAT or discount is applied
 * on top of the items and is not itself an item, so a gap is information to
 * show the user, not necessarily an error to correct.
 */
export function receiptItemsSubtotalMinor(items: readonly ExpenseReceiptItem[]): number {
  let sum = 0;
  for (const i of items) sum += i.amountMinor;
  return sum;
}
