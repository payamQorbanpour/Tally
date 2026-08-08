# AI Receipt Split Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI receipt screen's horizontally scrolling person tiles with the Add Expense screen's two vertical lists — a payer radio card and a per-member split row card.

**Architecture:** Purely presentational, single file. `src/screens/AiReceiptScreen.tsx` render block `:3479-3706` is replaced, 20 styles are copied in from `buildAddExpenseStyles`, and the 41 now-dead tile styles (a contiguous block at `:837-1143`) are deleted. No state, derivation, persistence, or split math changes. `AddExpenseScreen.tsx` is not touched.

**Tech Stack:** React Native + Expo, TypeScript, `@expo/vector-icons` Ionicons, local `StyleSheet` builders, i18n via `useLocale().t`.

**Spec:** `docs/superpowers/specs/2026-08-07-ai-receipt-split-rows-design.md`

## Global Constraints

- **Only one file changes:** `src/screens/AiReceiptScreen.tsx`. Do not modify `AddExpenseScreen.tsx`, `translations.ts`, or any shared component.
- **No new i18n keys.** Reuse `addExpense.paidBy`, `addExpense.splitMethod`, `addExpense.notIncluded`, `addExpense.sharesUnit`, and the existing `aiReceipt.splitMode_${mode}` / `aiReceipt.mode*` keys.
- **RTL:** copied styles keep plain `flexDirection: "row"`. Do **not** rewrite them to `isRTL ? "row-reverse" : "row"` like their neighbours in this file. `I18nManager.forceRTL` is already applied (`src/i18n/LocaleContext.tsx:60-67`), so adding the explicit flip would double-mirror.
- **Do not change** `payerId`, `includedMemberIds`, `percentText`, `sharesText`, `adjText`, `scanSplitMode`, `perItemResult`, `owedByMemberId`, `aggregateMinor`, `mismatch`, `unassignedCount`, `saveReceiptExpense`, `togglePersonIncluded`, or the debounced draft save.
- **Do not touch** the receipt line-item list above the section, its per-line sharer tray, the VAT/discount block, the `assignedTotal` line, the mismatch warnings, or the save row.
- **Split-method chips stay always visible.** No "advanced split" disclosure, no summary banner.

## Testing note

This repo has no React Native component-test harness — `npm test` is `vitest run` over pure modules (`src/core/*`, `src/data/*`, `src/ads/*`), and there are no test files under `src/screens/`. Adding a harness is out of scope for this change.

So each task's gate is: **typecheck clean, lint clean, and a described manual check in the running app.** Where a step says "run the app", use `npm run go` (Expo Go) or `npm run android` / `npm run ios`.

## File Structure

| File | Change |
|---|---|
| `src/screens/AiReceiptScreen.tsx` | Task 1 adds an import + 22 styles. Task 2 replaces render block `:3479-3706`. Task 3 deletes styles `:837-1143`. |

---

### Task 1: Add the row styles and the `Field` import

Additive only — nothing renders differently after this task. It exists as its own task so the style block can be reviewed against `buildAddExpenseStyles` in isolation, before the render rewrite makes the diff hard to read.

**Files:**
- Modify: `src/screens/AiReceiptScreen.tsx` (imports near `:97`; styles inside `buildStyles`, which starts at `:130`)

**Interfaces:**
- Consumes: `buildStyles(colors: ThemeColors, isRTL: boolean, cardShadow: ShadowStyle)` at `:130` — note `cardShadow` is the same parameter name `buildAddExpenseStyles` uses, so `...cardShadow` copies over unchanged.
- Produces: 22 style keys used by Task 2 — `paidByCard`, `paidByRow`, `paidByRowDivider`, `paidByAvatar`, `paidByAvatarLetter`, `paidByName`, `splitMethodChips`, `splitMethodChip`, `splitMethodChipOn`, `splitMethodChipLabel`, `splitMethodChipLabelOn`, `memberSplitCard`, `memberSplitRow`, `memberSplitRowDivider`, `memberSplitName`, `memberSplitPreview`, `memberSplitInputBase`, `memberSplitChecker`, `memberSplitCheckerOn`, `memberSplitCheckerOff`, plus two new local styles `memberSplitInputRow` and `memberSplitInputSuffix`. Also the `Field` component import.

**Note on the count:** the spec lists 20 styles copied from Add Expense. Add Expense writes its input-row container and unit-suffix text as inline object literals (`AddExpenseScreen.tsx:3108`, `:3109`). This plan promotes those two to named styles — `memberSplitInputRow` and `memberSplitInputSuffix` — because the AI receipt screen uses them in three modes instead of Add Expense's one, and inline objects reallocate on every render. Same visual result.

