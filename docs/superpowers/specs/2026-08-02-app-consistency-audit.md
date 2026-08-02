# Tally App Consistency Audit — 2026-08-02

**Status:** Annotated, conventions approved (see Part 4). Ready for Phase 2
fix planning.

- When user hit spill button for voice it should start to record the button convert to stop button with red background and after that redirect user into AI page with generated text as it is now
- In settings enable lanuage switch option
- In AI page change Photo text into Camera
- In edit group page the save button should be on top right instead of done
- In edit group page choosing currency dosn't work
- In edit group page on manage members sharing button doesn't work it works only after closing adding members


## Part 1 — Inconsistency classes (cross-screen)

### C1. Confirm/save actions — location, label, and component all vary
**What varies:** The "commit this screen's edits" action appears in 3 different
locations, with 2 different label conventions ("Save X" vs "Done" vs "Continue"),
and is implemented as either `AppButton` or an ad-hoc `Pressable`+`Text`, with no
shared pattern across screens that do the same job.

| Screen | Label | Location | Component | Evidence |
|---|---|---|---|---|
| AddExpenseScreen | "Save" | header-right | ad-hoc Pressable+Text | `AddExpenseScreen.tsx:2699-2722` |
| AccountScreen | "Save profile" | header-right (inline pill in title row) | ad-hoc Pressable | `AccountScreen.tsx:1144-1164` |
| CreateGroupScreen | "Save Group"/"Saving" | header-right (native header) | ad-hoc Pressable | `CreateGroupScreen.tsx:848-874` |
| GroupDetailScreen (Settings modal) | "Save changes" | bottom of modal scroll | `AppButton variant="primary" fullWidth` | matches confirm-action description in report |
| FriendsScreen (Add/Edit modal) | "Save friend" | inline below fields, no scroll | `AppButton variant="primary" fullWidth` | `FriendsScreen.tsx:889-897` |
| AiReceiptScreen (receipt lines) | "Save" | bottom `saveRow`, next to Cancel | `AppButton variant="primary" fullWidth` | `AiReceiptScreen.tsx:2852-2877` |
| SettingsScreen (Help modal) | "Send" | inline below inputs, no scroll | `AppButton variant="primary" fullWidth` | `SettingsScreen.tsx:569-625` |
| ReceiptAssignDnDModal | "Done" (×2, redundant) | header-right text **and** bottom button | ad-hoc Pressable (header) + `AppButton` (bottom) | `ReceiptAssignDnDModal.tsx:447-449, 588-594` |
| AuthScreen | "Continue" | bottom of scroll | `AppButton variant="primary" fullWidth` | `AuthScreen.tsx` confirm action |

This is exactly the inconsistency you named: some screens confirm via a
header-right text button, others via a full-width `AppButton` at the bottom,
with no rule governing which screens get which.

### C2. Screen header implementation
**What varies:** Three different header strategies coexist for the same "back +
title (+ right action)" need.

| Screen | Header type | Evidence |
|---|---|---|
| GroupDetailScreen | Shared `ScreenHeader` | native header hidden, renders `ScreenHeader` |
| PrivacyPolicyScreen | Shared `ScreenHeader` | `PrivacyPolicyScreen.tsx:33-37` |
| CreateGroupScreen | **Native-stack default header** (only screen in its stack that keeps it) | `GroupsStackNavigator.tsx:57`, contrasts with sibling screens |
| AddExpenseScreen | Fully custom (`kitHeader`: Cancel/Title/Save text) | `AddExpenseScreen.tsx:2657-2723` |
| AccountScreen | Fully custom (left-aligned title, back chevron, inline save pill) | `AccountScreen.tsx:1118-1166` |
| FriendsScreen | Fully custom (no back button, "+" icon) | `FriendsScreen.tsx:604-623` |
| SettingsScreen | Fully custom top-level + 5 different custom modal headers | `SettingsScreen.tsx` |
| NotificationsScreen | Fully custom, despite `ScreenHeader` being used by sibling screens on the same stack | `NotificationsScreen.tsx:226-264` |
| AiReceiptScreen | No back button at all (tab root) | `AiReceiptScreen.tsx` headerAnchor |
| QrScanScreen | Fully custom translucent header (dark-theme only) | `QrScanScreen.tsx:139-157, 216-234` |
| GroupShareScreen | Fully custom sheet header (grabber + title + ✕) | `GroupShareScreen.tsx` |
| InviteAcceptedScreen | Fully custom (✕ only, no title bar) | `InviteAcceptedScreen.tsx:101-113` |
| ReceiptAssignDnDModal | Fully custom (Back/Title/Done text row, no chevron) | `ReceiptAssignDnDModal.tsx:440-450` |
| PlansScreen | Fully custom (back chevron only, no title in header) | `PlansScreen.tsx:161-175` |
| GroupsScreen / ActivityScreen | No header (tab roots) | n/a |
| OnboardingScreen | No header (first-run root) | n/a |

`ScreenHeader` exists precisely to standardize this and is used by only 2 of the
~14 screens that need a back+title header.

### C3. Button component usage — `AppButton` vs ad-hoc `Pressable`
**What varies:** `AppButton` is the shared button primitive, but most screens
build tappable actions from scratch instead.

| Screen | `AppButton` usage |
|---|---|
| AddExpenseScreen | 1 usage (JoinQR modal "Close") out of ~20 tappable actions — everything else (Save, Cancel, category tiles, split chips, pickers) is ad-hoc |
| CreateGroupScreen | **Zero** usages anywhere in the file |
| GroupsScreen | **Zero** usages anywhere in the file |
| AccountScreen | Mixed — Danger Zone/Sentry buttons use `AppButton variant="outline"`, but header Save and most rows are ad-hoc |
| GroupDetailScreen | Mixed — "Save changes"/"Open Group Share" use `AppButton`, but "Delete group" and member add/remove use ad-hoc Pressables (see C4/C5) |
| FriendsScreen, AiReceiptScreen, NotificationsScreen, AuthScreen, PlansScreen | Use `AppButton` for their primary confirm actions consistently |

### C4. Destructive-action styling
**What varies:** the "Delete X" action pattern.

| Screen | Style |
|---|---|
| AccountScreen | `AppButton variant="destructive"` for "Delete account" and the "DELETE" confirm |
| GroupDetailScreen | ad-hoc red-text `Pressable` for "Delete group" (`deleteGroupBtn`, not `AppButton`) |

### C5. Add/remove affordance icons
**What varies:** some screens use raw text glyphs, others use `Ionicons`.

| Screen | Glyph style |
|---|---|
| GroupDetailScreen | raw `"+"`/`"−"` text glyphs for member add/remove |
| CreateGroupScreen | raw `"×"` text glyph for chip remove |
| AddExpenseScreen, AiReceiptScreen, GroupShareScreen, InviteAcceptedScreen, NotificationsScreen, QrScanScreen | `Ionicons name="close"`/`"close-circle"`/`"add"`/`"remove"` |

