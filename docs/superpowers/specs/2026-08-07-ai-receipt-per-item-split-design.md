# AI Receipt — Per-Item Split with Shared Items and Distributed Surcharges — Design

**Date:** 2026-08-07
**Status:** Approved, ready for planning

## Problem

The "Add with AI" receipt screen parses a receipt into editable lines and lets the user drag
each line onto one person's plate. Two things it cannot express are exactly what a real
restaurant receipt needs:

1. **An item can only belong to one person.** `EditableLine.assigneeId` is a single
   `string | null`. A dish that three people shared has no representation — the user has to
   pick one person and accept a wrong split, or delete the line and re-enter it by hand.

2. **A tax or service line is treated as food.** The model returns
   مالیات بر ارزش افزوده as an ordinary line, so it is draggable onto exactly one plate.
   VAT belongs on everybody, in proportion to what they actually ate — a person who ordered
   one cheap dish should not carry the same tax as someone who ordered three expensive ones.

A third, smaller problem falls out of fixing those: the screen currently saves one expense
per line. Once a surcharge is spread across items, no per-line expense amount matches the
printed receipt any more, so the per-line save stops making sense.

## Decisions

Settled during brainstorming, recorded here so the plan does not relitigate them:

| Question | Decision |
|---|---|
| How does an item pick multiple people? | Tap the row to expand it in place; toggle member avatars in the tray. One row open at a time. |
| How does the app know a row is a surcharge? | The AI labels it. A manual toggle on every row can always override. |
| Keyword matching on the label as a fallback? | **No.** Rejected — "سرویس چالی" is a tea service people share, and a `سرویس`/`service` rule would silently convert a real item into a surcharge. A wrong guess is worse than no guess. |
| What does Save write? | One expense for the whole receipt, with an exact per-person owed map. |
| ...in the other split modes too? | Yes — all five modes save one expense, for coherence. See Risks. |
| What happens to Equal / % / Shares / Adj? | Kept, unchanged. `Exact` is relabelled `Per item` and becomes the default. |
| Who shares each item by default? | Nobody. Save stays disabled until every enabled line has at least one person. |

## Data model

`EditableLine` in `src/screens/AiReceiptScreen.tsx` replaces `assigneeId` with two fields:

```ts
type EditableLine = {
  id: string;
  label: string;
  amountMajor: number;
  /** Members sharing this line. Empty = unassigned; blocks Save. Replaces assigneeId. */
  sharerIds: string[];
  /** "spread" lines are distributed proportionally over the "item" lines. */
  kind: "item" | "spread";
  disabled?: boolean;
};
```

`ParsedReceiptLine` in `src/core/receiptParseTypes.ts` gains an optional `kind`:

```ts
export type ParsedReceiptLine = {
  label: string;
  amount: number;
  kind?: "item" | "surcharge" | "discount";
};
```

`surcharge` and `discount` both map to `kind: "spread"`. A discount is simply a negative
amount, so the same proportional pass handles it — no separate code path.

**A missing or unrecognized `kind` maps to `"item"`.** This is the compatibility rule: old
cached payloads, a model that ignores the new field, and any future unknown value all
degrade to today's behavior rather than guessing.

## The split math

The arithmetic is the part most likely to be wrong, so it lives in a new pure module,
`src/core/receiptSplit.ts`, with no React import and its own unit tests.

```ts
export type SplitLine = {
  id: string;
  amountMinor: number;
  sharerIds: string[];
  kind: "item" | "spread";
};

export function computeReceiptOwed(
  lines: SplitLine[],        // enabled lines only; caller filters `disabled`
  memberOrder: string[],     // group member order — makes rounding deterministic
): {
  owedByMemberId: Map<string, number>;
  perLineByMember: Map<string, Map<string, number>>;  // drives the per-row tray preview
  unassignedLineIds: string[];   // only lines that REQUIRE sharers — see Save gating
};
```

Three passes:

1. **Item lines.** Each line's `amountMinor` splits equally across its `sharerIds`: floor
   every share, then hand out the leftover minor units one at a time to that line's sharers
   **sorted by their position in `memberOrder`** — not by the order they were added to the
   line. Accumulate a per-member **item subtotal**.

