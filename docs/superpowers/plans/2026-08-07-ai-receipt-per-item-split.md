# AI Receipt Per-Item Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a receipt line be shared by several people, and distribute surcharge lines (VAT, service charge, discounts) across the item lines in proportion to what each person actually had.

**Architecture:** The arithmetic moves out of the screen into a new pure module, `src/core/receiptSplit.ts`, which is unit-tested on its own. `EditableLine.assigneeId: string | null` becomes `sharerIds: string[]` plus `kind: "item" | "spread"`. The AI labels each line's kind; a manual toggle on every row overrides it. Save collapses from one expense per line to a single expense with an exact per-person owed map.

**Tech Stack:** TypeScript, React Native (Expo 54), Vitest, Supabase edge functions (Deno).

**Spec:** `docs/superpowers/specs/2026-08-07-ai-receipt-per-item-split-design.md`

## Global Constraints

- **Money is integer minor units everywhere.** Never use floats for split arithmetic. `majorFloatToMinor(amountMajor, currency)` converts at the boundary.
- **Every split must reconcile exactly.** The owed map sums to the enabled-line total, to the minor unit, in every mode and every test.
- **Rounding is deterministic.** Leftover minor units go to the earliest members in `memberOrder` — the group's member order, never `Map` insertion order or the order sharers were added to a line.
- **A missing or unrecognized `kind` maps to `"item"`.** Old payloads and models that ignore the field degrade to today's behavior.
- **No keyword matching on labels.** Explicitly rejected in the spec — "سرویس چالی" is a shared tea service that a `service`/`سرویس` rule would silently convert into a surcharge.
- **Translations are type-checked.** `src/i18n/translations.ts` has a `Translations` type plus three locale objects — `en` (~line 1587), `fa` (~line 2638), `es` (~line 3694). A new key must be added to the type and all three objects or the build fails. Spanish is only *soft*-disabled, so its strings still need real translations.
- Run tests with `npm test` (Vitest). Lint with `npm run lint`.

---

### Task 1: Carry `kind` through the parse layer

**Files:**
- Modify: `src/core/receiptParseTypes.ts:1-5`
- Modify: `src/core/parseReceiptImage.ts:44-58`
- Test: `src/core/parseReceiptJson.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ParsedReceiptLine.kind?: "item" | "surcharge" | "discount"` — read by Task 6.

- [ ] **Step 1: Write the failing tests**

Append inside the existing `describe("parseReceiptJsonContent", ...)` block in `src/core/parseReceiptJson.test.ts`:

```ts
it("carries a surcharge kind through", () => {
  const out = parseReceiptJsonContent(
    JSON.stringify({
      merchant: null, currency: null,
      lines: [
        { label: "جوجه کبک", amount: 26000000, kind: "item" },
        { label: "مالیات بر ارزش افزوده", amount: 9244560, kind: "surcharge" },
      ],
      subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
    }),
  );
  expect(out.lines[0]?.kind).toBe("item");
  expect(out.lines[1]?.kind).toBe("surcharge");
});

it("leaves kind undefined when absent or unrecognized", () => {
  const out = parseReceiptJsonContent(
    JSON.stringify({
      merchant: null, currency: null,
      lines: [
        { label: "Latte", amount: 4.5 },
        { label: "Mystery", amount: 1, kind: "gratuity" },
      ],
      subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
    }),
  );
  expect(out.lines[0]?.kind).toBeUndefined();
  expect(out.lines[1]?.kind).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/parseReceiptJson.test.ts`
Expected: FAIL — `out.lines[1].kind` is `undefined`, not `"surcharge"`.

- [ ] **Step 3: Add the field to the type**

In `src/core/receiptParseTypes.ts`, replace the `ParsedReceiptLine` type:

```ts
export type ParsedReceiptLine = {
  label: string;
  /** Major currency units (e.g. USD dollars); may be negative for discounts. */
  amount: number;
  /**
   * What the model thinks this row is. Absent when the model didn't say or
   * gave a value we don't recognize — callers treat that as "item".
   */
  kind?: "item" | "surcharge" | "discount";
};
```

- [ ] **Step 4: Coerce it in `normalizeLines`**

In `src/core/parseReceiptImage.ts`, add above `normalizeLines`:

```ts
function coerceLineKind(v: unknown): ParsedReceiptLine["kind"] {
  return v === "item" || v === "surcharge" || v === "discount" ? v : undefined;
}
```

Then change the push at line 55 from `out.push({ label, amount });` to:

```ts
    out.push({ label, amount, kind: coerceLineKind(o.kind) });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/core/parseReceiptJson.test.ts`