### C6. Empty-state implementation
**What varies:** the shared `EmptyState` component (`src/ui/EmptyState.tsx`) documents
itself as meant for "Activity / Friends / Notifications and any other 'nothing
here yet' surface," but most qualifying screens don't use it.

| Screen | Empty-state implementation |
|---|---|
| ActivityScreen | shared `EmptyState` (correct) |
| NotificationsScreen | shared `EmptyState` (correct) |
| FriendsScreen | ad-hoc plain-text card — despite being named in `EmptyState`'s own doc comment |
| GroupsScreen | ad-hoc single centered `Text`, no icon/CTA |
| AiReceiptScreen | ad-hoc card + `AppButton` for "no groups" |
| GroupDetailScreen (Expenses tab) | separate bespoke component `GroupExpensesEmptyState`, not `EmptyState` |
| ReceiptAssignDnDModal | ad-hoc plain `Text` ("All items are assigned.") |
| SettingsScreen (currency picker) | ad-hoc `pickerEmpty` `Text` |

### C7. RTL row-mirroring gaps
**What varies:** most row containers correctly branch `flexDirection: isRTL ?
"row-reverse" : "row"`, but several — including the shared `ScreenHeader` and
`AppButton` components themselves — don't.

| Location | Gap |
|---|---|
| `src/ui/ScreenHeader.tsx:100` | `row` hardcoded to `"row"`; back chevron icon (`:87`) never flips for RTL |
| `src/ui/AppButton.tsx` | no RTL handling at all; `inner`/`iconLeft`/`iconRight` fixed regardless of locale |
| `src/components/GroupExportReportSnapshot.tsx:112` | reads `I18nManager.isRTL` (wrong flag on web) instead of `useLocale().isRTL` |
| GroupsScreen | `ccyPill` (`:176-187`) and `ccyRow` (`:296-304`) hardcode `"row"` while every other row in the file branches on `isRTL` |
| CreateGroupScreen | `isRTL` used exactly once (currency-modal chevron); every other row container hardcodes `"row"` |
| FriendsScreen | `rowSummaryCol` (`:226-230`) doesn't flip `alignItems` like sibling containers do |
| ReceiptAssignDnDModal | `isRTL` applied only to one `textAlign`; every row layout stays LTR-only |
| GroupShareScreen | `buildStyles` never receives `isRTL` at all — `headerRow`/`tilesRow` never mirror |
| InviteAcceptedScreen | "View group" trailing icon hardcoded to `arrow-forward`, never flips |
| PlansScreen | `activeBannerTitle` omits the RTL-aware `textAlign` spread (`...te`) that the line directly beneath it uses |
| GroupDetailScreen | `settlementArrowName` uses OS-level `I18nManager.isRTL` instead of the same `isRTL` used elsewhere in the file — can disagree for a window after a language switch |

### C8. Modal header pattern (within-modal "close" affordance)
**What varies:** the pattern for closing/committing a modal from its own header.

| Screen/modal | Pattern |
|---|---|
| AccountScreen, GroupDetailScreen, SettingsScreen (4 of 5 modals) | chevron-back (left) + title + "Done" text (right) |
| SettingsScreen — Currency modal | chevron only, no "Done" |
| GroupDetailScreen — Currency modal | no close/cancel control at all (`currencyModalDone` style defined but unused) |
| FriendsScreen — Add/Edit modal | "Cancel" text (left) + title + empty spacer (right); no chevron, no "Done" |
| ReceiptAssignDnDModal | "Back" text (left, but destructively discards) + title + "Done" text (right) |

### C9. Async error handling — a cross-cutting reliability gap, not just a design one
**What varies:** whether an async action's failure is caught and shown to the
user at all. This shows up so often it is worth tracking as its own class
alongside the per-screen bug list in Part 2.

Screens where a save/submit/delete/load path has **no `catch`** and can fail as
a silent unhandled promise rejection: AddExpenseScreen (`load()`), AiReceiptScreen
(implicitly, several flows), AccountScreen (`saveProfile`, `applyPickedAvatar`,
`clearAvatar`, `load()`), CreateGroupScreen (friend-list mount effect), AuthScreen
(`onContinue`, `onContinueWithGoogle`, `onContinueWithApple`, `onForgotPassword`,
`onResendConfirmation`), FriendsScreen (`load()`), GroupsScreen (`deleteGroup`
via `performDeleteGroup`), SettingsScreen (`load()`), NotificationsScreen
(`markAllRead`/`onTap`/`onArchive`), ActivityScreen (`load()`), PlansScreen
(`onBuyPass`/`onExtend`), GroupShareScreen (`onCopy`), ConfirmEmailOverlay
(`runResend`, `runContinue`), OnboardingScreen (`onPrimary`).

Screens that do catch and surface errors correctly: FriendsScreen's
`submitForm`/`performDelete`, GroupDetailScreen's export/save/invite flows
(via `Alert.alert`).

## Part 2 — Per-screen findings

### AddExpenseScreen (`src/screens/AddExpenseScreen.tsx`)
**Pattern profile:** Stack push, hides native header, renders custom `kitHeader`
(Cancel/Title/Save). Confirm action is "Save," header-right, ad-hoc Pressable
(class C1/C2/C3). No confirmation on discard. Nearly every control is an ad-hoc
`Pressable`; only one `AppButton` usage in the whole file. No loading/empty
states; errors are unhandled.

**Findings:**
1. **[bug]** `advancedSplitSummary`'s `useMemo` references `liveEqualAdjustShares`
   before it's declared later in the file — a temporal-dead-zone
   `ReferenceError` — `AddExpenseScreen.tsx:2072-2225` (use) vs `:2293` (declaration).
2. **[bug]** The "Who paid?" picker modal can never open — `setPayerPickerOpen(true)`
   is never called anywhere — `AddExpenseScreen.tsx:3723-3793`.
3. **[bug]** Editing an expense whose split was originally Percent/Shares/Adjust
   is always re-detected as "exact" on load; switching back to the original mode
   silently replaces the stored split with fresh defaults — `AddExpenseScreen.tsx:1670-1719`.
4. **[bug]** A split-validation error while "Advanced" is collapsed produces zero
   feedback on Save — the error banner only renders when the panel is open —
   `AddExpenseScreen.tsx:2582-2585, 2929-3397`.
5. **[bug]** `amountFocusTransferredFromTitleRef` is read/reset but never set —
   dead "hop from title to amount" logic; the amount input has no
   `onSubmitEditing` at all — `AddExpenseScreen.tsx:2427-2429, 1871`.
6. **[inconsistency]** Custom `kitHeader` instead of `ScreenHeader` or native
   header — part of class C2.
7. **[inconsistency]** Only one `AppButton` usage in the entire file — part of
   class C3.
8. **[polish]** ~118 of 226 `StyleSheet` keys are unused leftovers from a prior
   design — `AddExpenseScreen.tsx:140-1375`.
9. **[polish]** Hardcoded, non-locale-aware `"0.00"` placeholder on the
   Adjust-mode input — `AddExpenseScreen.tsx:3185`.

> USER:

### AiReceiptScreen (`src/screens/AiReceiptScreen.tsx`)
**Pattern profile:** Bottom-tab screen, no back/close button. Two confirm flows:
"Save"/"Cancel" (`AppButton`, bottom, for receipt lines) and "Add all to
`<group>`" (`AppButton`, bottom, for the describe/voice flow) — part of class C1.
Custom header, no `ScreenHeader`. "No groups" state is ad-hoc, not `EmptyState`
(class C6).

**Findings:**
1. **[bug]** Custom percent/shares/adjust splits are computed and shown per-tile
   but silently discarded on save — every non-"exact" mode is persisted as a
   plain equal split — `AiReceiptScreen.tsx:1938-2015` (esp. `1963-1974`).
2. **[bug]** `includedMemberIds` never resets when the active group changes —
   scanning a receipt for a different group can leave every tile showing as
   excluded — `AiReceiptScreen.tsx:2019-2025, 2607`.
3. **[bug]** The line-to-member picker modal can never open —
   `setPickerLineId` is only ever reset to `null`, never set — `AiReceiptScreen.tsx:1179, 3261-3285`.
4. **[bug]** No on-screen control exists to start voice recording — it only
   fires from a one-shot `autoRecord` route param — `AiReceiptScreen.tsx:1476-1523, 1551-1568`.
5. **[bug]** Tapping non-interactive content inside the group-picker modal
   (title/whitespace) closes the modal because it isn't excluded from the
   backdrop's own `onPress` — `AiReceiptScreen.tsx:3227-3229`.
6. **[inconsistency]** "No groups" state is ad-hoc, not the shared `EmptyState`
   — class C6.
7. **[inconsistency]** The lines-card "Save" button gives no busy feedback
   while saving, unlike the sibling "Add all" button — `AiReceiptScreen.tsx:2861-2877` vs `3190-3210`.
8. **[polish]** Several style blocks are dead leftovers from earlier design
   iterations (premium-gate overlay, hero card, large voice CTA) — `AiReceiptScreen.tsx:137-169, 220-278, 412-433`.
9. **[polish]** 3 literal, non-translated string fragments (`" · "`, bare `s`
   suffix, `": "`) — `AiReceiptScreen.tsx:3118, 3123, 3185`.

> USER: When user hits the mic/voice button it should start recording and the
> button should convert to a stop button with a red background; after
> stopping it should redirect the user into the AI page with the generated
> text, as it does now. Also: on the AI page, change the "Photo" text to
> "Camera."

### GroupDetailScreen (`src/screens/GroupDetailScreen.tsx`)
**Pattern profile:** Stack push, hides native header, renders shared
`ScreenHeader` (class C2, correct usage). Confirm action "Save changes" is an
`AppButton` at the bottom of the Settings modal (class C1). "Delete group" is
ad-hoc red text, not `AppButton variant="destructive"` (class C4). Member
add/remove uses raw `+`/`−` glyphs (class C5). Expenses-tab empty state uses a
separate bespoke component, not `EmptyState` (class C6).

**Findings:**
1. **[bug]** Sharing suggested settlements reads from an off-screen PNG capture
   view that only exists while the Settings modal is/was open — calling share
   without ever opening Settings silently fails — `GroupDetailScreen.tsx:2790-2792, 1739`.
2. **[bug]** `simplifyBalancesBusy` is excluded from `interactionLocked`, so
   other interactions stay active while the Balances-tab "Simplify debts"
   switch save is in flight — `GroupDetailScreen.tsx:1100`.
3. **[bug]** Group Settings drafts are never reset when the modal is closed
   without saving — a discarded edit silently reappears next time the modal
   opens in the same session — `GroupDetailScreen.tsx:1175-1177` vs `1102-1120`.
4. **[bug]** The currency-picker modal has no close/cancel control —
   `currencyModalDone` style is defined but never used — `GroupDetailScreen.tsx:955, 3045-3049`.
5. **[inconsistency]** "Simplify debts" exists as two switches with different
   persistence semantics (Balances tab saves immediately; Settings modal only
   saves via "Save changes") — `GroupDetailScreen.tsx:2069` vs `2671`.
6. **[inconsistency]** "Delete group" is ad-hoc red text, not `AppButton
   variant="destructive"` — class C4.
7. **[inconsistency]** Member add/remove uses raw `+`/`−` glyphs instead of
   `Ionicons` — class C5.
8. **[inconsistency]** `pickGroupIcon` silently no-ops on denied media
   permission, unlike `AiReceiptScreen`'s equivalent flow which shows a message
   — `GroupDetailScreen.tsx:1367`.
9. **[polish]** A dozen+ `StyleSheet` entries are unused — `GroupDetailScreen.tsx:264-701`.
10. **[polish]** Header title (opens Settings) has no visual affordance beyond
    an a11y label — sighted users get no cue it's tappable.

> USER: The Save button on the edit-group (Group Settings) screen should be
> top-right instead of the bottom "Done"/"Save changes" pattern. Also:
> choosing a currency in this screen doesn't work, and on "Manage members,"
> the sharing button doesn't work — it only works after closing the add
> members view.

### AccountScreen (`src/screens/AccountScreen.tsx`)
**Pattern profile:** Stack push, fully custom header (left-aligned title + back
chevron + inline "Save profile" pill), not `ScreenHeader` (class C2). Save is
header-right, ad-hoc Pressable (class C1). "Delete account" correctly uses
`AppButton variant="destructive"` (class C4, the good example).

**Findings:**
1. **[bug]** `saveProfile`, `applyPickedAvatar`, `clearAvatar` have no `catch`
   — a failure is an unhandled rejection with zero user feedback — `AccountScreen.tsx:956-970, 976-1012, 1018-1030`.
2. **[bug]** The avatar action sheet can build a 4-button `Alert.alert`, but
   Android supports at most 3 — one option is silently dropped — `AccountScreen.tsx:1040-1052`.
3. **[bug]** The "Net" hero stat only reflects `totals[0]` (alphabetically
   first currency), silently ignoring balances in other currencies — `AccountScreen.tsx:867-873`.
4. **[bug]** Clearing email while signed in routes into an implicit sign-out
   without ever setting `profileBusy` — a second tap can re-enter `saveProfile`
   mid-sign-out — `AccountScreen.tsx:945-953` vs `955`.
5. **[bug]** The cloud-sync switch's `onValueChange` re-checks gates that are
   already covered by its own `disabled` prop — dead code masking that the
   overlay handles gating — `AccountScreen.tsx:1383-1390` vs `1434-1438`.
6. **[inconsistency]** Fully custom header instead of `ScreenHeader` — class C2.
7. **[inconsistency]** Header-right Save pill instead of a bottom `AppButton`
   — class C1.
8. **[polish]** ~3 dozen unused style keys from a prior layout — `AccountScreen.tsx:115-484`.
9. **[polish]** Avatar block uses inline style objects instead of the file's
   own `StyleSheet` pattern — `AccountScreen.tsx:1188-1240`.
10. **[polish]** `load()`'s stats fetch swallows all errors silently — `AccountScreen.tsx:861-882`.