2. **Spread lines.** Sum them into `spreadTotal`, then give each member
   `floor(spreadTotal × theirItemSubtotal / allItemSubtotals)`. Distribute the leftover
   units by the **largest-remainder method**: whoever's floored share discarded the largest
   fraction gets the next unit, ties broken by `memberOrder`.

   Largest-remainder rather than round-robin is load-bearing, not a preference. On the
   worked example below the floors leave a leftover of **2**, and handing those to the
   first two members in `memberOrder` gives Lyra 20,676,546 and Arman 5,518,926 — both
   off by one from the correct figures. The largest fractions belong to Arman (.912) and
   payam (.627), which is what produces the table.

   Compute the floor and the remainder comparison in `BigInt`. At Iranian Rial magnitudes
   `spreadTotal × itemSubtotal` exceeds 2^53 — the worked example below is ~1.6e14 in IRT
   but ~1.6e18 in IRR — so a float floor can come out one unit low.

   **This is belt-and-braces, not a bug fix.** Largest-remainder already self-heals a
   low float floor: flooring one unit low leaves a remainder of nearly `weightSum`, and
   since every legitimate remainder is by definition below `weightSum`, that member
   necessarily wins the next leftover unit and gets it straight back. This was checked
   against a case where the float floor is provably one low (items 9,743,718,000 and
   4,051,796,400, spread 1,241,596,296): float and `BigInt` produce identical final
   slices, differing only in the intermediate leftover count. `BigInt` is used anyway
   because exactness by construction does not depend on that argument continuing to hold
   if the leftover algorithm is ever changed. No test can distinguish the two
   implementations by output — do not add one claiming to.

3. **Reconcile.** The returned map sums to the enabled-line total exactly, by construction.

Iterating `memberOrder` rather than `Map` insertion order is what makes the odd minor unit
land on a stable person instead of drifting with edit history.

### Degenerate case

If there are no enabled item lines at all — a receipt of nothing but a VAT row —
`allItemSubtotals` is zero and the proportional pass is undefined. **Spread lines then fall
back to behaving as item lines:** they need their own `sharerIds` and block Save until
assigned. No division by zero, no silently discarded money.

### Worked example

The receipt from the original report. Four members in group order
`[payam, Lyra, Eliana, Arman]`; payam had جوجه جنگلی alone, Lyra and Eliana shared
جوجه کبک, and all three of Lyra/Eliana/Arman shared پیتزا پانچتا.

Item pass — پیتزا's 14,200,000 over three people is 4,733,333 each with 1 left over, which
goes to Lyra as the first member in order:

| | Item subtotal | VAT slice | Owes |
|---|---:|---:|---:|
| payam | 15,500,000 | 2,572,544 | **18,072,544** |
| Lyra | 17,733,334 | 2,943,211 | **20,676,545** |
| Eliana | 17,733,333 | 2,943,211 | **20,676,544** |
| Arman | 4,733,333 | 785,594 | **5,518,927** |
| **Total** | **55,700,000** | **9,244,560** | **64,944,560** |

VAT is 9,244,560 on 55,700,000 of items — 16.597%, carried by everyone at the same rate on
their own share. The four floored slices are 2,572,543 / 2,943,211 / 2,943,211 / 785,593,
summing to 9,244,558 — a leftover of two units, which largest-remainder awards to Arman
(.912) and payam (.627). This table is the golden test case.

## Screen behavior

**Row expansion.** Tapping a row expands it in place; `expandedLineId` state keeps exactly
one open. Collapsed rows show an avatar stack capped at three with a `+N` overflow; spread
rows show a chip instead of avatars.

**The tray.** A two-way segmented control — *Share like an item* / *Spread over items* — on
every row, whatever the AI proposed. Below it, either the member avatar toggles with each
person's slice, or the proportional distribution preview for a spread row.

**Drag and drop is unchanged in feel but additive.** Dropping a line on a plate *adds* that
member to `sharerIds` rather than replacing whoever was there. Dropping it on a plate that
already has the line removes them, so a drag toggles in both directions. Reordering by the
grip handle is untouched.

**Plates** show each member's running total including their spread slice.

**Save gating.** Every line starts with `sharerIds: []`. Save is disabled while any enabled
line that *requires* sharers is still unassigned, with a count — *"3 items still need
people."*