Expected: PASS, including the three pre-existing tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/receiptParseTypes.ts src/core/parseReceiptImage.ts src/core/parseReceiptJson.test.ts
git commit -m "feat(receipt): carry line kind through the parse layer"
```

---

### Task 2: `computeReceiptOwed` — item lines

**Files:**
- Create: `src/core/receiptSplit.ts`
- Test: `src/core/receiptSplit.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `computeReceiptOwed(lines: SplitLine[], memberOrder: string[]): ReceiptSplitResult`, and the exported types `SplitLine`, `SplitLineKind`, `ReceiptSplitResult`. Used by Tasks 3, 6 and 9.

- [ ] **Step 1: Write the failing tests**

Create `src/core/receiptSplit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/receiptSplit.test.ts`
Expected: FAIL — cannot resolve `./receiptSplit`.

- [ ] **Step 3: Write the implementation**

Create `src/core/receiptSplit.ts`:

```ts
export type SplitLineKind = "item" | "spread";

export type SplitLine = {
  id: string;
  /** Integer minor units. Negative for discounts. */
  amountMinor: number;
  /** Members sharing this line. Empty = unassigned. */
  sharerIds: string[];
  kind: SplitLineKind;
};

export type ReceiptSplitResult = {
  /** Member id → total owed, in minor units. Sums to the input total exactly. */
  owedByMemberId: Map<string, number>;
  /** Line id → (member id → their slice of that line). Drives the row tray. */
  perLineByMember: Map<string, Map<string, number>>;
  /** Lines that require sharers but have none. Spread lines only appear here
   *  in the degenerate case where there are no item lines at all. */
  unassignedLineIds: string[];
};

/** Sort a line's sharers by their position in the group's member order, so
 *  the odd minor unit lands on a stable person instead of drifting with the
 *  order the user happened to tap people in. */
function orderSharers(sharerIds: string[], memberOrder: string[]): string[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i] as const));
  return [...sharerIds].sort(
    (a, b) =>
      (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Split `total` as evenly as possible across `ids`, leftover minor units to
 *  the earliest ids. Negative totals (discounts) split symmetrically. */
function splitEvenly(total: number, ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / ids.length);
  let remainder = abs - base * ids.length;
  for (const id of ids) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    out.set(id, sign * (base + extra));
  }
  return out;
}

export function computeReceiptOwed(
  lines: SplitLine[],
  memberOrder: string[],
): ReceiptSplitResult {
  const owedByMemberId = new Map<string, number>();
  const perLineByMember = new Map<string, Map<string, number>>();
  const unassignedLineIds: string[] = [];

  const itemSubtotal = new Map<string, number>();
  for (const ln of lines) {
    if (ln.kind !== "item") continue;
    if (ln.sharerIds.length === 0) {
      unassignedLineIds.push(ln.id);
      continue;
    }
    const shares = splitEvenly(ln.amountMinor, orderSharers(ln.sharerIds, memberOrder));
    perLineByMember.set(ln.id, shares);
    for (const [id, v] of shares) {
      itemSubtotal.set(id, (itemSubtotal.get(id) ?? 0) + v);
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
  }

  return { owedByMemberId, perLineByMember, unassignedLineIds };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- src/core/receiptSplit.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/core/receiptSplit.ts src/core/receiptSplit.test.ts
git commit -m "feat(receipt): add computeReceiptOwed for shared item lines"
```

---

### Task 3: `computeReceiptOwed` — spread lines

**Files:**
- Modify: `src/core/receiptSplit.ts`
- Test: `src/core/receiptSplit.test.ts`

**Interfaces:**
- Consumes: `computeReceiptOwed`, `SplitLine` from Task 2
- Produces: the same signature, now handling `kind: "spread"`.

- [ ] **Step 1: Write the failing tests**

Append to `src/core/receiptSplit.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/core/receiptSplit.test.ts`
Expected: FAIL — spread lines are ignored, so `owedByMemberId.get("payam")` is `15_500_000`, not `18_072_544`.

- [ ] **Step 3: Add the proportional distributor**

In `src/core/receiptSplit.ts`, add below `splitEvenly`:

```ts
/** Distribute `total` across members in proportion to `weights`, then hand
 *  out the leftover minor units one at a time in member order. Works for
 *  negative totals: `Math.floor` overshoots, so the leftover comes back with
 *  the opposite sign and `step` walks it the other way. */
function distributeProportionally(
  total: number,
  weights: Map<string, number>,
  weightSum: number,
  memberOrder: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (weightSum === 0) return out;
  const ordered = memberOrder.filter((id) => weights.has(id));
  let consumed = 0;
  for (const id of ordered) {
    const v = Math.floor((total * (weights.get(id) ?? 0)) / weightSum);
    out.set(id, v);
    consumed += v;
  }
  let leftover = total - consumed;
  const step = leftover < 0 ? -1 : 1;
  for (let i = 0; leftover !== 0 && ordered.length > 0; i += 1) {
    const id = ordered[i % ordered.length]!;
    out.set(id, (out.get(id) ?? 0) + step);
    leftover -= step;
  }
  return out;
}
```