> USER:

### CreateGroupScreen (`src/screens/CreateGroupScreen.tsx`)
**Pattern profile:** Stack push, the **only** screen in its stack that keeps
the native-stack default header (class C2). Confirm is "Save Group"/"Saving,"
header-right, ad-hoc Pressable (class C1). Zero `AppButton` usage anywhere
(class C3). Chip-remove uses a raw `"×"` glyph (class C5).

**Findings:**
1. **[bug]** An async default-currency fetch can silently overwrite a currency
   the user already picked, with no guard against a later user action —
   `CreateGroupScreen.tsx:653-658`.
2. **[bug]** `MemberDraft.linkedNameAt` is dead — no UI lets a user edit an
   already-added member's name, so the documented "cleared if edited" behavior
   can never run — `CreateGroupScreen.tsx:70-71, 761-772, 974-999`.
3. **[bug]** The initial friend-list mount effect has no cancellation guard
   (unlike the near-identical `useFocusEffect` fetch beside it) — risk of
   state updates after unmount and duplicate fetching on first focus —
   `CreateGroupScreen.tsx:663-668` vs `695-708`.
4. **[inconsistency]** Native-stack header instead of `ScreenHeader` (unlike
   its own stack siblings) — class C2.
5. **[inconsistency]** Zero `AppButton` usage — class C3.
6. **[inconsistency]** Chip-remove raw `"×"` glyph — class C5.
7. **[inconsistency]** No group-photo picker on create, despite full styles/
   translation keys existing for one and `GroupDetailScreen`'s edit flow fully
   supporting it — `CreateGroupScreen.tsx:176-210, 610`.
8. **[inconsistency]** A further large block of unused styles/keys from an
   earlier "people composer" design, including a dropped "no friends yet"
   empty-state hint — `CreateGroupScreen.tsx:95-574` (scattered).
9. **[inconsistency]** Group-type chips and the currency modal's back/Done
   buttons lack `accessibilityRole`/`accessibilityLabel`, unlike nearly every
   other `Pressable` in the file — `CreateGroupScreen.tsx:912-933, 1216-1226`.
10. **[polish]** Two strings borrow other screens' i18n namespaces instead of
    `createGroup.*` — `CreateGroupScreen.tsx:994, 1065`.

> USER:

### AuthScreen (`src/screens/AuthScreen.tsx`)
**Pattern profile:** Stack push, custom header (bare back chevron, no title in
header — title lives in the scroll body), shared with several other screens'
"floating back button" style. Confirm is "Continue," bottom of scroll,
`AppButton variant="primary" fullWidth` (class C1, a good example of the
bottom-button pattern).

**Findings:**
1. **[bug]** A successful native Apple sign-in never leaves the screen — no
   attempt flag analogous to `googleAttemptRef` exists for Apple, so the
   navigation-on-success effect never fires — `AuthScreen.tsx:364-395` vs `124-137`.
2. **[bug]** `onResendConfirmation` throws on genuine failure with no
   caller-side catch — surfaces as an unhandled rejection instead of user
   feedback — `AuthScreen.tsx:284-290`.
3. **[bug]** Every submit handler (`onContinue`, `onContinueWithGoogle`,
   `onContinueWithApple`, `onForgotPassword`) swallows unexpected throws
   silently — busy resets but no error is ever shown — `AuthScreen.tsx:163-429`.
4. **[bug]** The password field's icon padding isn't RTL-aware while the
   toggle icon itself is repositioned for RTL — the eye icon can sit on top of
   typed characters in RTL — `AuthScreen.tsx:619-627` vs `652-656`.
5. **[bug]** The mode toggle and "Use locally" link stay interactive during an
   in-flight submit, and a stale closure can read pre-toggle `privacyAccepted`
   — `AuthScreen.tsx:530-544, 787-797, 241`.
6. **[polish]** `onConfirmUseLocally` and `completeToMain` have byte-for-byte
   identical bodies kept as two functions — `AuthScreen.tsx:119-122, 322-325`.
7. **[polish]** The CTA label expression has a dead branch that always
   evaluates to the same value as its sibling — `AuthScreen.tsx:737`.

> USER:

### FriendsScreen (`src/screens/FriendsScreen.tsx`)
**Pattern profile:** Bottom-tab root, fully custom header (title + "+" icon,
no back needed). Add/Edit Friend modal's confirm is "Save friend," inline
below fields (no scroll), `AppButton variant="primary" fullWidth` (class C1).
Modal header is "Cancel" + empty spacer, unlike every other modal's
chevron+Done (class C8). Empty state is ad-hoc despite `EmptyState`'s own doc
comment naming Friends as an intended consumer (class C6).

**Findings:**
1. **[bug]** The top summary card sums balances across all currencies into one
   number, then labels it with a single (arbitrary) currency symbol — silently
   mixing currencies — `FriendsScreen.tsx:582-592`. `GroupsScreen` handles the
   identical data shape correctly with a per-currency picker.
2. **[bug]** `load()` has no error handling on either call site — a DB failure
   silently keeps stale/empty data — `FriendsScreen.tsx:375-395, 561-566`.
3. **[bug]** Hardcoded, non-localized `"Error"` alert title in two places
   instead of `t(...)` — `FriendsScreen.tsx:458, 473`.
4. **[inconsistency]** Empty state is ad-hoc instead of shared `EmptyState` —
   class C6.
5. **[inconsistency]** No loading state before first `load()` resolves,
   unlike `ActivityScreen`'s `items === null` + spinner pattern — `FriendsScreen.tsx:342, 682-689`.
6. **[inconsistency]** Modal header is "Cancel" + empty spacer instead of the
   chevron+Done pattern used elsewhere — class C8.
7. **[polish]** `rowSummaryCol`'s `alignItems: "flex-end"` isn't flipped for
   RTL like every sibling container in the file — class C7.

> USER:

### GroupsScreen (`src/screens/GroupsScreen.tsx`)
**Pattern profile:** Bottom-tab root (`GroupsList`), no header of its own (a
sibling `GroupsListHeader` component renders above it). No confirm action —
pure browse screen; "Delete group" is confirmed via native `Alert`. Zero
`AppButton` usage (class C3). Empty state is ad-hoc plain text (class C6).

**Findings:**
1. **[bug]** Group deletion has no error handling — a failed delete gives no
   feedback and produces an unhandled rejection, unlike `FriendsScreen`'s
   equivalent delete flow which does catch — `GroupsScreen.tsx:440-449, 464`.
2. **[bug]** The "across N groups" summary caption is never pluralized — a
   user with exactly one group sees "across 1 groups" — `GroupsScreen.tsx:544-546`.
3. **[inconsistency]** `ccyPill`/`ccyRow` hardcode `flexDirection: "row"` while
   every other row style in the file branches on `isRTL` — class C7.
4. **[inconsistency]** Empty state is ad-hoc plain text instead of shared
   `EmptyState` — class C6.
5. **[polish]** Dead defensive check that can never be true — `GroupsScreen.tsx:403`.
6. **[polish]** `load()` runs twice on every mount/focus (once from a `useEffect`,
   once from `useFocusEffect`) — `GroupsScreen.tsx:377-385`.