A line requires sharers when it is `kind: "item"`, **or** when it is `kind: "spread"` in the
degenerate case where no enabled item lines exist. A spread line in the normal case never
requires sharers — it is distributed by the proportional pass — and must not block Save or
appear in `unassignedLineIds`. Flipping a row's toggle therefore changes whether it gates
Save, and the count updates with it.

Excluding a member via their plate removes them from every line's `sharerIds`, which can
push lines back into the unassigned state and re-disable Save.

**Split modes.** The `Equal / % / Shares / Adj` chips keep working against the receipt total
exactly as they do today. Selecting one hides the trays and treats spread rows as ordinary
lines. `Exact` is relabelled `Per item` and is the default for a scanned receipt.

## Save

`saveReceiptExpense` collapses from a loop of `addExpenseWithSplits` calls to a single call:

- `description` — `parsed.merchant`, falling back to the existing `aiReceipt.fallbackTotalLabel`
- `amountMinor` — total of all enabled lines
- `owedByUserId` — `owedByMemberId` from `computeReceiptOwed` in Per-item mode; the existing
  per-mode computation otherwise
- `category` — `guessCategoryFromTitle` immediately, then the async `classifyExpenseCategory`
  update, as today

This applies to all five modes.

## Files

| File | Change |
|---|---|
| `src/core/receiptSplit.ts` | **new** — `computeReceiptOwed` and its types |
| `src/core/receiptSplit.test.ts` | **new** — see Testing |
| `src/screens/aiReceipt/ReceiptLineRow.tsx` | **new** — row + expansion tray, extracted so the screen does not grow |
| `src/core/receiptParseTypes.ts` | `kind` on `ParsedReceiptLine` |
| `src/core/parseReceiptImage.ts` | coerce `kind` in `normalizeLines`, unknown → omitted |
| `supabase/functions/ai-proxy/index.ts` | `kind` in the parse-receipt prompt and response schema |
| `src/screens/AiReceiptScreen.tsx` | model, expansion state, drag finalize, save rewrite |
| `src/i18n/translations.ts` | new en + fa strings |

`AiReceiptScreen.tsx` is 3,562 lines today. Extracting `ReceiptLineRow` is a targeted
improvement in the code this work touches — not general refactoring — and it keeps the
row's expansion state and tray markup reviewable on their own.

## Testing

`receiptSplit.test.ts` covers the module directly, since it is pure:

- **The worked example above**, asserted to the minor unit including the leftover placements
- **Rounding** — an amount that does not divide evenly, asserting the leftover lands on the
  first member in `memberOrder` and that the map sums to the input total exactly
- **Discounts** — a negative spread line reduces each member proportionally, still summing
  exactly
- **Multiple spread lines** — VAT and a service charge together
- **Degenerate case** — spread lines only, no item lines: they behave as item lines
- **Unassigned lines** — an unassigned item line is reported in `unassignedLineIds` and
  contributes nothing to the map; an unassigned spread line alongside real item lines is
  *not* reported, since it needs no sharers
- **Toggling kind** — flipping a line from item to spread removes it from
  `unassignedLineIds`, and flipping it back restores it
- **Determinism** — the same lines in a different array order produce the same map

Screen-level behavior (expansion, drag-to-add, save gating) is verified manually against the
original receipt; the arithmetic that would be tedious to check by hand is what the unit
tests pin down.

## Risks

**All modes now save one expense.** Equal / % / Shares / Adj currently write one expense per
receipt line, and this change makes them write one combined expense. Users who relied on the
itemized ledger from those modes lose it. The alternative — changing only Per-item — was
rejected because it leaves one screen and one button producing two different ledger shapes
depending on a chip selection. This is the one part of the design that goes beyond the
literal request, and it is deliberate.

**The AI may not return `kind` reliably.** Mitigated by the fallback to `"item"` and the
always-present manual toggle: a missing or wrong label costs one tap, never a wrong split.
Keyword matching was explicitly rejected as a backstop.

**Existing receipt state.** `assigneeId` disappears from `EditableLine`. It is component
state, not persisted, so there is no migration — but any in-flight parse held across the
change is discarded rather than converted.
