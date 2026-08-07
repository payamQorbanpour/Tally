# AI Receipt — Replace Split Tiles With Add-Expense Row Lists — Design

**Date:** 2026-08-07
**Status:** Approved, ready for planning

## Problem

The AI receipt screen's "who paid & split" section renders members as a horizontally
scrolling row of tall cards (`src/screens/AiReceiptScreen.tsx:3524-3706`). Each card does
double duty: tapping the avatar sets the payer, tapping the body toggles whether the person
is included in the split. The card also stacks a "PAID" badge slot, the name, an
included/excluded pill, the owed amount, and — in percent/shares/adjust modes — an inline
numeric input.

The Add Expense screen solves the same problem with two separate vertical lists: a
`paidByCard` radio list for the payer (`src/screens/AddExpenseScreen.tsx:2845-2887`) and a
`memberSplitCard` of per-member rows (`:3027-3233`). It reads more clearly, scales past
three or four members without horizontal scrolling, and is the pattern the rest of the app
already uses.

This spec brings the AI receipt screen onto that pattern.

## Scope

One file changes: `src/screens/AiReceiptScreen.tsx`. Specifically the render block at
`:3479-3706` and the corresponding styles inside `buildStyles`.

Explicitly **out of scope**:

- The receipt line-item list above this section, including its per-line sharer tray. It stays exactly as it is.
- `AddExpenseScreen.tsx`. Untouched.
- Any extraction of shared components or shared styles between the two screens. Considered and rejected — see "Approaches considered".
- Add Expense's friend-search, saved-friend suggestions, and inline add-person composer. Not ported into the receipt split card.
- Any change to split math, draft persistence, or expense saving.

## Approaches considered

**A — Local copy (chosen).** Port Add Expense's markup and styles into `AiReceiptScreen`,
adapted for the always-on inclusion checkbox. `AddExpenseScreen` is not touched, so there
is zero regression risk on an already-shipped screen. Cost: two near-identical copies of the
row styling that can drift over time.

**B — Shared row components.** Extract `PayerPicker` and `MemberSplitRow` into `src/ui/`
and refactor both screens onto them. Cleanest long-term, but Add Expense's split card also
embeds friend search, saved-friend suggestions, and an inline add-person composer, and its
checkbox is equal-mode-only. The shared component would need slots and mode flags to serve
both callers — real surgery on a working 3,900-line screen. Rejected as disproportionate.

**C — Shared styles, local markup.** Move the row styles to a
`buildSplitRowStyles(colors, cardShadow)` helper in `src/ui/`, spread into both screens'
style objects, markup stays local. Guarantees the two screens can't drift visually, at the
cost of a small edit to `AddExpenseScreen`. Rejected in favour of A to keep the entire diff
inside the screen being changed; worth revisiting if this look needs further tuning in both
places later.

## Constraint discovered during design: RTL

`I18nManager.forceRTL` is applied for Farsi (`src/i18n/LocaleContext.tsx:60-67`), so a plain
`flexDirection: "row"` mirrors automatically at the native layer.

The two screens handle this differently:

- `buildAddExpenseStyles(colors, cardShadow)` (`AddExpenseScreen.tsx:143`) takes no `isRTL` argument and uses plain `"row"`, relying on native mirroring.
- `buildStyles(colors, isRTL, shadows.card)` in `AiReceiptScreen` writes `isRTL ? "row-reverse" : "row"` explicitly throughout (e.g. `:705`, `:838`).

**The 21 styles copied from Add Expense must keep plain `flexDirection: "row"`.** Rewriting
them to the explicit `isRTL` flip used by their new neighbours would double-mirror and put
the avatar on the wrong side in Farsi. Because this makes the new block look inconsistent
with the rest of the file, the implementation adds a short comment above it recording why.

## Structure

The heading, mode toolbar, `splitModeHeading`, and horizontal tile `ScrollView` at
`:3479-3706` are replaced by four stacked blocks. Everything above (line list, VAT/discount
section) and below (`assignedTotal`, mismatch warnings, save row) is unchanged.