7. **[polish]** Sync-status icon's accessibility label is static regardless of
   which of 5 states is active — `GroupsScreen.tsx:496-506`.
8. **[polish]** Per-group balance/member data is fetched serially in a loop
   instead of in parallel — `GroupsScreen.tsx:362-372`.

> USER:

### SettingsScreen (`src/screens/SettingsScreen.tsx`)
**Pattern profile:** Bottom-tab root, fully custom header + 5 custom modal
headers (class C2). No confirm action at top level (auto-applies on
selection); Help & Support modal's "Send" is inline, no scroll (class C1).
4 of 5 modals show a redundant chevron+"Done" pair that do the same thing;
the Currency modal omits "Done" (class C8).

**Findings:**
1. **[bug]** The Help & Support modal has no scroll container — its inputs and
   Send button can be pushed out of view by the keyboard — `SettingsScreen.tsx:569-625`.
2. **[bug]** The Help modal's "Done" link discards typed feedback without ever
   sending it or warning the user — it looks like a commit action but isn't —
   `SettingsScreen.tsx:582-586`.
3. **[inconsistency]** Redundant chevron+"Done" pair on 4 of 5 modals, missing
   entirely on the Currency modal — class C8.
4. **[inconsistency]** A hardcoded "emerald" hex color (computed twice) is used
   for icons/"Done" text instead of `colors.primary`, and is visibly a
   different green from the theme's actual primary in light mode — `SettingsScreen.tsx:40, 199`.
5. **[polish]** 10 modal back-chevron/"Done" Pressables have no
   `accessibilityRole`/`accessibilityLabel`, unlike the top-level rows —
   `SettingsScreen.tsx:406-650` (scattered).
6. **[polish]** `load()` has no try/catch.

> USER: The language switch option should be enabled here.

### NotificationsScreen (`src/screens/NotificationsScreen.tsx`)
**Pattern profile:** Stack push, fully custom header despite `ScreenHeader`
being used by sibling screens on the same stack for the identical layout
(class C2). No confirm action; header overflow opens "mark all read." Empty
state correctly uses shared `EmptyState` (class C6, good example).

**Findings:**
1. **[bug]** The header back button calls `navigation.popToTop()` instead of
   `goBack()` — given the real entry stack (GroupsList → Account →
   Notifications), pressing back jumps straight to GroupsList, skipping
   Account entirely — `NotificationsScreen.tsx:227-231`.
2. **[bug]** "Accept"/"Decline" buttons are wired to a notification kind that
   only represents invites *the current user sent* and is still pending on the
   recipient's side — a user cannot meaningfully accept/decline their own
   outgoing invite reminder — `NotificationsScreen.tsx:180-195`.
3. **[bug]** `markAllRead`/`onTap`/`onArchive` fire persistence writes with no
   error handling and no rollback of optimistic state on failure — `NotificationsScreen.tsx:96-128`.
4. **[inconsistency]** `readIds` drives the header's unread count but is never
   consulted per-row — no row ever shows an unread indicator — `NotificationsScreen.tsx:84-87` vs `148-222`.
5. **[inconsistency]** Reimplements its own header instead of `ScreenHeader` —
   different back-button size and border color from the shared component —
   class C2.
6. **[polish]** No loading indicator — the `EmptyState` view can flash before
   real data resolves.
7. **[polish]** `formatRelative()` returns hardcoded English strings never
   passed through `t(...)` — timestamps don't localize — `NotificationsScreen.tsx:363-369`.

> USER:

### ActivityScreen (`src/screens/ActivityScreen.tsx`)
**Pattern profile:** Bottom-tab root, custom title + filter chips, no back
needed. No confirm action (read-only feed). Uses shared `EmptyState` (class
C6, good example) and a full-screen `ActivityIndicator` while loading (a good
loading-state example other screens lack).

**Findings:**
1. **[bug]** Activity rows render a chevron implying navigability but have no
   tap handler anywhere in the file — tapping a row does nothing —
   `ActivityScreen.tsx:497-511` vs `412-419`.
2. **[bug]** The "Payments" and "Settlements" filter tabs are functionally
   identical — both filter on the exact same predicate — `ActivityScreen.tsx:330-333`.
3. **[bug]** `load()` has no error handling — a DB failure leaves the screen
   stuck on the loading spinner forever — `ActivityScreen.tsx:295-312`.
4. **[bug]** `AutoDirectionText` is fed a JSX subtree instead of the plain
   string its contract requires, so its direction auto-detection never runs —
   `ActivityScreen.tsx:503-505`.
5. **[inconsistency]** `RowKind` declares an `"expense-you-paid"` variant that
   is never produced — dead type member — `ActivityScreen.tsx:100-115`.
6. **[inconsistency]** Fallback "you" display name is a hardcoded English
   string, not translated — `ActivityScreen.tsx:324`.
7. **[polish]** `renderItem` is a permanent no-op with all content rendered
   inside `renderSectionHeader` instead, defeating `SectionList` virtualization
   — `ActivityScreen.tsx:584-591, 608`.

> USER:

### PlansScreen (`src/screens/PlansScreen.tsx`)
**Pattern profile:** Root-stack modal (`presentation: "modal"`), custom header
with a bare back chevron, no title in header (title lives in the scroll
body). Per-card CTA is `AppButton`, bottom of each card (class C1, consistent
with the bottom-button pattern). "Restore purchases" is ad-hoc text instead of
`AppButton`, unlike the visually-equivalent "Continue on web" beside it.

**Findings:**
1. **[bug]** Buy/Extend/Restore actions are only guarded against re-tapping
   the *same* card/action — a user can trigger two concurrent purchase calls
   across different cards — `PlansScreen.tsx:217-307, 346-391`.
2. **[bug]** Purchase/extension failures are silently swallowed as unhandled
   promise rejections — no `catch`, no `setLastError` on that path, unlike
   `restorePurchases` which does catch — `PlansScreen.tsx:99-119`.
3. **[inconsistency]** Per-card CTA's `accessibilityLabel` is hardcoded to
   "Buy" regardless of actual state (active/busy) — `PlansScreen.tsx:294-307`.
4. **[inconsistency]** "Restore purchases" is ad-hoc Pressable+Text, not
   `AppButton`, unlike the equivalent "Continue on web" footer action beside
   it — `PlansScreen.tsx:315-336`.
5. **[inconsistency]** `activeBannerTitle` omits the RTL-aware `textAlign`
   spread that the line beneath it uses — class C7.

> USER:

### QrScanScreen (`src/screens/QrScanScreen.tsx`)
**Pattern profile:** Fullscreen modal, fully custom translucent dark-theme
header (✕ close), independent of app theme. No confirm action (auto-scans).

**Findings:**
1. **[bug]** `setBusy(true)` fires before the scanned URL is validated, so an
   invalid QR code briefly shows the "success" checkmark before the error
   alert appears — `QrScanScreen.tsx:48-70`.
