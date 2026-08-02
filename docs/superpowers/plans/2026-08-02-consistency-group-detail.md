# Group Detail/Settings Consistency & Bug Fixes (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring `GroupDetailScreen` and its Group Settings / Members / Currency
modals in line with Tally's approved design conventions (R1, R2, R3, R4, R6,
R7) and fix the three bugs the user reported on this screen (Save button
placement, currency picker not responding, share button not working until
Members modal is closed).

**Architecture:** All work happens in a single screen's file
(`src/screens/GroupDetailScreen.tsx`) plus a small i18n rename. Two of the
three user-reported bugs share a root cause: this screen stacks React
Native `<Modal>`s (opening one while another is still `visible`), and RN's
`<Modal>` renders in its own native layer above the rest of the app — a
second modal opened on top of a still-visible one, or a `navigation.navigate`
call fired while a modal is still visible, is not reliably interactive until
the first modal closes. The existing "Manage members" row already gets this
right (it closes Settings before opening Members); the fixes bring the
Currency picker and the Share button in line with that existing correct
pattern.

**Tech Stack:** Expo / React Native (TypeScript), existing `ScreenHeader` and
`AppButton` components from `src/ui/`.

**Conventions applied:** `docs/superpowers/specs/2026-08-02-app-consistency-audit.md`
Part 4, rules R1, R2, R3 (icon-affordance half), R4, R6, R7.

## Global Constraints

- All work happens in the git worktree `.worktrees/consistency-group-detail`
  on branch `implement/consistency-group-detail`, created off `main` —
  the current `design/ads-for-ai-credits` worktree and its pre-existing
  uncommitted changes (`ios/Tally/Info.plist`, `package.json`,
  `package-lock.json`, deleted patches, `src/navigation/MainTabs.tsx`) are
  never touched by this plan.
- No new npm dependencies.
- Every i18n key rename must update all 3 locale bodies (en/fa/es) plus the
  TypeScript interface in `src/i18n/translations.ts`, and every call site.
- After every task: `npm run lint` and `npx tsc --noEmit` must both pass
  with no new errors.
- Header-right "commit" actions use `AppButton variant="primary" size="sm"`;
  header-right "dismiss/done" actions use `AppButton variant="ghost" size="sm"`
  (ghost renders as transparent-background, primary-colored text — the same
  visual as the existing ad-hoc "Done" text links, achieved via the shared
  component instead of a one-off `Pressable`+`Text`).
- Small icon-only row affordances (member remove, friend add) become
  `Ionicons` inside their existing `Pressable`, not `AppButton` — `AppButton`
  is for labeled action buttons, matching how every other icon-only
  affordance in the app (close/add/remove on rows) is already built.

---

### Task 1: Rename `groupDetail.saveChanges` → `groupDetail.save`

**Files:**
- Modify: `src/i18n/translations.ts:903` (interface), `:1940` (en), `:2944` (fa), `:3950` (es)
- Modify: `src/screens/GroupDetailScreen.tsx:2762` (only call site)

The header-right Save button needs a short label ("Save") — `ScreenHeader`
reserves a fixed-width zone for the centered title on each side of the
header, and a long label risks visually colliding with the title on narrow
screens. This is the only call site for `saveChanges`, so it's a clean
rename rather than adding a new, overlapping key.

- [ ] **Step 1: Rename the interface field**

In `src/i18n/translations.ts`, find the `groupDetail` interface block
(around line 903):
```ts
    saveChanges: string;
```
Replace with:
```ts
    save: string;
```

- [ ] **Step 2: Rename the English value** (around line 1940)

```ts
    saveChanges: "Save changes",
```
Replace with:
```ts
    save: "Save",
```

- [ ] **Step 3: Rename the Farsi value** (around line 2944)

```ts
    saveChanges: "ذخیره تغییرات",
```
Replace with:
```ts
    save: "ذخیره",
```

- [ ] **Step 4: Rename the Spanish value** (around line 3950)

```ts
    saveChanges: "Guardar cambios",
```
Replace with:
```ts
    save: "Guardar",
```

- [ ] **Step 5: Update the call site**