- [ ] **Step 4: Wire spread lines into `computeReceiptOwed`**

Replace the body of `computeReceiptOwed` with:

```ts
export function computeReceiptOwed(
  lines: SplitLine[],
  memberOrder: string[],
): ReceiptSplitResult {
  const owedByMemberId = new Map<string, number>();
  const perLineByMember = new Map<string, Map<string, number>>();
  const unassignedLineIds: string[] = [];

  const hasItemLines = lines.some((l) => l.kind === "item");
  // Degenerate receipt — nothing but surcharges. There is no item subtotal to
  // be proportional to, so surcharges behave as ordinary shared items.
  const isItemLike = (l: SplitLine) => (hasItemLines ? l.kind === "item" : true);

  const itemSubtotal = new Map<string, number>();
  for (const ln of lines) {
    if (!isItemLike(ln)) continue;
    if (ln.sharerIds.length === 0) {
      unassignedLineIds.push(ln.id);
      continue;
    }
    const shares = splitEvenly(ln.amountMinor, orderSharers(ln.sharerIds, memberOrder));
    perLineByMember.set(ln.id, shares);
    for (const [id, v] of shares) {
      itemSubtotal.set(id, (itemSubtotal.get(id) ?? 0) + v);
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
  }

  const subtotalSum = [...itemSubtotal.values()].reduce((a, b) => a + b, 0);
  for (const ln of lines) {
    if (isItemLike(ln)) continue;
    const slices = distributeProportionally(
      ln.amountMinor,
      itemSubtotal,
      subtotalSum,
      memberOrder,
    );
    perLineByMember.set(ln.id, slices);
    for (const [id, v] of slices) {
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
  }

  return { owedByMemberId, perLineByMember, unassignedLineIds };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- src/core/receiptSplit.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 6: Commit**

```bash
git add src/core/receiptSplit.ts src/core/receiptSplit.test.ts
git commit -m "feat(receipt): distribute surcharge lines proportionally over items"
```

---

### Task 4: Ask the model for each line's kind

**Files:**
- Modify: `supabase/functions/ai-proxy/index.ts:615-632`

**Interfaces:**
- Consumes: nothing
- Produces: `lines[].kind` in the parse-receipt response, consumed by Task 1's coercion.

There is no test harness for the edge function in this repo, and the change is a prompt edit — verification is by inspection plus the Task 1 unit tests, which already prove the client handles both presence and absence of the field.

- [ ] **Step 1: Add `kind` to the schema hint**

In `RECEIPT_JSON_SCHEMA_HINT`, change the `lines` entry at line 619 from:

```
  "lines": [ { "label": string, "amount": number } ],
```

to:

```
  "lines": [ { "label": string, "amount": number, "kind": "item" | "surcharge" | "discount" } ],
```

- [ ] **Step 2: Add the rule explaining it**

Insert a new bullet immediately after the existing line-631 bullet (the one about tax/service-charge wording):

```
- Set "kind" on every line. Use "item" for anything the customer ordered — food, drinks, a shared platter, a tea or water service. Use "surcharge" ONLY for a charge computed on top of the order as a whole (VAT, tax, service percentage, tip, cover charge). Use "discount" for a negative adjustment. When in doubt use "item": a named dish or service that people share is an item, even if its name contains a word like "service" or "سرویس".
```

- [ ] **Step 3: Verify the client tolerates both shapes**

Run: `npm test -- src/core/parseReceiptJson.test.ts`
Expected: PASS — the "leaves kind undefined when absent or unrecognized" test proves a model ignoring the new field still works.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ai-proxy/index.ts
git commit -m "feat(ai-proxy): ask the model to label each receipt line's kind"
```

---

### Task 5: Translation strings

**Files:**
- Modify: `src/i18n/translations.ts` — the `Translations` type's `aiReceipt` block, then the `en` (~1627-1651), `fa` (~2678) and `es` (~3734) objects

**Interfaces:**
- Consumes: nothing
- Produces: the keys `modePerItem`, `shareLikeItem`, `spreadOverItems`, `spreadHint`, `itemsNeedPeople`, `sharedByCount`, `toggleSharerA11y`, `expandLineA11y` — used by Tasks 7 and 8.

- [ ] **Step 1: Add the keys to the `Translations` type**

Find the `aiReceipt` block in the type declaration (near line 423) and add:

```ts
    modePerItem: string;
    shareLikeItem: string;
    spreadOverItems: string;
    spreadHint: string;
    itemsNeedPeople: string;
    sharedByCount: string;
    toggleSharerA11y: string;
    expandLineA11y: string;
```