- [ ] **Step 1: Add the `Field` import**

`AiReceiptScreen.tsx` already imports `AppButton`, `AppSwitch`, `Text`, and `TextInput` from `../ui/` at `:94-97`. Add one more line to that group:

```tsx
import { Field } from "../ui/Field";
```

- [ ] **Step 2: Add the 22 styles inside `buildStyles`**

Insert this block inside the object returned by `buildStyles` (`:132`). Put it immediately **after** the `saveRow` style at `:1144` so it sits outside the `:837-1143` range Task 3 deletes wholesale.

Copy exactly as written. In particular do **not** add `isRTL ? "row-reverse" : "row"` — see Global Constraints.

```tsx
    /* ── Payer + split rows, ported from AddExpenseScreen so both screens
         read identically. Deliberately use plain `flexDirection: "row"`
         rather than this file's `isRTL ? "row-reverse" : "row"` idiom:
         I18nManager.forceRTL already mirrors these, and adding the
         explicit flip on top would double-mirror them in Farsi. ── */
    paidByCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      overflow: "hidden",
    },
    paidByRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    paidByRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    paidByAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    paidByAvatarLetter: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
    },
    paidByName: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.text,
    },
    splitMethodChips: {
      flexDirection: "row",
      gap: 8,
    },
    splitMethodChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    splitMethodChipOn: {
      backgroundColor: colors.owedSoft,
      borderColor: colors.primary,
    },
    splitMethodChipLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.muted,
    },
    splitMethodChipLabelOn: { color: colors.primary },
    memberSplitCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      overflow: "hidden",
      ...cardShadow,
    },
    memberSplitRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    memberSplitRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    memberSplitName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
    },
    memberSplitPreview: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
    memberSplitInputBase: {
      fontSize: 14,
      fontWeight: "700",
      backgroundColor: colors.inputSurface,
      color: colors.text,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: 10,
      width: 84,
      textAlign: "right",
      fontVariant: ["tabular-nums"],
      borderWidth: 0,
    },
    memberSplitChecker: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    memberSplitCheckerOn: { backgroundColor: colors.primary },
    memberSplitCheckerOff: {
      borderWidth: 2,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    /** Line 2 of a split row when the mode takes a numeric input. */
    memberSplitInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    memberSplitInputSuffix: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted,
    },
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If `StyleSheet.hairlineWidth` or `cardShadow` is reported as undefined, you inserted the block outside `buildStyles` — move it inside the returned object.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean on `src/screens/AiReceiptScreen.tsx`. Unused style keys are object properties, not bindings, so they do not trigger unused-variable rules at this stage.

- [ ] **Step 5: Commit**

```bash
git add src/screens/AiReceiptScreen.tsx
git commit -m "refactor(ai-receipt): add Add-Expense row styles and Field import"
```

---

### Task 2: Replace the tile scroller with the payer card and split rows

**Files:**
- Modify: `src/screens/AiReceiptScreen.tsx:3479-3706` (replace entirely)

**Interfaces:**
- Consumes from Task 1: the 22 style keys and the `Field` import listed above.
- Consumes from existing screen state, all unchanged: `members` (`{ id: string; name: string }[]`), `myId`, `myAvatarUri`, `payerId` / `setPayerId`, `includedMemberIds: Set<string>`, `togglePersonIncluded(memberId: string): void` (`:3035`), `owedByMemberId: Map<string, number>` (`:2783`), `scanSplitMode` / `setScanSplitMode`, `percentText` / `setPercentText`, `sharesText` / `setSharesText`, `adjText` / `setAdjText`, `groupCurrency`, `locale`, `colors`, `t`.
- Consumes already-imported components: `PersonAvatar` (`../components/PersonAvatar`), `Text` (`../ui/AppText`), `TextInput` (`../ui/AppTextInput`), `Ionicons`, `Pressable`, `View`, `ScrollView`.
- Produces: no new exports.

- [ ] **Step 1: Read the block you are about to replace**

Read `src/screens/AiReceiptScreen.tsx:3479-3706`. It runs from the `{/* ───── Who paid & split ───── */}` comment through the closing `</ScrollView>` of the tile row. The next line after it is blank, then `<Text style={[styles.muted, { marginTop: 10 }]}>` rendering `aiReceipt.assignedTotal`. That `assignedTotal` line and everything after it must survive untouched.

- [ ] **Step 2: Replace lines 3479-3706 with this**

```tsx
            {/* ───── Who paid — vertical radio card, mirroring
                 AddExpenseScreen's paidByCard. ───── */}
            <Field label={t("addExpense.paidBy")} topGap={14}>
              <View style={styles.paidByCard}>
                {members.map((m, i) => {
                  const on = m.id === payerId;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setPayerId(m.id)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={m.name}
                      style={({ pressed }) => [
                        styles.paidByRow,
                        i === 0 ? null : styles.paidByRowDivider,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <PersonAvatar
                        name={m.name}
                        avatarUri={m.id === myId ? myAvatarUri : null}
                        size={32}
                        containerStyle={styles.paidByAvatar}
                        letterStyle={styles.paidByAvatarLetter}
                      />
                      <Text style={styles.paidByName} numberOfLines={1}>
                        {m.name}
                      </Text>
                      {on ? (
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color={colors.primary}
                        />
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            </Field>

            {/* ───── Split method — same five modes and icons as before,
                 restyled from splitTab to AddExpense's chip pills. Kept
                 always visible: per-item split is this screen's primary
                 path, so it must not cost an extra tap. ───── */}
            <Field label={t("addExpense.splitMethod")}>
              <ScrollView
                horizontal
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.splitMethodChips}
              >
                {([
                  { id: "equal", icon: "people-outline", label: t("aiReceipt.modeEqual") },
                  { id: "exact", icon: "calculator-outline", label: t("aiReceipt.modePerItem") },
                  { id: "percent", icon: "pie-chart-outline", label: t("aiReceipt.modePercent") },
                  { id: "shares", icon: "layers-outline", label: t("aiReceipt.modeShares") },
                  { id: "adj", icon: "options-outline", label: t("aiReceipt.modeAdj") },
                ] as const).map((tab) => {
                  const on = scanSplitMode === tab.id;
                  return (
                    <Pressable
                      key={tab.id}
                      onPress={() => setScanSplitMode(tab.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      style={({ pressed }) => [
                        styles.splitMethodChip,
                        on && styles.splitMethodChipOn,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Ionicons
                        name={tab.icon}
                        size={16}
                        color={on ? colors.primary : colors.muted}
                      />
                      <Text
                        style={[
                          styles.splitMethodChipLabel,
                          on && styles.splitMethodChipLabelOn,
                        ]}
                        numberOfLines={1}
                      >
                        {tab.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Field>

            {/* ───── Per-member split rows. The inclusion checkbox shows in
                 every mode (unlike AddExpense, where it is equal-mode only)
                 because togglePersonIncluded also unassigns the member from
                 every receipt line, and assignableMembers filters the
                 per-item tray by includedMemberIds. ───── */}
            <Field label={t(`aiReceipt.splitMode_${scanSplitMode}`)}>
              <View style={styles.memberSplitCard}>
                {members.map((m, i) => {
                  const isIncluded = includedMemberIds.has(m.id);
                  const owed = formatMinor(
                    owedByMemberId.get(m.id) ?? 0,
                    groupCurrency,
                    locale,
                  );
                  return (
                    <View
                      key={m.id}
                      style={[
                        styles.memberSplitRow,
                        i === 0 ? null : styles.memberSplitRowDivider,
                      ]}
                    >
                      <PersonAvatar
                        name={m.name}
                        avatarUri={m.id === myId ? myAvatarUri : null}
                        size={32}
                        containerStyle={styles.paidByAvatar}
                        letterStyle={styles.paidByAvatarLetter}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.memberSplitName} numberOfLines={1}>
                          {m.name}
                        </Text>
                        {!isIncluded ? (
                          <Text style={styles.memberSplitPreview} numberOfLines={1}>
                            {t("addExpense.notIncluded")}
                          </Text>
                        ) : scanSplitMode === "percent" ? (
                          <View style={styles.memberSplitInputRow}>
                            <TextInput
                              style={[styles.memberSplitInputBase, { width: 64 }]}
                              value={percentText[m.id] ?? ""}
                              onChangeText={(text) =>
                                setPercentText((prev) => ({ ...prev, [m.id]: text }))
                              }
                              keyboardType="number-pad"
                              placeholder="0"
                              placeholderTextColor={colors.muted}
                            />
                            <Text style={styles.memberSplitInputSuffix}>%</Text>
                            <Text style={styles.memberSplitPreview} numberOfLines={1}>
                              {owed}
                            </Text>
                          </View>
                        ) : scanSplitMode === "shares" ? (
                          <View style={styles.memberSplitInputRow}>
                            <TextInput
                              style={[styles.memberSplitInputBase, { width: 64 }]}
                              value={sharesText[m.id] ?? ""}
                              onChangeText={(text) =>
                                setSharesText((prev) => ({ ...prev, [m.id]: text }))
                              }
                              keyboardType="number-pad"
                              placeholder="1"
                              placeholderTextColor={colors.muted}
                            />
                            <Text style={styles.memberSplitInputSuffix}>
                              {t("addExpense.sharesUnit")}
                            </Text>
                            <Text style={styles.memberSplitPreview} numberOfLines={1}>
                              {owed}
                            </Text>
                          </View>
                        ) : scanSplitMode === "adj" ? (
                          <View style={styles.memberSplitInputRow}>
                            <TextInput
                              style={styles.memberSplitInputBase}
                              value={adjText[m.id] ?? ""}
                              onChangeText={(text) =>
                                setAdjText((prev) => ({ ...prev, [m.id]: text }))
                              }
                              keyboardType="numbers-and-punctuation"
                              placeholder="0"
                              placeholderTextColor={colors.muted}
                            />
                            <Text style={styles.memberSplitPreview} numberOfLines={1}>
                              {owed}
                            </Text>
                          </View>
                        ) : (
                          <Text style={styles.memberSplitPreview} numberOfLines={1}>
                            {owed}
                          </Text>
                        )}
                      </View>
                      <Pressable
                        onPress={() => togglePersonIncluded(m.id)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isIncluded }}
                        accessibilityLabel={m.name}
                        hitSlop={8}
                        style={({ pressed }) => [
                          styles.memberSplitChecker,
                          isIncluded
                            ? styles.memberSplitCheckerOn
                            : styles.memberSplitCheckerOff,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        {isIncluded ? (
                          <Ionicons name="checkmark" size={18} color="#fff" />
                        ) : null}
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </Field>
```

Three things to check as you paste:
- The old block's five mode objects carried `icon` names — they are reproduced above unchanged (`people-outline`, `calculator-outline`, `pie-chart-outline`, `layers-outline`, `options-outline`), as are the mode ids and their order. Icon size drops from 20 to 16 to match the chip pill.
- The `exact` mode label deliberately uses `t("aiReceipt.modePerItem")`, not `modeExact` — that is what the old code did at `:3492`.
- `equal` and `exact` both fall through to the final `else` branch, which renders the owed amount alone. That is intended: per-item amounts come from line assignments, not a per-member input.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

If ``t(`aiReceipt.splitMode_${scanSplitMode}`)`` is rejected, you have a typo — the old code at `:3522` used the identical template call, so the key typing already permits it.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean on `src/screens/AiReceiptScreen.tsx`.

- [ ] **Step 5: Verify in the running app — layout and modes**

Run the app, open the AI receipt tab, and scan a receipt (or resume a saved draft) so the split section renders.

1. The payer card lists every member vertically, avatar then name, with a green `checkmark-circle` on exactly one row. Tapping another row moves the checkmark.
2. The five chips render as pills with the selected one filled; tapping each switches mode.
3. In **مساوی (equal)** and **هر گزینه (per-item)**, each row shows name over the owed amount, with the checkbox at the row's end.
4. In **%**, **سهم**, and **تعدیل**, included rows show the input, its suffix, and the owed amount on one line. Typing in the input updates the owed amount live.
5. Excluded rows show `شامل نیست` and no input.

- [ ] **Step 6: Verify in the running app — behavior preserved**

1. Toggle a member off while in per-item mode. They must disappear from the per-line sharer tray in the item list above, and the `{{count}} گزینه هنوز نیاز به انتخاب افراد دارد` warning must recount.
2. Toggle them back on. The tray offers them again.
3. Set a payer, save the expense, and confirm the saved expense records that payer.
4. Confirm the item list, VAT/discount block, split total, and save row above and below the section are visually unchanged.

- [ ] **Step 7: Verify in the running app — RTL and numeric input**

1. In Farsi, the avatar leads on the **right** of each row and the checkbox trails on the **left**, matching the Add Expense screen. Switch to English and confirm it mirrors.
2. In **%**, **سهم**, and **تعدیل** under Farsi, type a multi-digit value (e.g. `25`, then `12.5` in تعدیل) and confirm the digits appear in the order typed.

Point 2 is the one real risk in this task. The tiles being deleted set `writingDirection: "ltr"` and `direction: "ltr"` on their numeric inputs (`:1083-1084`, `:1099-1100`, `:1128-1129`); Add Expense's `memberSplitInputBase` does not, and the spec calls for a verbatim copy. If digits reorder or the caret jumps, add these two lines to `memberSplitInputBase` in `buildStyles` and re-check:

```tsx
      writingDirection: "ltr",
      direction: "ltr",
```

If you add them, say so in the commit body — it is a deliberate, tested divergence from the spec's verbatim-copy rule, not an oversight.

- [ ] **Step 8: Commit**

```bash
git add src/screens/AiReceiptScreen.tsx
git commit -m "feat(ai-receipt): replace split tiles with payer card and split rows"
```

---

### Task 3: Delete the dead tile styles

**Files:**
- Modify: `src/screens/AiReceiptScreen.tsx:837-1143` (delete)

**Interfaces:**
- Consumes: nothing. Runs after Task 2 has removed the only call sites.
- Produces: nothing.

- [ ] **Step 1: Re-verify the styles are unreferenced**

Do not trust the list below — confirm it against the current file first.

```bash
for s in tileRow personTileWrap personTilePressFill personTile personTilePayer \
  personTileExcluded avatarTap tileBodyTap personTileUnderArea paidBadge \
  paidBadgeLabel paidBadgeSlot includedToggle includedIconSlot includedToggleOn \
  includedToggleOff includedToggleLabel includedToggleLabelOn includedToggleLabelOff \
  personTileAvatar personTileAvatarPayerRing personTileAvatarLetter personTileName \
  personTileNameOn personTileAmount personTileAmountPayer personTileAmountMuted \
  personTileInput personTileInputFlex personTileInputPayer personTileAdjInput \
  tilePercentRow pctSuffix personTileSubMoney splitToolbarScroll splitToolbarInner \
  splitTab splitTabOn splitTabLabel splitTabLabelOn splitModeHeading; do
  n=$(grep -c "styles\.$s\b" src/screens/AiReceiptScreen.tsx)
  [ "$n" != "0" ] && echo "STILL USED: $s ($n)"
done; echo "scan complete"
```

Expected: `scan complete` with no `STILL USED` lines. If any name is still referenced, Task 2 is incomplete — stop and fix that first.

Note `personTileSubMoney` (`:1135-1143`) is in this list. It was already dead before this change — defined but never referenced — so it goes with the rest.

- [ ] **Step 2: Delete lines 837-1143**

The 41 styles form one contiguous run inside `buildStyles`. It begins with `tileRow: {` (currently `:837`, directly after `modalTitle` on `:836`) and ends with the closing `},` of `personTileSubMoney` (currently `:1143`, directly before `saveRow` on `:1144`).

Delete that whole range. After the edit, `modalTitle` should be immediately followed by `saveRow`.

Line numbers will have shifted by Task 2's edits — locate the boundaries by the `modalTitle` / `saveRow` neighbours, not by the numbers above.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. Any "property does not exist on type" error names a style you deleted that is still referenced — restore that one style and re-run Step 1 to find out why.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: clean.

- [ ] **Step 5: Verify the screen still renders**

Run the app, open the AI receipt split section, and cycle through all five modes. Nothing should look different from the end of Task 2 — this task removes only unreferenced style objects.

- [ ] **Step 6: Commit**

```bash
git add src/screens/AiReceiptScreen.tsx
git commit -m "refactor(ai-receipt): drop dead split-tile styles"
```

---

## Self-review notes

Checked against the spec:

- **Structure** (payer card, chips, split rows) → Task 2 Step 2.
- **`Field` for all three headings, `scrollEyebrow` not copied** → Task 1 Step 1, Task 2 Step 2.
- **Row anatomy table, single horizontal input line, zero renders as formatted zero** → Task 2 Step 2 (`owed` is computed unconditionally from `owedByMemberId.get(m.id) ?? 0`, so zero formats rather than showing `—`).
- **Checkbox in all five modes** → Task 2 Step 2, checkbox rendered outside the mode conditional.
- **Self shown by real name; no add-person affordance** → Task 2 Step 2 uses `m.name` with no `chipsYouLabel` branch and adds no search/add rows.
- **No new i18n keys** → Global Constraints; every `t()` call in Task 2 uses an existing key.
- **RTL constraint** → Global Constraints, Task 1 Step 2 comment, Task 2 Step 7.
- **Style deletion list** → Task 3, re-verified at Step 1 rather than trusted.
- **"What must not change"** → Global Constraints, verified at Task 2 Step 6.
- **Verification list** → Task 2 Steps 5-7, Task 3 Step 5.

Two places this plan is more specific than the spec, both called out inline where they occur:

1. The spec says 20 copied styles; the plan adds 22, promoting Add Expense's two inline literals (`AddExpenseScreen.tsx:3108-3109`) to named styles `memberSplitInputRow` / `memberSplitInputSuffix`.
2. The spec's delete list has 40 styles; the plan deletes 41, adding `personTileSubMoney`, which was already dead before this change.