In `src/screens/GroupDetailScreen.tsx:2762`, this line (inside the
`saveGroupBtn`'s `label` expression) currently reads:
```tsx
                    : t("groupDetail.saveChanges")
```
This whole `AppButton` is removed in Task 4, so this rename just needs to
land before Task 4 touches the same area. For now, update the reference:
```tsx
                    : t("groupDetail.save")
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors (confirms no other call site references the old key).

- [ ] **Step 7: Commit**

```bash
git add src/i18n/translations.ts src/screens/GroupDetailScreen.tsx
git commit -m "i18n: rename groupDetail.saveChanges to groupDetail.save"
```

---

### Task 2: Fix currency picker not responding (modal-stacking bug)

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:1690-1693` (`openCurrencyPicker`)
- Modify: `src/screens/GroupDetailScreen.tsx:3036-3087` (Currency `<Modal>`)

**Root cause:** `openCurrencyPicker` opens the Currency `<Modal>` while the
Group Settings `<Modal>` is still `visible`. Two simultaneously-visible RN
`<Modal>`s is exactly the class of bug already fixed correctly for "Manage
members" (`GroupDetailScreen.tsx:2611-2614`, which closes Settings before
opening Members). The fix: close Settings before opening Currency, and
reopen Settings when Currency closes (whichever way it closes).

**Interfaces:**
- Consumes: existing `groupSettingsModalOpen`/`setGroupSettingsModalOpen`,
  `currencyPickerOpen`/`setCurrencyPickerOpen` state already declared in
  this component (lines 1072, 1083).

- [ ] **Step 1: Close Settings before opening Currency picker**

Current code (`GroupDetailScreen.tsx:1690-1693`):
```tsx
  const openCurrencyPicker = () => {
    setCurrencySearch("");
    setCurrencyPickerOpen(true);
  };
```
Replace with:
```tsx
  const openCurrencyPicker = () => {
    setCurrencySearch("");
    setGroupSettingsModalOpen(false);
    setCurrencyPickerOpen(true);
  };

  const closeCurrencyPicker = () => {
    setCurrencyPickerOpen(false);
    setGroupSettingsModalOpen(true);
  };
```

- [ ] **Step 2: Route the Currency modal's close paths through `closeCurrencyPicker`**

Current code (`GroupDetailScreen.tsx:3036-3039`):
```tsx
      <Modal
        visible={currencyPickerOpen}
        animationType="slide"
        onRequestClose={() => setCurrencyPickerOpen(false)}
      >
```
Replace with:
```tsx
      <Modal
        visible={currencyPickerOpen}
        animationType="slide"
        onRequestClose={closeCurrencyPicker}
      >
```

- [ ] **Step 3: Route the row-selection close through `closeCurrencyPicker`**

Current code (`GroupDetailScreen.tsx:3071-3074`):
```tsx
                onPress={() => {
                  setGroupCurrencyDraft(item.code);
                  setCurrencyPickerOpen(false);
                }}
```
Replace with:
```tsx
                onPress={() => {
                  setGroupCurrencyDraft(item.code);
                  closeCurrencyPicker();
                }}
```

(The header-right "Done" button added in Task 7 will also call
`closeCurrencyPicker`.)

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "fix: currency picker not responding when opened from Group Settings"
```

---

### Task 3: Fix "Open Group Share" not working until Members modal closes

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:2969-2985` (Members modal "Open Group Share" button)

**Root cause:** the same class of bug as Task 2 — `navigation.navigate("GroupShare", ...)`
is called while the Members `<Modal>` is still `visible`. RN's `<Modal>`
sits above the whole app (including the navigator), so the newly-pushed
`GroupShare` screen renders behind/underneath the still-open Members modal
and appears unresponsive until Members is closed.

- [ ] **Step 1: Close the Members modal before navigating**

Current code (`GroupDetailScreen.tsx:2969-2985`):
```tsx
                <View style={styles.inviteBlock}>
                  <AppButton
                    variant="primary"
                    fullWidth
                    label={t("groupShare.openCta")}
                    left={
                      <Ionicons
                        name="qr-code-outline"
                        size={18}
                        color="#fff"
                      />
                    }
                    onPress={() =>
                      navigation.navigate("GroupShare", { groupId })
                    }
                    style={{ marginBottom: 12 }}
                  />
```
Replace the `onPress` with:
```tsx
                    onPress={() => {
                      closeMembersModal();
                      navigation.navigate("GroupShare", { groupId });
                    }}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "fix: Group Share button unresponsive until Members modal is closed"
```

---