- [ ] **Step 2: Add the English strings**

In the `en` object's `aiReceipt` block, alongside `modeExact` (line 1648):

```ts
    modePerItem: "Per item",
    shareLikeItem: "Share like an item",
    spreadOverItems: "Spread over items",
    spreadHint: "{{percent}} added to everyone's share",
    itemsNeedPeople: "{{count}} items still need people",
    sharedByCount: "÷{{count}}",
    toggleSharerA11y: "Add or remove {{name}} from this item",
    expandLineA11y: "Choose who shares {{label}}",
```

Also change `linesHeading` (line 1627) from `"Drag and drop items"` to `"Split per item"`, and `dragHint` (line 1644) to `"Tip: tap an item to choose who shared it, or drag it onto a person."`

- [ ] **Step 3: Add the Farsi strings**

In the `fa` object's `aiReceipt` block:

```ts
    modePerItem: "هر آیتم",
    shareLikeItem: "تقسیم مثل آیتم",
    spreadOverItems: "پخش روی آیتم‌ها",
    spreadHint: "{{percent}} به سهم هر نفر اضافه می‌شود",
    itemsNeedPeople: "{{count}} آیتم هنوز نیاز به انتخاب افراد دارد",
    sharedByCount: "÷{{count}}",
    toggleSharerA11y: "افزودن یا حذف {{name}} از این آیتم",
    expandLineA11y: "انتخاب افرادی که «{{label}}» را شریک بودند",
```

Change the `fa` `linesHeading` (line 2678) to `"تقسیم بر اساس آیتم"` and `dragHint` to `"نکته: روی هر آیتم بزنید تا افراد را انتخاب کنید، یا آن را روی یک نفر بکشید."`

- [ ] **Step 4: Add the Spanish strings**

In the `es` object's `aiReceipt` block:

```ts
    modePerItem: "Por ítem",
    shareLikeItem: "Dividir como ítem",
    spreadOverItems: "Repartir entre ítems",
    spreadHint: "{{percent}} añadido a la parte de cada persona",
    itemsNeedPeople: "{{count}} ítems todavía necesitan personas",
    sharedByCount: "÷{{count}}",
    toggleSharerA11y: "Añadir o quitar a {{name}} de este ítem",
    expandLineA11y: "Elegir quién compartió {{label}}",
```

Change the `es` `linesHeading` (line 3734) to `"Dividir por ítem"` and `dragHint` to `"Consejo: toca un ítem para elegir quién lo compartió, o arrástralo sobre una persona."`

- [ ] **Step 5: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors from `translations.ts`. A missing key in any locale is a type error naming that locale.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "i18n: add per-item split strings for en, fa and es"
```

---

### Task 6: Migrate `EditableLine` to `sharerIds` + `kind`

**Files:**
- Modify: `src/screens/AiReceiptScreen.tsx` — type at `98-107`, `payloadToEditableLines` at `1145-1170`, `toggleLineDisabled` at `1953-1969`, `owedByMemberId` at `2012-2107`, `togglePersonIncluded` at `2217-2237`, `finalizeDragAt` at `2322-2340`, the row filter at `2614-2622`, the assigned-pills block at `2987-3029`, and the Save `disabled` prop at `3062-3070`

**Interfaces:**
- Consumes: `computeReceiptOwed`, `SplitLine` (Task 3); `ParsedReceiptLine.kind` (Task 1)
- Produces: `EditableLine` with `sharerIds: string[]` and `kind: "item" | "spread"`; the `perItemResult` memo; `unassignedCount`. Used by Tasks 7-9.

This task is a compile-driven migration: delete `assigneeId`, then fix every error TypeScript reports. It ends with the app building and per-item mode working through drag alone — the tray arrives in Task 7.

- [ ] **Step 1: Change the type**

Replace lines 98-107 with:

```ts
type EditableLine = {
  id: string;
  label: string;
  amountMajor: number;
  /** Members sharing this line. Empty = unassigned; blocks Save for item lines. */
  sharerIds: string[];
  /** "spread" lines are distributed proportionally over the item lines. */
  kind: "item" | "spread";
  /** When true the user has switched the line off — kept for re-enable, but
   *  excluded from totals, splits, and the save. */
  disabled?: boolean;
};
```

- [ ] **Step 2: Map the parsed kind**

In `payloadToEditableLines`, replace the push at line 1152 so lines carry the new fields. The parsed three-value kind collapses to two states here:

```ts
      out.push({
        id: newId(),
        label: l.label,
        amountMajor: l.amount,
        sharerIds: [],
        kind: l.kind === "surcharge" || l.kind === "discount" ? "spread" : "item",
      });