2. **[bug]** The unrecognized-code alert has a single button and no
   `onDismiss` — an Android back-button dismiss can leave scanning permanently
   stuck without running "Try Again" — `QrScanScreen.tsx:57-70`.
3. **[bug]** The initial permission-loading gate has no close/cancel control,
   and the screen has no swipe-to-dismiss — if permission resolution stalls
   there is no way to leave — `QrScanScreen.tsx:122-128`.
4. **[inconsistency]** On Android, "Paste link" only opens an info alert with
   no real paste path (unlike iOS's `Alert.prompt` / web's `window.prompt`) —
   functional dead end on that platform — `QrScanScreen.tsx:117-118`.
5. **[inconsistency]** The iOS paste-link dialog's confirm button reuses the
   unrelated `t("addExpense.save")` string — `QrScanScreen.tsx:104`.

> USER:

### GroupShareScreen (`src/screens/GroupShareScreen.tsx`)
**Pattern profile:** Transparent-modal, simulated bottom sheet (backdrop +
sheet view, no native sheet/gesture). Custom in-sheet header (grabber + title
+ ✕). No confirm action (share surface).

**Findings:**
1. **[bug]** `onCopy` has no `try/catch`, unlike its sibling
   `onShare`/`onWhatsapp`/`onEmail` — `GroupShareScreen.tsx:62-66` vs `68-118`.
2. **[bug]** The group-name fetch effect has no unmount guard — dismissing the
   sheet before it resolves still calls `setGroupName` on an unmounted screen
   — `GroupShareScreen.tsx:55-60`.
3. **[inconsistency]** `buildStyles` never threads `isRTL` — header/tiles never
   mirror for RTL, unlike sibling `QrScanScreen`/`InviteAcceptedScreen` — class C7.
4. **[polish]** An un-cleared `setTimeout` for the "copied" state can fire a
   state update after unmount — `GroupShareScreen.tsx:65`.

> USER:

### InviteAcceptedScreen (`src/screens/InviteAcceptedScreen.tsx`)
**Pattern profile:** Stack push with `gestureEnabled: false`, no title bar
(only a top-right ✕). "View group" / "View all groups" are `AppButton`
primary/secondary, bottom of screen — no traditional save/submit.

**Findings:**
1. **[inconsistency]** "View group"'s trailing icon is hardcoded to
   `arrow-forward` with no RTL flip, unlike sibling `QrScanScreen` — class C7.
2. **[inconsistency]** `useNavigation<any>()` discards the stack's param-list
   typing that the sibling `GroupShareScreen` preserves — `InviteAcceptedScreen.tsx:56`.
3. **[polish]** No loading/error state while `getGroup`/`listMembers` resolve
   — screen briefly shows an empty group name and "0 members."

> USER:

### ReceiptAssignDnDModal (`src/screens/ReceiptAssignDnDModal.tsx`)
**Pattern profile:** Always-mounted `Modal`, visibility toggled by prop.
Redundant "Done" in both header-right (text) and bottom (`AppButton`) — class
C1/C8. Header is "Back"/Title/"Done" text row, no chevron icon (class C2/C8).
Empty state is ad-hoc text, not `EmptyState` (class C6). Row layouts never
mirror for RTL (class C7).

**Findings:**
1. **[bug]** Tapping "Done" applies the in-progress assignment regardless of
   unassigned items, silently dropping them from the split — `ReceiptAssignDnDModal.tsx:280-283`.
2. **[bug]** The header-left button is labeled "Back" but discards assignment
   work without confirmation — destructive behavior mislabeled as
   non-destructive navigation — `ReceiptAssignDnDModal.tsx:442, 271-278`.
3. **[bug]** The drag-ghost's vertical centering uses a hardcoded height
   constant instead of the item's actual measured height — `ReceiptAssignDnDModal.tsx:45, 617-624`.
4. **[bug]** Item cards have no `onPress`, only `onLongPress` — a plain tap
   does nothing, making drag-and-drop the only (undiscoverable) way to assign
   an item — `ReceiptAssignDnDModal.tsx:470-493`.
5. **[polish]** `onPersonLayout` is a fully dead callback, never invoked —
   `ReceiptAssignDnDModal.tsx:393-402`.
6. **[inconsistency]** Redundant "Done" in header and footer — class C1.
7. **[inconsistency]** Ad-hoc empty state instead of `EmptyState` — class C6.
8. **[inconsistency]** Custom header instead of `ScreenHeader` — class C2.
9. **[inconsistency]** Row layouts never mirror for RTL — class C7.

> USER:

### ConfirmEmailOverlay (`src/screens/ConfirmEmailOverlay.tsx`)
**Pattern profile:** Not a real overlay/modal — a plain `View` swapped in by
`AuthScreen` in place of the sign-in form. No header of its own (parent
supplies a floating back button). "Continue"/"Resend"/"Edit email" are
`AppButton`s at the bottom of the footer (class C1, consistent).

**Findings:**
1. **[bug]** `runResend`'s success-state `setTimeout` is never cleared —
   fires a state update after unmount if the component is swapped out within
   the 3s window — `ConfirmEmailOverlay.tsx:60-72`.
2. **[bug]** Same pattern in `runContinue`'s failure-state timer —
   `ConfirmEmailOverlay.tsx:83`.
3. **[bug]** `runResend` has no `catch` — a rejected `onResend()` becomes an
   unhandled promise rejection with no user feedback — `ConfirmEmailOverlay.tsx:60-72`.
4. **[bug]** `runContinue` only handles a `false` resolution from
   `onContinue()`, not a thrown/rejected one — same silent-failure gap —
   `ConfirmEmailOverlay.tsx:74-89`.
5. **[polish]** Brand wordmark "Tally" and its "T" tile glyph are hardcoded
   literals, not routed through `t(...)`, unlike every other string in the file
   — `ConfirmEmailOverlay.tsx:115, 117`.

> USER:

### OnboardingScreen (`src/screens/OnboardingScreen.tsx`)
**Pattern profile:** First-run root screen, no header/back (can't be exited
except via the primary CTA). Primary CTA is `AppButton variant="primary"
fullWidth`, bottom of scroll footer (class C1, consistent with the
bottom-button pattern).

**Findings:**
1. **[bug]** `onPrimary`'s `try/finally` has no `catch` — if
   `markOnboardingDone()`/`landOnFirstScreen()` throws, the user sees no error
   feedback at all, unlike `AuthScreen`'s equivalent submit paths which do
   show `Alert.alert` — `OnboardingScreen.tsx:45-58`.
2. **[inconsistency]** No loading spinner on the primary CTA during a real
   async DB write, only the disabled/dimmed state.
3. **[polish]** The `features` array is rebuilt every render, unlike the
   memoized `styles` beside it.

> USER:

### PrivacyPolicyScreen (`src/screens/PrivacyPolicyScreen.tsx`)
**Pattern profile:** Stack push, uses shared `ScreenHeader` correctly (class
C2, good example). No confirm action (read-only document). Most thorough RTL
handling found in the audit (uses `writingDirection` per-locale, unlike most
other screens).