### Task 4: Group Settings modal — header-right Save, remove redundant bottom button, reset drafts on discard

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:1175-1177` (`closeGroupSettingsModal`)
- Modify: `src/screens/GroupDetailScreen.tsx:1385-1424` (`saveGroupSettings`, close modal on success)
- Modify: `src/screens/GroupDetailScreen.tsx:2511-2530` (Settings modal header)
- Modify: `src/screens/GroupDetailScreen.tsx:2754-2766` (remove bottom Save button)
- Modify: `src/screens/GroupDetailScreen.tsx:996-1004` (remove now-unused header styles)

Implements R1 (header-right Save replaces bottom "Save changes" and the
existing header "Done"), R2 (adopt shared `ScreenHeader`), and fixes audit
finding "Group Settings drafts are never reset when the modal is closed
without saving" by resetting drafts in `closeGroupSettingsModal`, mirroring
the reset logic `load()` already does (`GroupDetailScreen.tsx:1105-1111`).

**Interfaces:**
- Consumes: `ScreenHeader` (`src/ui/ScreenHeader.tsx` — `title`, `onBack`,
  `right` props), `AppButton` (`src/ui/AppButton.tsx` — `variant`, `size`,
  `label`, `onPress`, `disabled` props), `canSaveGroupSettings`,
  `groupSettingsBusy`, `groupExportBusy`, `group` (existing state/derived
  values in this component).

- [ ] **Step 1: Reset drafts when Settings closes without saving**

Current code (`GroupDetailScreen.tsx:1175-1177`):
```tsx
  const closeGroupSettingsModal = () => {
    setGroupSettingsModalOpen(false);
  };
```
Replace with:
```tsx
  const closeGroupSettingsModal = () => {
    setGroupSettingsModalOpen(false);
    if (group) {
      setGroupNameDraft(group.name);
      setGroupCurrencyDraft(group.currency);
      setGroupTypeDraft(group.group_type);
      setSimplifyDraft(group.simplify_debts);
      setIconDraft(group.icon);
    }
  };