```

and the total fallback at line 1162:

```ts
    out.push({
      id: newId(),
      label: fallbackTotalLabel,
      amountMajor: parsed.total,
      sharerIds: [],
      kind: "item",
    });
```

- [ ] **Step 3: Fix `toggleLineDisabled`**

Replace the `assigneeId` line (1964) so disabling clears sharers instead:

```ts
              sharerIds: !l.disabled ? [] : l.sharerIds,
```

- [ ] **Step 4: Replace the "exact" branch of `owedByMemberId`**

Add the import at the top of the file:

```ts
import { computeReceiptOwed, type SplitLine } from "../core/receiptSplit";
```

Add a memo above `owedByMemberId`:

```ts
  /** Per-item split result — shared by the owed map, the row trays, the plate
   *  totals and the Save gate, so they can never disagree. */
  const perItemResult = useMemo(() => {
    const splitLines: SplitLine[] = lines
      .filter((l) => !l.disabled)
      .map((l) => ({
        id: l.id,
        amountMinor: majorFloatToMinor(l.amountMajor, groupCurrency),
        sharerIds: l.sharerIds.filter((id) => includedMemberIds.has(id)),
        kind: l.kind,
      }));
    return computeReceiptOwed(splitLines, members.map((m) => m.id));
  }, [lines, groupCurrency, includedMemberIds, members]);

  const unassignedCount = perItemResult.unassignedLineIds.length;
```

Then replace the whole `if (scanSplitMode === "exact") { ... }` block at lines 2014-2022 with:

```ts
    if (scanSplitMode === "exact") return perItemResult.owedByMemberId;
```

Add `perItemResult` to that memo's dependency array.

- [ ] **Step 5: Fix `togglePersonIncluded`**

Replace the unassign block at lines 2225-2229 so excluding a person drops them from every line:

```ts
          setLines((ls) =>
            ls.map((l) =>
              l.sharerIds.includes(memberId)
                ? { ...l, sharerIds: l.sharerIds.filter((id) => id !== memberId) }
                : l,
            ),
          );
```

- [ ] **Step 6: Make the drop additive**

Replace the `setLines` call inside `finalizeDragAt` (lines 2331-2335) so a drop toggles membership in both directions:

```ts
        setLines((prev) =>
          prev.map((l) => {
            if (l.id !== d.lineId) return l;
            const has = l.sharerIds.includes(target);
            return {
              ...l,
              sharerIds: has
                ? l.sharerIds.filter((id) => id !== target)
                : [...l.sharerIds, target],
            };
          }),
        );
```

- [ ] **Step 7: Stop hiding assigned rows**

Rows now stay in the list and show their sharers, so replace the filter at lines 2619-2622 with:

```ts
              const rendered = lines;
```

Delete the assigned-items pill block at lines 2987-3029 (the `scanSplitMode === "exact" ? (() => {...})() : null` expression inside the person tile) — the avatar stacks and trays replace it.

- [ ] **Step 8: Fix the Save gate**

Replace the `disabled` expression at lines 3062-3070:

```ts
                  disabled={
                    aggregateMinor <= 0 ||
                    !members.length ||
                    (scanSplitMode === "exact"
                      ? unassignedCount > 0
                      : owedByMemberId.size === 0)
                  }
```

- [ ] **Step 9: Verify it compiles and existing tests pass**

Run: `npx tsc --noEmit && npm test`
Expected: no errors; all existing tests pass. Any remaining `assigneeId` reference is a compile error naming its line.

- [ ] **Step 10: Commit**

```bash
git add src/screens/AiReceiptScreen.tsx
git commit -m "refactor(receipt): replace assigneeId with sharerIds and line kind"
```

---

### Task 7: The expandable row and its tray

**Files:**
- Create: `src/screens/aiReceipt/ReceiptLineRow.tsx`
- Modify: `src/screens/AiReceiptScreen.tsx` — `buildStyles`, the state block near `1238`, and the row render at `2614-2760`

**Interfaces:**
- Consumes: `perItemResult`, `EditableLine` (Task 6); the i18n keys from Task 5
- Produces: the `ReceiptLineRow` component and its `ReceiptLineRowProps` type.

- [ ] **Step 1: Create the component**

Create `src/screens/aiReceipt/ReceiptLineRow.tsx`. It owns the collapsed row's avatar stack, the segmented kind control, and the member-toggle tray. Everything arrives as props — no context, no data fetching — so it stays reviewable on its own:

```tsx
import { Pressable, View } from "react-native";
import { PersonAvatar } from "../../components/PersonAvatar";
import { Text } from "../../ui/AppText";

export type ReceiptLineRowMember = { id: string; name: string; avatarUri?: string | null };