**Findings:**
1. **[inconsistency]** `useNavigation()` is untyped (no `RootStackParamList`
   generic), unlike sibling screens — `PrivacyPolicyScreen.tsx:23`.
2. **[inconsistency]** The document title renders twice — once in
   `ScreenHeader`, once again as a body heading immediately below it —
   `PrivacyPolicyScreen.tsx:44`.
3. **[polish]** A `14.5` fontSize value is duplicated across 3 separate style
   entries instead of one shared constant — `PrivacyPolicyScreen.tsx:109, 123, 129`.

> USER:

### Shared layer (`src/ui/`, `src/components/`, `src/navigation/`, `src/theme/`)
**Inventory:** `AppButton` (5 variants, 2 sizes), `AppSwitch`, `AppText`,
`AppTextInput`, `CategoryTile`, `EmptyState`, `FabPill`, `Field`, `JoinQrCard`,
`KeyboardDismissButton`, `ScreenHeader`, `SettingsGroup`, `SwipeableDeleteRow`
in `src/ui/`; `AppTour`, `AutoDirectionText`, `CloudSyncGateOverlay`,
`GoogleGIcon`, `GroupExpensesEmptyState`, `GroupExportReportSnapshot`,
`GroupTotalsBreakdown`, `NotificationsPopover`, `PersonAvatar`,
`PremiumRequiredPanel`, `SegmentedControl`, `SimplifyDebtsIllustration`,
`SyncStatusPill` in `src/components/`.

**Findings:**
1. **[bug]** `ScreenHeader` — the shared component meant to standardize
   back+title headers — never mirrors for RTL: `row` is hardcoded and the
   back-chevron icon never flips, while several ad-hoc per-screen headers get
   this right — `src/ui/ScreenHeader.tsx:87, 100`. Part of class C7.
2. **[bug]** `GroupExportReportSnapshot` reads `I18nManager.isRTL` instead of
   `useLocale().isRTL` — on web this flag never reflects the selected locale,
   so a Farsi export's settlement arrow points the wrong way —
   `src/components/GroupExportReportSnapshot.tsx:112`.
3. **[inconsistency]** `MainTabs`'s `GlobalFab` fully duplicates `ui/FabPill`
   instead of reusing it, and the two have drifted (different shadow tokens/
   values) — `src/navigation/MainTabs.tsx:614-702, 62-66` vs `src/ui/FabPill.tsx`.
4. **[inconsistency]** Only the `AiReceipt` tab bar icon swaps to a filled
   variant when focused; the other four tabs rely on color-only selection —
   `src/navigation/MainTabs.tsx:235-252, 775-793`.
5. **[bug]** `AppTextInput`'s clear-button icon color is a hardcoded light-mode
   hex instead of `colors.muted`, so it doesn't adapt in dark mode —
   `src/ui/AppTextInput.tsx:93`.
6. **[inconsistency]** `Field`/`SettingsGroup` hardcode `paddingLeft` on their
   eyebrow labels — not RTL-aware, unlike `AppTextInput`/`SwipeableDeleteRow`
   which use `paddingStart`/`paddingEnd` — `src/ui/Field.tsx:65,71`, `src/ui/SettingsGroup.tsx:140`.
7. **[inconsistency]** `AppButton` — the most reused primitive — has no RTL
   handling at all. Part of class C7.
8. **[inconsistency]** `KeyboardDismissButton` uses an unrelated blue tint
   against the green brand color, and its "Done" label is a hardcoded literal
   despite taking an `isRTL` prop — `src/ui/KeyboardDismissButton.tsx:41, 59`.
9. **[inconsistency]** Native header suppression is declarative
   (`headerShown: false` in navigator options) for some routes and imperative
   (`setOptions` inside the screen) for others, risking a first-frame native
   header flash on the imperative ones — `GroupsStackNavigator.tsx:76-100` vs
   `AddExpenseScreen.tsx:1862-1866`, `GroupDetailScreen.tsx:1135-1138`.
10. **[inconsistency]** `colors.accent` is defined in both palettes but never
    consumed anywhere; `colors.shadow` is referenced only once (in the
    duplicated `GlobalFab`) while the intended `shadows.*` API is used 30+
    times elsewhere — `src/theme/tokens.ts:25,28,53,56`.
11. **[inconsistency]** Chart/accent colors screens need aren't in the token
    set, so components hand-roll raw hex instead — `src/components/GroupTotalsBreakdown.tsx:36-40`,
    `src/components/CloudSyncGateOverlay.tsx:94-99`.
12. **[inconsistency]** Two structurally unrelated "empty state" components
    exist (`ui/EmptyState` vs `components/GroupExpensesEmptyState`) with no
    clear boundary between them. Part of class C6.
13. **[polish]** The "mint icon tile" pattern is independently re-implemented
    3 times instead of composing the existing `CategoryTile` —
    `src/ui/SettingsGroup.tsx:65-160`, `src/ui/EmptyState.tsx:54-85`.
14. **[inconsistency]** Shared popover/tooltip surfaces (`AppTour`,
    `NotificationsPopover`) hardcode their own shadow instead of the shared
    `shadows.card` token — `src/components/AppTour.tsx:245-254`, `src/components/NotificationsPopover.tsx:314-327`.
15. **[inconsistency]** `GroupsListHeader`'s accessibility labels are
    hardcoded English literals, unlike ~76 dedicated `*A11y` translation keys
    used by sibling components — `src/navigation/GroupsListHeader.tsx:134,165,179,196`.

> USER:

## Part 3 — Open questions (need the running app)

**AddExpenseScreen**
- Does the TDZ `ReferenceError` (finding 1) actually crash the screen today, or does a build/transpile step mask it?
- Is the premium soft-lock referenced in a comment for advanced split modes (`isPremiumSplitMode`) intentionally removed, or dropped unintentionally?
- Is the missing confirm-discard dialog an accepted product decision app-wide?
- Is the dead `payerPickerOpen` modal a leftover from a removed entry point?

**AiReceiptScreen**
- Is the equal-split-only save behavior (finding 1) a regression, or has "Percent/Shares/Adjust" here never been implemented beyond "exact"/"equal"?
- Is the member-picker modal (finding 3) genuinely vestigial, or was an entry point never wired up?
- Is in-screen voice recording (finding 4) intentionally FAB-only?
- Does the group-picker backdrop-tap bug (finding 5) reproduce at runtime?

**GroupDetailScreen**
- Does swipe-back still work given `headerShown: false`?
- Does the settlement-share failure (finding 1) actually manifest on a device that never opened Settings this session?
- Is persisting Settings-modal drafts across close/reopen (finding 3) intended "remember my edit" behavior, or a bug?

**AccountScreen**
- Does the 4-button Android alert (finding 2) actually drop an option in practice on this RN version?
- Do save/avatar failures (finding 1) look like silent "success" to a user on a real device?

**CreateGroupScreen**
- Is the missing group-photo picker on create intentional?
- Does the currency-fetch race (finding 1) actually reproduce on cold starts?