```
پرداخت‌کننده                        ← t("addExpense.paidBy")
┌────────────────────────────┐
│ (P)  Payam              ✓  │       paidByCard / paidByRow
│ (ع)  علیرضا                │       tap → setPayerId(m.id), role="radio"
│ (م)  مصطفی                 │
└────────────────────────────┘

روش تقسیم                          ← t("addExpense.splitMethod")
[⚙ تعدیل][≡ سهم][◔ %][▤ هر آیتم][● مساوی]   splitMethodChip pills, always visible

به‌ازای هر آیتم                     ← t(`aiReceipt.splitMode_${scanSplitMode}`)
┌────────────────────────────┐
│ (ع)  علیرضا             ☑  │       memberSplitCard / memberSplitRow
│      ۱۲,۰۰۰                │
│ ─────────────────────────  │
│ (م)  مصطفی              ☐  │
│      شامل نیست             │
└────────────────────────────┘
```

All three headings use the shared `Field` component (`src/ui/Field.tsx`), which owns the
uppercase eyebrow and the 18px gap above. `AddExpenseScreen` already uses it for its "Paid
by" label; `AiReceiptScreen` needs a new import for it. `Field` uppercases string labels
itself, so call sites pass the raw `t(...)` value. Using it here means `scrollEyebrow` does
not need to be copied.

### Payer card

One `paidByRow` per member: `PersonAvatar` at 32px in a `paidByAvatar` container, then the
name, then a `checkmark-circle` icon in `colors.primary` when `m.id === payerId`. Pressing
the row calls `setPayerId(m.id)`. `accessibilityRole="radio"` with
`accessibilityState={{ selected }}`.

### Split-method chips

The five modes keep their existing ids, order, and icons — `equal`, `exact`, `percent`,
`shares`, `adj`. Only the container style changes, from `splitTab` to `splitMethodChip`
pills. The chips stay **always visible**: unlike Add Expense, they are not placed behind an
"advanced split" disclosure and there is no summary banner. Per-item split is the primary
path of the receipt flow, so it must not cost an extra tap.

### Split rows

One `memberSplitRow` per member: `PersonAvatar` (32px, `paidByAvatar`) → flexible middle
column (`flex: 1, minWidth: 0`) → trailing checkbox.

Middle column line 1 is always `memberSplitName` showing `m.name`. Line 2 varies by mode:

| Mode | Line 2 when included | when excluded |
|---|---|---|
| `equal`, `exact` (per-item) | owed amount, in `memberSplitPreview` | `t("addExpense.notIncluded")` |
| `percent` | `[input]` `%` · owed amount | `t("addExpense.notIncluded")` |
| `shares` | `[input]` `t("addExpense.sharesUnit")` · owed amount | `t("addExpense.notIncluded")` |
| `adj` | `[input]` · owed amount | `t("addExpense.notIncluded")` |

For the three input modes, line 2 is a **single horizontal row** — a `memberSplitInputBase`
input, its unit suffix, then the owed amount in `memberSplitPreview` — not a third stacked
line. Row height therefore stays uniform across all five modes.

"Owed amount" throughout means
`formatMinor(owedByMemberId.get(m.id) ?? 0, groupCurrency, locale)`. A zero renders as a
formatted zero, replacing the old tiles' `—` placeholder (`:3639`); this matches Add
Expense's preview behaviour.

Inputs render only when the member is included — the same guard the current tiles use at
`:3641`, `:3663`, and `:3682` — and keep their existing `onChangeText` handlers, placeholders,
and `keyboardType` values verbatim.

The trailing control is always the `memberSplitChecker` Pressable calling
`togglePersonIncluded(m.id)`, with `accessibilityRole="checkbox"` and
`accessibilityState={{ checked }}`. Filled `colors.primary` with a white checkmark when
included; hollow bordered circle when not.

**The checkbox appears in every mode.** This is the one deliberate divergence from Add
Expense, where the checkbox is equal-mode-only. On the receipt screen inclusion is
meaningful in all five modes: `togglePersonIncluded` (`:3035-3055`) also unassigns that
member from every receipt line, and `assignableMembers` (`:2769`) filters the per-item
assignment tray by `includedMemberIds`.

The payer is **not** indicated in the split card — it is decided in the card above.
`personTilePayer`, `paidBadge`, and the `aiReceipt.payerBadge` string all fall out of use.

### Two defaults, stated explicitly