export type ReceiptLineRowProps = {
  label: string;
  kind: "item" | "spread";
  sharerIds: string[];
  /** Member id → this member's slice of this line, in minor units. */
  slices: Map<string, number>;
  members: ReceiptLineRowMember[];
  expanded: boolean;
  disabled: boolean;
  /** Formatted by the parent, which owns the currency and locale. */
  formatAmount: (minor: number) => string;
  /** Non-null only for spread rows: the share of the item subtotal, e.g. "16.6%". */
  spreadPercentLabel: string | null;
  onToggleExpanded: () => void;
  onToggleSharer: (memberId: string) => void;
  onChangeKind: (kind: "item" | "spread") => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  styles: Record<string, object>;
};

const AVATAR_STACK_MAX = 3;

export function ReceiptLineRow(props: ReceiptLineRowProps) {
  const { kind, sharerIds, members, expanded, slices, t, styles } = props;

  const stack = sharerIds.slice(0, AVATAR_STACK_MAX);
  const overflow = sharerIds.length - stack.length;

  return (
    <View>
      <Pressable
        onPress={props.onToggleExpanded}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel={t("aiReceipt.expandLineA11y", { label: props.label })}
        style={styles.lineSharerSummary}
      >
        {kind === "spread" ? (
          <Text style={styles.lineSpreadChip}>{t("aiReceipt.spreadOverItems")}</Text>
        ) : sharerIds.length > 1 ? (
          <Text style={styles.lineShareCount}>
            {t("aiReceipt.sharedByCount", { count: sharerIds.length })}
          </Text>
        ) : null}
        {kind === "item"
          ? stack.map((id) => {
              const m = members.find((x) => x.id === id);
              return m ? (
                <PersonAvatar key={id} name={m.name} uri={m.avatarUri ?? null} size={20} />
              ) : null;
            })
          : null}
        {overflow > 0 ? <Text style={styles.lineShareCount}>{`+${overflow}`}</Text> : null}
      </Pressable>

      {expanded && !props.disabled ? (
        <View style={styles.lineTray}>
          <View style={styles.lineKindSeg}>
            <Pressable
              onPress={() => props.onChangeKind("item")}
              style={[styles.lineKindSegBtn, kind === "item" && styles.lineKindSegBtnSel]}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === "item" }}
            >
              <Text style={styles.lineKindSegText}>{t("aiReceipt.shareLikeItem")}</Text>
            </Pressable>
            <Pressable
              onPress={() => props.onChangeKind("spread")}
              style={[styles.lineKindSegBtn, kind === "spread" && styles.lineKindSegBtnSel]}
              accessibilityRole="button"
              accessibilityState={{ selected: kind === "spread" }}
            >
              <Text style={styles.lineKindSegText}>{t("aiReceipt.spreadOverItems")}</Text>
            </Pressable>
          </View>

          {kind === "spread" && props.spreadPercentLabel ? (
            <Text style={styles.lineTrayHint}>
              {t("aiReceipt.spreadHint", { percent: props.spreadPercentLabel })}
            </Text>
          ) : null}

          <View style={styles.lineTrayPicks}>
            {members.map((m) => {
              const on = kind === "spread" ? slices.has(m.id) : sharerIds.includes(m.id);
              const slice = slices.get(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => {
                    if (kind === "item") props.onToggleSharer(m.id);
                  }}
                  disabled={kind === "spread"}
                  accessibilityRole={kind === "item" ? "checkbox" : "text"}
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={t("aiReceipt.toggleSharerA11y", { name: m.name })}
                  style={[styles.lineTrayPick, !on && styles.lineTrayPickOff]}
                >
                  <PersonAvatar name={m.name} uri={m.avatarUri ?? null} size={28} />
                  <Text style={styles.lineTrayPickName} numberOfLines={1}>{m.name}</Text>
                  <Text style={styles.lineTrayPickSlice}>
                    {on && slice != null ? props.formatAmount(slice) : "—"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}
    </View>
  );
}
```

- [ ] **Step 2: Add the styles**

In `buildStyles` in `AiReceiptScreen.tsx`, add the keys the component references — `lineSharerSummary`, `lineSpreadChip`, `lineShareCount`, `lineTray`, `lineKindSeg`, `lineKindSegBtn`, `lineKindSegBtnSel`, `lineKindSegText`, `lineTrayHint`, `lineTrayPicks`, `lineTrayPick`, `lineTrayPickOff`, `lineTrayPickName`, `lineTrayPickSlice`. Follow that function's existing conventions: `textAlign` comes from the `te` helper for RTL, colors come from the `colors` parameter, and card-like surfaces use the `cardShadow` argument. `lineTrayPicks` is a `flexDirection: "row"` with `flexWrap: "wrap"`; `lineTrayPickOff` dims via `opacity: 0.45`.

- [ ] **Step 3: Add expansion state and the mutation handlers**

In `AiReceiptScreen`, alongside the other `useState` calls near line 1238:

```ts
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null);
```

And beside `toggleLineDisabled`:

```ts
  const setLineKind = useCallback((id: string, kind: "item" | "spread") => {
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, kind } : l)));
  }, []);

  const toggleLineSharer = useCallback((id: string, memberId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const has = l.sharerIds.includes(memberId);
        return {
          ...l,
          sharerIds: has
            ? l.sharerIds.filter((x) => x !== memberId)
            : [...l.sharerIds, memberId],
        };
      }),
    );
  }, []);