**AuthScreen**
- Is Apple sign-in's stuck state (finding 1) iOS-only, or does it affect the Android/web OAuth fallback too?
- Do `landOnFirstScreen`/`markOnboardingDone` ever throw in practice?

**FriendsScreen**
- How often do users actually have multi-currency groups (finding 1's real-world impact)?
- Is the missing empty-state CTA intentional?

**GroupsScreen**
- Is the double `load()` on mount (finding 6) visible as jank on lower-end devices?

**SettingsScreen**
- Is the Send button in Help & Support actually unreachable behind the keyboard on small devices?

**NotificationsScreen**
- Is `popToTop()` on back (finding 1) intentional, or a copy-paste mistake that should be `goBack()`?
- Are Accept/Decline (finding 2) dead UI waiting on a "received invite" feature that hasn't shipped?

**ActivityScreen**
- Was "Payments" meant to filter something different from "Settlements" (finding 2)?
- Should Activity rows navigate anywhere (finding 1)?

**PlansScreen**
- Is the missing concurrent-purchase guard (finding 1) actually exploitable, or does the IAP layer serialize calls itself?

**QrScanScreen**
- Does `useCameraPermissions()` ever stall long enough in practice for finding 3 to matter?

**GroupShareScreen**
- Is the missing RTL mirroring a known gap for Farsi users?

**ReceiptAssignDnDModal**
- Is this component actually wired into any live screen? No import/usage was found outside its own file — `AiReceiptScreen` implements its own separate tap-to-assign picker. Is this dead/superseded code, or awaited work-in-progress?

**ConfirmEmailOverlay**
- Is this overlay ever shown from a "signed-in-but-unverified" surface elsewhere, matching its own doc comment, or is that comment stale?

**Cross-cutting**
- Are the `ScreenHeader`/`GroupExportReportSnapshot` RTL gaps (findings 1-2) visible when actually running the app in the `fa` locale?
- Is `colors.accent` genuinely dead, or reserved for an upcoming feature?

## Part 4 — Tally's design conventions (approved 2026-08-02)

These are the decisions the user approved for the Phase 2 fix pass. They
apply to every current and future screen, not just the ones flagged above.

### R1. Confirm/save action placement (resolves C1)
- **Full-screen edit/create flows** (screens reached by pushing a new stack
  entry to create or edit an entity — Add Expense, Create Group, Account,
  Group Settings) → header-right "Save" (or contextual label like "Save
  Group"), rendered via `ScreenHeader`'s `right` slot as a small `AppButton`
  (`size="sm" variant="primary"`), not an ad-hoc `Pressable`+`Text`. This is
  the user's explicit instruction for Group Settings and matches the
  dominant existing pattern (Add Expense, Account, Create Group already do
  header-right saves).
- **Modal/sheet forms collecting one narrow thing** (Friends Add/Edit, Help &
  Support, receipt lines Save/Cancel, Auth, Onboarding) → bottom full-width
  `AppButton variant="primary"`.
- Every screen/modal keeps exactly one confirm control — no redundant pairs
  (fixes ReceiptAssignDnDModal's duplicate header+footer "Done").

### R2. Screen header component (resolves C2)
- Every pushed stack screen and every modal that needs back/close + title
  (+ right action) uses the shared `ScreenHeader` component. `ScreenHeader`
  gets extended, not forked, to cover cases it doesn't yet support:
  - a dark/translucent theme override (for QrScanScreen's fixed dark UI)
  - a sheet-style variant with a grabber handle instead of a back chevron
    (for GroupShareScreen's bottom-sheet presentation)
- Tab-root screens (Groups, Friends, Activity, Settings, AiReceipt) have no
  back action and don't use `ScreenHeader` — that's correct, not a gap.
- CreateGroupScreen's native-stack header and NotificationsScreen's
  hand-rolled duplicate both migrate to `ScreenHeader`.

### R3. Shared component adoption (resolves C3, C5)
- Every tappable action button in the app uses `AppButton` (never an ad-hoc
  `Pressable`+`Text` for something that is functionally a button).
- Every add / remove / close affordance uses `Ionicons` (`add`, `remove`,
  `close`, `close-circle`) — never a raw text glyph (`"+"`, `"−"`, `"×"`).
- Applied app-wide in this pass, not only to screens already touched for
  R1/R2.

### R4. Destructive actions (resolves C4)
- Every "Delete X" (and other irreversible/destructive) action uses
  `AppButton variant="destructive"`, matching AccountScreen's existing
  "Delete account" pattern. Fixes GroupDetailScreen's "Delete group."

### R5. Empty states (resolves C6)
- Every generic "nothing here yet" surface uses the shared `EmptyState`
  component: FriendsScreen, GroupsScreen, AiReceiptScreen's "no groups"
  card, SettingsScreen's currency-picker-empty state, and
  ReceiptAssignDnDModal's "all assigned" state.
- `GroupExpensesEmptyState` (GroupDetailScreen's illustrated, group-specific
  empty state) is a **documented exception** — it serves a different,
  intentionally illustrated purpose and stays as-is.

### R6. Modal header pattern (resolves C8)
- Every modal header is chevron-back (left) + title + a right-side action:
  "Done" for view/dismiss-only modals, "Save" for modals whose right action
  commits data (per R1).
- Fixes: FriendsScreen's "Cancel" + empty-spacer header (→ chevron + Save,
  since it's a save-type modal per R1); the missing close control on
  GroupDetailScreen's and SettingsScreen's currency-picker modals (→ add
  chevron + Done); ReceiptAssignDnDModal's misleading "Back" label, which
  currently discards work without confirmation (→ chevron + Save, and
  "Done"/Save must validate that all items are assigned before committing,
  per finding 1 on that screen).

### R7. RTL mirroring — engineering fix, not a taste decision
Every `flexDirection: "row"` container that lays out direction-sensitive
content branches on `isRTL` (`"row-reverse"` when true), and every
directional icon (chevrons, arrows) flips with it. This includes the shared
`ScreenHeader` and `AppButton` components themselves (C7's most important
finding — the standardizing components should not be the ones that get RTL
wrong). `GroupExportReportSnapshot` switches from `I18nManager.isRTL` to
`useLocale().isRTL` to match every other shared component.

### R8. Async error handling — engineering fix, not a taste decision
Every user-triggered async action (save, delete, load, submit) wraps its
awaited calls in `try/catch` and surfaces a failure via `Alert.alert` with a
translated message — matching the pattern `FriendsScreen`'s
`submitForm`/`performDelete` and `GroupDetailScreen`'s export/save/invite
flows already use correctly. This closes the long tail of "silent unhandled
rejection" bugs listed under C9 and per-screen throughout Part 2.

### Open item carried into Phase 2 scoping
`ReceiptAssignDnDModal` has no import/usage found anywhere outside its own
file — `AiReceiptScreen` implements a separate, different tap-to-assign
picker for what looks like the same feature. Before applying R1/R2/R5/R6 to
this file, Phase 2 confirms whether it's live, dead, or in-progress code, and
scopes the work (or skips it) accordingly.