- **Self is shown by real name, not "شما".** Add Expense substitutes `t("addExpense.chipsYouLabel")` for the current user. The receipt screen resolves member names from receipt OCR and shows those names in the line list above, so showing the real name here stays consistent within the screen.
- **No add-person affordance in the split card.** Add Expense's search/suggest/add rows are not ported.

## Localization

**No new keys.** Every label needed already exists under `addExpense` in all locales:
`paidBy` (`src/i18n/translations.ts:1859`), `splitMethod` (`:1940`), `notIncluded` (`:1946`),
`sharesUnit` (`:1947`). Reusing them — rather than adding `aiReceipt` duplicates — is what
guarantees the two screens use identical wording, which is the point of the change.

The mode-name heading keeps its existing `aiReceipt.splitMode_${mode}` keys.

`aiReceipt.payerBadge`, `aiReceipt.includedLabel`, and `aiReceipt.excludedLabel` become
unused. `aiReceipt.tileFooterHintPayer` and `tileFooterHintInclude` are already unused today
(they describe tapping avatars and check rows, and have no call site). Leaving all five in
place is harmless; removing them across every locale is optional cleanup and not required by
this change.

## Style changes in `buildStyles`

**Delete** (all 40 verified to have no reference outside `:3479-3706`): `tileRow`,
`personTileWrap`, `personTilePressFill`, `personTile`, `personTilePayer`,
`personTileExcluded`, `avatarTap`, `tileBodyTap`, `personTileUnderArea`, `paidBadge`,
`paidBadgeLabel`, `paidBadgeSlot`, `includedToggle`, `includedIconSlot`, `includedToggleOn`,
`includedToggleOff`, `includedToggleLabel`, `includedToggleLabelOn`,
`includedToggleLabelOff`, `personTileAvatar`, `personTileAvatarPayerRing`,
`personTileAvatarLetter`, `personTileName`, `personTileNameOn`, `personTileAmount`,
`personTileAmountPayer`, `personTileAmountMuted`, `personTileInput`, `personTileInputFlex`,
`personTileInputPayer`, `personTileAdjInput`, `tilePercentRow`, `pctSuffix`,
`splitToolbarScroll`, `splitToolbarInner`, `splitTab`, `splitTabOn`, `splitTabLabel`,
`splitTabLabelOn`, `splitModeHeading`.

The implementation re-runs this unused check before deleting, rather than trusting the list.

**Add** 20 styles, copied verbatim from `buildAddExpenseStyles` subject to the RTL
constraint above: `paidByCard`, `paidByRow`, `paidByRowDivider`, `paidByAvatar`,
`paidByAvatarLetter`, `paidByName`, `splitMethodChips`, `splitMethodChip`,
`splitMethodChipOn`, `splitMethodChipLabel`, `splitMethodChipLabelOn`, `memberSplitCard`,
`memberSplitRow`, `memberSplitRowDivider`, `memberSplitName`, `memberSplitPreview`,
`memberSplitInputBase`, `memberSplitChecker`, `memberSplitCheckerOn`,
`memberSplitCheckerOff`.

None of these 20 names currently exist in `AiReceiptScreen`'s `buildStyles`, so there is no
collision to resolve. `scrollEyebrow` is deliberately not copied — the shared `Field`
component supplies the eyebrow instead.

## What must not change

This is presentational only. No state, derivation, or persistence is modified:
`payerId`, `includedMemberIds`, `percentText`, `sharesText`, `adjText`, `scanSplitMode`,
`perItemResult`, `owedByMemberId` (`:2783`), `aggregateMinor`, `mismatch`,
`unassignedCount`, `saveReceiptExpense` (`:2895`), and the debounced draft save.

`togglePersonIncluded` keeps its existing side effect of unassigning the member from every
line (`:3043-3049`) — the new checkbox calls exactly the same function.

## Verification

There are no screen-level test files under `src/screens/`, and the split math already lives
in pure modules with their own coverage. Verification is therefore by running the app:

1. Each of the five modes renders its row variant. The percent, shares, and adjust inputs accept input and the owed preview updates live.
2. Toggling a member off in per-item mode drops them from assigned lines, and the `itemsNeedPeople` warning recounts.
3. The payer radio moves between rows, and a saved expense records the correct payer.
4. Farsi (RTL): avatar leads on the right, checkbox trails on the left, matching Add Expense. English (LTR): mirrored.
5. Lint is clean on the changed file.