```

- [ ] **Step 4: Add the percentage memo**

Above the component's `return`:

```ts
  /** "16.6%" — the spread total as a share of the item subtotal, for the tray hint. */
  const spreadPercentLabel = useMemo(() => {
    let items = 0;
    let spread = 0;
    for (const l of lines) {
      if (l.disabled) continue;
      const minor = majorFloatToMinor(l.amountMajor, groupCurrency);
      if (l.kind === "spread") spread += minor;
      else items += minor;
    }
    if (items <= 0 || spread === 0) return null;
    return `${((spread / items) * 100).toFixed(1)}%`;
  }, [lines, groupCurrency]);
```

- [ ] **Step 5: Render it under each row**

Import it at the top:

```ts
import { ReceiptLineRow } from "./aiReceipt/ReceiptLineRow";
```

Inside the `rendered.map(...)` callback, after the existing row element and before the closing wrapper, render the component only in per-item mode:

```tsx
                {scanSplitMode === "exact" ? (
                  <ReceiptLineRow
                    label={ln.label}
                    kind={ln.kind}
                    sharerIds={ln.sharerIds}
                    slices={perItemResult.perLineByMember.get(ln.id) ?? new Map()}
                    members={members}
                    expanded={expandedLineId === ln.id}
                    disabled={isDisabled}
                    formatAmount={(m) => formatMinor(m, groupCurrency, locale)}
                    spreadPercentLabel={spreadPercentLabel}
                    onToggleExpanded={() =>
                      setExpandedLineId((cur) => (cur === ln.id ? null : ln.id))
                    }
                    onToggleSharer={(mid) => toggleLineSharer(ln.id, mid)}
                    onChangeKind={(k) => setLineKind(ln.id, k)}
                    t={t}
                    styles={styles}
                  />
                ) : null}
```

- [ ] **Step 6: Verify it compiles, tests and lints clean**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/screens/aiReceipt/ReceiptLineRow.tsx src/screens/AiReceiptScreen.tsx
git commit -m "feat(receipt): add expandable per-item sharer tray"
```

---

### Task 8: Mode label, plate totals, and the unassigned counter

**Files:**
- Modify: `src/screens/AiReceiptScreen.tsx` — the mode chip labels, the plate total render, and the warning area at `3037-3046`

**Interfaces:**
- Consumes: `perItemResult`, `unassignedCount` (Task 6); `itemsNeedPeople`, `modePerItem` (Task 5)
- Produces: nothing consumed downstream.

- [ ] **Step 1: Relabel the Exact chip**

Find where the mode chips render the `t("aiReceipt.modeExact")` label and change the `exact` case to `t("aiReceipt.modePerItem")`. Leave the mode's internal id as `"exact"` so no other logic shifts.

- [ ] **Step 2: Confirm per-item is the default**

`scanSplitMode` already initializes to `"exact"` at line 1238, which is now labelled "Per item". Confirm no effect resets it after a parse, and leave it as is.

- [ ] **Step 3: Show the unassigned count**

Replace the `mismatch` warning block at lines 3042-3046 so the blocking condition is surfaced first:

```tsx
            {scanSplitMode === "exact" && unassignedCount > 0 ? (
              <Text style={styles.warn}>
                {t("aiReceipt.itemsNeedPeople", { count: unassignedCount })}
              </Text>
            ) : mismatch ? (
              <Text style={styles.warn}>
                {t("aiReceipt.sumMismatch", { diff: mismatch })}
              </Text>
            ) : null}
```

- [ ] **Step 4: Verify plate totals include the spread slice**

The plate total renders from `owedByMemberId`, which in per-item mode is now `perItemResult.owedByMemberId` — spread slices included. Confirm by inspection that no plate reads `lines` directly to compute its total.