```

- [ ] **Step 2: Close the modal after a successful save**

Current code (`GroupDetailScreen.tsx:1385-1398`):
```tsx
  const saveGroupSettings = useCallback(async () => {
    if (!group || !groupNameDraft.trim() || groupSettingsBusy || groupDeleteBusy) return;
    setGroupSettingsBusy(true);
    try {
      await updateGroup(db, groupId, {
        name: groupNameDraft,
        currency: groupCurrencyDraft,
        icon: iconDraft,
        groupType: groupTypeDraft,
        simplifyDebts: simplifyDraft,
      });
      await load();
      bumpGroupsList();
    } catch (e) {
```
Replace the `await load(); bumpGroupsList();` line with:
```tsx
      await load();
      bumpGroupsList();
      setGroupSettingsModalOpen(false);
    } catch (e) {
```

- [ ] **Step 3: Replace the modal header with `ScreenHeader`**

Current code (`GroupDetailScreen.tsx:2511-2530`):
```tsx
      <Modal
        visible={groupSettingsModalOpen}
        animationType="slide"
        onRequestClose={closeGroupSettingsModal}
      >
        <KeyboardAvoidingView
          style={styles.groupSettingsModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.groupSettingsModalHeader}>
            <Text style={styles.groupSettingsModalTitle}>
              {t("groupDetail.groupSettings")}
            </Text>
            <Pressable onPress={closeGroupSettingsModal} hitSlop={12}>
              <Text style={styles.groupSettingsModalDone}>
                {t("groupDetail.done")}
              </Text>
            </Pressable>
          </View>
          {group ? (
```
Replace with:
```tsx
      <Modal
        visible={groupSettingsModalOpen}
        animationType="slide"
        onRequestClose={closeGroupSettingsModal}
      >
        <KeyboardAvoidingView
          style={styles.groupSettingsModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScreenHeader
            title={t("groupDetail.groupSettings")}
            onBack={closeGroupSettingsModal}
            backAccessibilityLabel={t("nav.back")}
            right={
              <AppButton
                variant="primary"
                size="sm"
                label={
                  groupSettingsBusy
                    ? t("groupDetail.saving")
                    : t("groupDetail.save")
                }
                onPress={() => void saveGroupSettings()}
                disabled={!canSaveGroupSettings || groupExportBusy}
              />
            }
          />
          {group ? (
```

- [ ] **Step 4: Remove `groupSettingsModalRoot`'s now-redundant top padding**

`ScreenHeader` handles its own safe-area top inset internally. Current
code (`GroupDetailScreen.tsx:990-995`):
```tsx
  groupSettingsModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
```
Replace with:
```tsx
  groupSettingsModalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  groupSettingsModalBody: {
    paddingHorizontal: 16,
  },
```
Then wrap the modal's `ScrollView` (the one whose `contentContainerStyle`
is `styles.groupSettingsModalScroll`, immediately after the `ScreenHeader`
from Step 3) with a `<View style={styles.groupSettingsModalBody}>` so the
header stays edge-to-edge while the body content keeps its horizontal
padding. Concretely, change:
```tsx
          {group ? (
            <>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.groupSettingsModalScroll}
            >
```
to:
```tsx
          {group ? (
            <>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.groupSettingsModalScroll}
              style={styles.groupSettingsModalBody}
            >
```
and close the added wrapping only via the style (no new closing tag needed
since we used `style` on the `ScrollView` itself, not a wrapping `View`).

- [ ] **Step 5: Remove the now-unused header styles**

Current code (`GroupDetailScreen.tsx:996-1004`):
```tsx
  groupSettingsModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  groupSettingsModalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  groupSettingsModalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
  groupSettingsModalScroll: { paddingBottom: 48 },
```
Replace with:
```tsx
  groupSettingsModalScroll: { paddingBottom: 48 },
```

- [ ] **Step 6: Remove the bottom "Save changes" `AppButton`**

Current code (`GroupDetailScreen.tsx:2754-2766`):
```tsx
              <AppButton
                variant="primary"
                fullWidth
                style={styles.saveGroupBtn}
                textStyle={styles.saveGroupBtnText}
                label={
                  groupSettingsBusy
                    ? t("groupDetail.saving")
                    : t("groupDetail.save")
                }
                onPress={() => void saveGroupSettings()}
                disabled={!canSaveGroupSettings || groupSettingsBusy || groupExportBusy}
              />

```
Delete this block entirely (the `Pressable` for "Delete group" that follows
immediately after becomes the first element in that section).

- [ ] **Step 7: Remove the now-unused `saveGroupBtn`/`saveGroupBtnText` styles**

Current code (`GroupDetailScreen.tsx:889-890`):
```tsx
  saveGroupBtn: { marginTop: 20 },
  saveGroupBtnText: { fontSize: 16, fontWeight: "600" },
```
Delete both lines.

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-variable warnings for anything removed.

- [ ] **Step 9: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "feat: move Group Settings Save to header-right, drop redundant bottom button"
```

---

### Task 5: "Delete group" → `AppButton variant="destructive"`

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:2768-2788` (after Task 4's Step 6 removal, this is the first element in that section)
- Modify: `src/screens/GroupDetailScreen.tsx:932-941` (remove now-unused styles)

Implements R4 — matches `AccountScreen`'s existing correct "Delete account"
pattern.

- [ ] **Step 1: Replace the ad-hoc `Pressable` with `AppButton`**

Current code (`GroupDetailScreen.tsx:2768-2788`):
```tsx
              <Pressable
                style={({ pressed }) => [
                  styles.deleteGroupBtn,
                  (groupDeleteBusy || groupSettingsBusy || groupExportBusy) && styles.disabled,
                  pressed &&
                    !groupDeleteBusy &&
                    !groupSettingsBusy &&
                    !groupExportBusy &&
                    styles.pressed,
                ]}
                onPress={confirmDeleteGroup}
                disabled={groupDeleteBusy || groupSettingsBusy || groupExportBusy}
                accessibilityRole="button"
                accessibilityLabel={t("groupDetail.deleteGroup")}
              >
                <Text style={styles.deleteGroupBtnText}>
                  {groupDeleteBusy
                    ? t("groupDetail.deletingGroupProgress")
                    : t("groupDetail.deleteGroup")}
                </Text>
              </Pressable>
```
Replace with:
```tsx
              <AppButton
                variant="destructive"
                fullWidth
                style={{ marginTop: 12 }}
                label={
                  groupDeleteBusy
                    ? t("groupDetail.deletingGroupProgress")
                    : t("groupDetail.deleteGroup")
                }
                onPress={confirmDeleteGroup}
                disabled={groupDeleteBusy || groupSettingsBusy || groupExportBusy}
                accessibilityLabel={t("groupDetail.deleteGroup")}
              />
```

- [ ] **Step 2: Remove the now-unused `deleteGroupBtn`/`deleteGroupBtnText` styles**

Current code (`GroupDetailScreen.tsx:932-941`):
```tsx
  deleteGroupBtn: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteGroupBtnText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.destructive,
  },
```
Delete this block.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "style: Delete group uses AppButton variant=destructive"
```

---

### Task 6: Members modal — adopt `ScreenHeader`

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:2800-2818` (Members modal header)
- Modify: `src/screens/GroupDetailScreen.tsx:975-989` (styles)

Implements R2/R6.

- [ ] **Step 1: Replace the modal header**

Current code (`GroupDetailScreen.tsx:2800-2818`):
```tsx
      <Modal
        visible={membersModalOpen}
        animationType="slide"
        onRequestClose={closeMembersModal}
      >
        <KeyboardAvoidingView
          style={styles.membersModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.membersModalHeader}>
            <Text style={styles.membersModalTitle}>
              {t("groupDetail.members")}
            </Text>
            <Pressable onPress={closeMembersModal} hitSlop={12}>
              <Text style={styles.membersModalDone}>
                {t("groupDetail.done")}
              </Text>
            </Pressable>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.membersModalScroll}
          >
```
Replace with:
```tsx
      <Modal
        visible={membersModalOpen}
        animationType="slide"
        onRequestClose={closeMembersModal}
      >
        <KeyboardAvoidingView
          style={styles.membersModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScreenHeader
            title={t("groupDetail.members")}
            onBack={closeMembersModal}
            backAccessibilityLabel={t("nav.back")}
            right={
              <AppButton
                variant="ghost"
                size="sm"
                label={t("groupDetail.done")}
                onPress={closeMembersModal}
              />
            }
          />
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.membersModalScroll}
            style={styles.membersModalBody}
          >
```

- [ ] **Step 2: Update the root/body styles**

Current code (`GroupDetailScreen.tsx:975-989`):
```tsx
  membersModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  membersModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  membersModalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  membersModalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
  membersModalScroll: { paddingBottom: 40 },
```
Replace with:
```tsx
  membersModalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  membersModalBody: {
    paddingHorizontal: 16,
  },
  membersModalScroll: { paddingBottom: 40 },
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "style: Members modal adopts shared ScreenHeader"
```

---

### Task 7: Currency modal — adopt `ScreenHeader`, add "Done"

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:3036-3049` (Currency modal header)
- Modify: `src/screens/GroupDetailScreen.tsx:942-955` (styles)

Implements R2/R6, and adds the close control the audit found missing
entirely on this modal.

- [ ] **Step 1: Replace the modal header**

Current code (`GroupDetailScreen.tsx:3036-3049`):
```tsx
      <Modal
        visible={currencyPickerOpen}
        animationType="slide"
        onRequestClose={closeCurrencyPicker}
      >
        <KeyboardAvoidingView
          style={styles.currencyModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.currencyModalHeader}>
            <Text style={styles.currencyModalTitle}>
              {t("groupDetail.currencyModalTitle")}
            </Text>
          </View>
          <TextInput
```
Replace with:
```tsx
      <Modal
        visible={currencyPickerOpen}
        animationType="slide"
        onRequestClose={closeCurrencyPicker}
      >
        <KeyboardAvoidingView
          style={styles.currencyModalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScreenHeader
            title={t("groupDetail.currencyModalTitle")}
            onBack={closeCurrencyPicker}
            backAccessibilityLabel={t("nav.back")}
            right={
              <AppButton
                variant="ghost"
                size="sm"
                label={t("groupDetail.done")}
                onPress={closeCurrencyPicker}
              />
            }
          />
          <TextInput
```
(`currencyModalRoot`'s own `paddingHorizontal: 16` is moved to a new
`currencyModalBody` style in Step 2, applied only to the `TextInput`/
`FlatList` below — not to the root. Otherwise it would stack with
`ScreenHeader`'s own internal `paddingHorizontal: 12`, over-indenting the
header's back button and "Done" button relative to every other
`ScreenHeader` usage in the app.)

- [ ] **Step 2: Update the root/header styles, extracting body padding**

Current code (`GroupDetailScreen.tsx:942-955`):
```tsx
  currencyModalRoot: {
    flex: 1,
    paddingTop: 56,
    paddingHorizontal: 16,
    backgroundColor: colors.bg,
  },
  currencyModalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  currencyModalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  currencyModalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
```
Replace with:
```tsx
  currencyModalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  currencyModalBody: {
    flex: 1,
    paddingHorizontal: 16,
  },
```

- [ ] **Step 3: Wrap the search input and list in the new body style**

The `TextInput` and `FlatList` that follow the header (previously relying
on `currencyModalRoot`'s padding) need their own padded wrapper. Current
code, immediately after the `ScreenHeader` from Step 1:
```tsx
          <TextInput
            style={styles.groupTextInput}
            value={currencySearch}
            onChangeText={setCurrencySearch}
            placeholder={t("groupDetail.currencySearchPlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <FlatList
            style={styles.currencyFlatList}
            data={filteredCurrencies}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.currencyRow,
                  item.code === groupCurrencyDraft && styles.currencyRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  setGroupCurrencyDraft(item.code);
                  closeCurrencyPicker();
                }}
              >
                <Text style={styles.currencyRowCode}>{item.code}</Text>
                <Text style={styles.currencyRowLabel}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.currencyEmpty}>
                {t("groupDetail.currencyEmpty")}
              </Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>
```
Wrap the `TextInput` and `FlatList` (but not the closing
`KeyboardAvoidingView`/`Modal` tags) in a `<View style={styles.currencyModalBody}>`:
```tsx
          <View style={styles.currencyModalBody}>
            <TextInput
              style={styles.groupTextInput}
              value={currencySearch}
              onChangeText={setCurrencySearch}
              placeholder={t("groupDetail.currencySearchPlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <FlatList
              style={styles.currencyFlatList}
              data={filteredCurrencies}
              keyExtractor={(item) => item.code}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [
                    styles.currencyRow,
                    item.code === groupCurrencyDraft && styles.currencyRowSelected,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setGroupCurrencyDraft(item.code);
                    closeCurrencyPicker();
                  }}
                >
                  <Text style={styles.currencyRowCode}>{item.code}</Text>
                  <Text style={styles.currencyRowLabel}>{item.label}</Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.currencyEmpty}>
                  {t("groupDetail.currencyEmpty")}
                </Text>
              }
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused `currencyModalDone` reference warnings (it
was already unused before this task — see the audit finding — and is now
fully removed).

- [ ] **Step 5: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "style: Currency picker modal adopts shared ScreenHeader with Done"
```

---

### Task 8: Member remove / friend add — raw glyphs to `Ionicons`

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:2854-2858` (member remove "−")
- Modify: `src/screens/GroupDetailScreen.tsx:2916-2918` (friend add "+")

Implements R3's icon-affordance half (C5) — matches the `Ionicons
name="close"/"add"/"remove"` convention already used for equivalent
affordances in `AddExpenseScreen`, `AiReceiptScreen`, `NotificationsScreen`.

- [ ] **Step 1: Replace the member-remove glyph**

Current code (`GroupDetailScreen.tsx:2854-2858`):
```tsx
                        <Text style={styles.memberMinusBtnText}>
                          {removing
                            ? t("groupDetail.expenseDeleteBusy")
                            : "−"}
                        </Text>
```
Replace with:
```tsx
                        {removing ? (
                          <Text style={styles.memberMinusBtnText}>
                            {t("groupDetail.expenseDeleteBusy")}
                          </Text>
                        ) : (
                          <Ionicons
                            name="remove"
                            size={18}
                            color={styles.memberMinusBtnText.color}
                          />
                        )}
```

- [ ] **Step 2: Replace the friend-add glyph**

Current code (`GroupDetailScreen.tsx:2916-2918`):
```tsx
                        <Text style={styles.friendAddBtnText}>
                          {adding ? t("groupDetail.expenseDeleteBusy") : "+"}
                        </Text>
```
Replace with:
```tsx
                        {adding ? (
                          <Text style={styles.friendAddBtnText}>
                            {t("groupDetail.expenseDeleteBusy")}
                          </Text>
                        ) : (
                          <Ionicons
                            name="add"
                            size={18}
                            color={styles.friendAddBtnText.color}
                          />
                        )}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors. (`styles.memberMinusBtnText.color` /
`styles.friendAddBtnText.color` must resolve to a string at the type level
— if TypeScript flags this because `StyleSheet.create` output isn't
narrowed, read the color from `colors.text`/`colors.primary` directly
instead, matching whatever `memberMinusBtnText`/`friendAddBtnText` already
use for `color` in the stylesheet, e.g. `color={colors.text}`.)

- [ ] **Step 4: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "style: member remove / friend add use Ionicons instead of text glyphs"
```

---

### Task 9: Fix settlement arrow RTL flag

**Files:**
- Modify: `src/screens/GroupDetailScreen.tsx:1706`

Implements R7. `I18nManager.isRTL` doesn't reflect the app's selected
locale on web (`applyLayoutDirection` in `src/i18n/LocaleContext.tsx`
only calls `I18nManager.forceRTL` on native), and can lag the app's own
`isRTL` on native for a window after a language switch until the native
reload completes. Every other RTL-sensitive value in this file already uses
the locally-scoped `isRTL` from `useLocale()` (destructured at line 1013).

- [ ] **Step 1: Use the local `isRTL`**

Current code (`GroupDetailScreen.tsx:1706`):
```tsx
  const settlementArrowName = I18nManager.isRTL ? "arrow-back" : "arrow-forward";
```
Replace with:
```tsx
  const settlementArrowName = isRTL ? "arrow-back" : "arrow-forward";
```

- [ ] **Step 2: Remove the now-unused `I18nManager` import if nothing else in the file uses it**

Run: `grep -n "I18nManager" src/screens/GroupDetailScreen.tsx`
If the only remaining match is the `import { ... I18nManager ... } from "react-native"` line itself, remove `I18nManager` from that import list. If anything else in the file still references it, leave the import as-is.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-import warnings.

- [ ] **Step 4: Commit**

```bash
git add src/screens/GroupDetailScreen.tsx
git commit -m "fix: settlement arrow direction uses app locale, not device RTL flag"
```

---

### Task 10: Manual verification pass

No further code changes. This task confirms the fixes actually work in the
running app, since this repo has no screen-level UI test suite (only
`src/core/*.test.ts` logic tests, unaffected by this plan).

- [ ] **Step 1: Run the full automated check one more time**

Run: `npm run lint && npx tsc --noEmit && npm test`
Expected: all pass (the existing `src/core/*.test.ts` suite is unrelated to
this screen and should be unaffected — this just confirms nothing else
broke).

- [ ] **Step 2: Launch the app and manually verify each fix**

Use the `run` skill (or `npm run ios` / `npm run android` / `npm run web`
directly) to launch the app, sign in or use locally, and open any group's
detail screen. Verify:

1. Tap the group name to open Group Settings → header shows a back chevron
   (left) and a "Save" button (right) — no bottom "Save changes" button, no
   "Done" text link.
2. Edit the group name → "Save" becomes enabled → tap it → modal closes and
   the new name is reflected on the Group Detail screen.
3. Open Group Settings again, tap the Currency field → the currency picker
   opens and is immediately responsive (rows are tappable) → pick a
   currency → you land back on Group Settings with the new currency shown
   and "Save" enabled.
4. Open Group Settings, tap the Currency field, then tap the header
   chevron (not a currency row) → you return to Group Settings with the
   currency unchanged.
5. Open Group Settings, change the name, then tap the header chevron
   (discard) → reopen Group Settings → the name reverts to the saved value
   (drafts no longer persist a discarded edit).
6. Tap "Manage members" → the header shows a back chevron (left) and
   "Done" (right) → tap "Open Group Share" → the Group Share sheet appears
   immediately, without needing to close the Members modal first.
7. In Group Settings, "Delete group" renders as a full-width red/destructive
   button matching Account screen's "Delete account" button style.
8. In "Manage members," the remove ("−") and add ("+") buttons show
   `Ionicons` icons, not raw glyph characters.
9. If convenient, switch the app to Farsi (Settings → Language) and check a
   group with settlements — the settlement arrow points in the direction
   consistent with the rest of the RTL-mirrored row.

- [ ] **Step 3: Report results**

If every item in Step 2 checks out, this plan is complete — move to
`superpowers:finishing-a-development-branch` to decide how to integrate
`implement/consistency-group-detail` into `main`. If anything fails, note
which numbered item and the observed behavior, and fix before finishing.