- [ ] **Step 5: Verify it compiles, tests and lints clean**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/AiReceiptScreen.tsx
git commit -m "feat(receipt): surface per-item mode label and unassigned counter"
```

---

### Task 9: Save one expense

**Files:**
- Modify: `src/screens/AiReceiptScreen.tsx:2120-2205` (`saveReceiptExpense`)

**Interfaces:**
- Consumes: `owedByMemberId`, `linesTotalMinor`, `perItemResult` (Task 6)
- Produces: nothing consumed downstream.

Per the spec's Risks section this changes **all five modes** from N expenses to one — deliberate, so one screen and one button never produce two ledger shapes.

- [ ] **Step 1: Rewrite the function**

Replace the whole body of `saveReceiptExpense` (lines 2128-2189) with:

```ts
  const saveReceiptExpense = useCallback(async () => {
    if (!groupId || lines.length === 0 || busy || addingAll) return;
    const enabled = lines.filter((l) => !l.disabled);
    if (enabled.length === 0) return;
    if (scanSplitMode === "exact" && perItemResult.unassignedLineIds.length > 0) return;

    const owed = owedByMemberId;
    if (owed.size === 0) return;

    const amountMinor = linesTotalMinor;
    if (amountMinor <= 0) return;

    const resolvedPayer = members.some((m) => m.id === payerId)
      ? payerId
      : (members[0]?.id ?? myId);

    const title = (
      parsed?.merchant?.trim() || t("aiReceipt.fallbackTotalLabel")
    ).slice(0, 500);

    const savedGid = groupId;
    setAddingAll(true);
    try {
      const newExpenseId = await addExpenseWithSplits(db, savedGid, {
        description: title,
        amountMinor,
        payerId: resolvedPayer,
        expenseDate: new Date().toISOString(),
        owedByUserId: owed,
        category: guessCategoryFromTitle(title),
      });
      void classifyExpenseCategory(title)
        .then((cat) => updateExpenseCategory(db, savedGid, newExpenseId, cat))
        .catch(() => {});
      resetReceiptFlow();
      navigation.navigate("Groups", {
        screen: "GroupDetail",
        params: { groupId: savedGid },
      });
    } finally {
      setAddingAll(false);
    }
  }, [
    addingAll,
    busy,
    db,
    groupId,
    lines,
    linesTotalMinor,
    members,
    myId,
    navigation,
    owedByMemberId,
    parsed,
    payerId,
    perItemResult,
    resetReceiptFlow,
    scanSplitMode,
    t,
  ]);
```

`groupCurrency` and `includedMemberIds` leave the dependency array — amounts now arrive pre-computed through `linesTotalMinor` and `owedByMemberId`.

- [ ] **Step 2: Verify it compiles, tests and lints clean**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: no errors, and no unused-import warnings for anything the old per-line loop used.

- [ ] **Step 3: Manual verification against the original receipt**

Start the app (`npm run go`), open a group with four members, and scan or hand-enter the four lines: جوجه جنگلی 15,500,000 · جوجه کبک 26,000,000 · پیتزا پانچتا 14,200,000 · مالیات بر ارزش افزوده 9,244,560.

Confirm:
- The VAT row arrives marked as spread, the other three as items.
- Save is disabled showing "3 items still need people", and the count falls as rows are assigned.
- Assigning جوجه جنگلی to payam, جوجه کبک to Lyra + Eliana, and پیتزا to Lyra + Eliana + Arman yields plate totals **18,072,544 / 20,676,545 / 20,676,544 / 5,518,927**.
- Dragging a line onto a plate that already has it removes that person.
- Flipping VAT to "Share like an item" makes it demand its own sharers and re-disables Save.
- Save writes exactly one expense of 64,944,560 to the group.

- [ ] **Step 4: Commit**

```bash
git add src/screens/AiReceiptScreen.tsx
git commit -m "feat(receipt): save the whole receipt as one expense"
```

---

## Self-Review

**Spec coverage.** Every section of the design maps to a task: data model → Tasks 1 and 6; split math including the degenerate case, discounts and determinism → Tasks 2 and 3; the AI `kind` label → Task 4; row expansion, the tray and the segmented control → Task 7; additive drag → Task 6 Step 6; save gating and the unassigned counter → Tasks 6 and 8; plate totals → Task 8; single-expense save → Task 9; strings → Task 5. The spec's test list is covered by Tasks 2 and 3, including the golden table (Task 3 Step 1) and the kind-toggle behavior (Task 3's degenerate-case tests).

**Type consistency.** `computeReceiptOwed(lines, memberOrder)` keeps one signature across Tasks 2, 3, 6 and 9. `SplitLine.kind` and `EditableLine.kind` share the `"item" | "spread"` union, while `ParsedReceiptLine.kind` is the wider three-value union that Task 6 Step 2 collapses at the boundary. `perLineByMember` is named identically in the module, its tests, and the `slices` prop.

**Known gap, deliberate.** Screen behavior in Tasks 6-9 is verified by compile checks plus the manual script in Task 9 Step 3, not automated tests. This repo has no React Native component test harness; adding one is larger than this feature and belongs in its own plan. The arithmetic that would be genuinely error-prone by hand is fully unit-tested in Tasks 2 and 3.
