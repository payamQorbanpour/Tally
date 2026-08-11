# QR Scanner Cancel Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the QR scanner's permission-loading state the same header-with-✕ that its other two states already have, so a stalled permission request can never trap the user on a spinner.

**Architecture:** `src/screens/QrScanScreen.tsx` renders three mutually exclusive states from one component. Two of them paste an identical header block; the third has none. Build that header once as a local element, reference it from all three, and give the loading state a centered spinner plus an explanatory caption. The caption needs one new key in the app's typed translation tree.

**Tech Stack:** React Native 0.81 / Expo SDK 54, TypeScript, `expo-camera`, `react-native-safe-area-context`, `@expo/vector-icons` (Ionicons). Tests run under Vitest in a Node environment.

**Spec:** `docs/superpowers/specs/2026-08-11-qr-scanner-cancel-button-design.md`

## Global Constraints

- Work on branch `feat/qr-scanner-cancel-button` (already created, already holds the spec commit).
- Exactly two files may change: `src/screens/QrScanScreen.tsx` and `src/i18n/translations.ts`. Touching anything else means the plan was misread.
- Do **not** modify `AccountScreen.tsx`, `pickProfileAvatar.ts`, or `AiReceiptScreen.tsx`. Their cameras are the OS camera by design and already have a native cancel.
- Do **not** remove the unused `qrScan.scanning` / `qrScan.holdSteady` keys. They are out of scope.
- Do **not** change the permission logic: the `askedRef` / `requestSettled` effect at `QrScanScreen.tsx:56-81` and the gate condition itself stay byte-identical. This change is additive UI only.
- The `es` value must be a real Spanish translation, not an English copy. Spanish is soft-disabled in the picker (`SettingsScreen.tsx:222-232`) but still serves existing users and the remote-override path.
- **No new test files.** See "A note on TDD" below.

## A note on TDD

This plan deviates from the usual write-a-failing-test-first cycle, deliberately and with the spec's sign-off.

`vitest.config.ts` sets `environment: "node"` and every test in the repo is pure logic (`src/core/*.test.ts`, `src/premium/*.test.ts`). There is no React renderer, no `@testing-library/react-native`, no jsdom. Standing up component-test infrastructure to assert one button is not justified by this change, and the one non-visual behavior worth guarding — that the new key exists in all three locales — is already enforced at compile time, because `en`, `fa`, and `es` are each declared `: MessageTree`.

So Task 1 uses **the type checker as its failing test**: add the key to the type, watch `tsc` fail with three errors, add the three values, watch it pass. That is a genuine red/green cycle. Tasks 2 and 3 are visual changes verified by `tsc`, `eslint`, the existing suite staying green, and a manual pass.

## File Structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/i18n/translations.ts` | Modify (4 blocks) | Declares `qrScan.requestingAccess` in `MessageTree` and supplies `en` / `fa` / `es` values. |
| `src/screens/QrScanScreen.tsx` | Modify | Owns all three scanner render states, the shared header element, and `buildStyles`. |

No files are created. No file is large enough or tangled enough to warrant splitting as part of this work.

---

### Task 1: Add the `requestingAccess` translation key

**Files:**
- Modify: `src/i18n/translations.ts:1066-1089` (the `MessageTree` type's `qrScan` block)
- Modify: `src/i18n/translations.ts:2171-2192` (`en`)
- Modify: `src/i18n/translations.ts:3245-3266` (`fa`)
- Modify: `src/i18n/translations.ts:4322-4343` (`es`)
- Test: none — `tsc` is the test, see above

**Interfaces:**
- Consumes: nothing.
- Produces: the translation key `qrScan.requestingAccess`, readable as `t("qrScan.requestingAccess")` and typed `string`. Task 3 renders it.

Line numbers are as of commit `709ac1f`. Each edit below is given as an exact anchor string, because line numbers shift as you apply them and because `cancel: "Cancel",` alone appears in many unrelated blocks — always match the two-line `title` + `cancel` pair shown.

- [ ] **Step 1: Add the key to the type only (this is the failing test)**

In `src/i18n/translations.ts`, find this exact three-line sequence in the `MessageTree` type:

```typescript
  qrScan: {
    title: string;
    cancel: string;
```

Replace it with:

```typescript
  qrScan: {
    title: string;
    cancel: string;
    /** Caption under the spinner while the OS camera prompt is in flight. */
    requestingAccess: string;
```

- [ ] **Step 2: Run the type checker to verify it fails**

Run: `npx tsc --noEmit 2>&1 | grep -E "translations\.ts"`

Expected: FAIL, with three errors — one each for the `en`, `fa`, and `es` object literals — reading roughly `Property 'requestingAccess' is missing in type ... but required in type 'MessageTree'`. Three errors, not one or two, confirms all three locales are genuinely type-guarded.

- [ ] **Step 3: Add the English value**

Find:

```typescript
    title: "Scan QR Code",
    cancel: "Cancel",
```

Replace with:

```typescript
    title: "Scan QR Code",
    cancel: "Cancel",
    requestingAccess: "Requesting camera access…",
```

- [ ] **Step 4: Add the Farsi value**

Find:

```typescript
    title: "اسکن کد QR",
    cancel: "لغو",
```

Replace with:

```typescript
    title: "اسکن کد QR",
    cancel: "لغو",
    requestingAccess: "درخواست دسترسی به دوربین…",
```

- [ ] **Step 5: Add the Spanish value**

Find:

```typescript
    title: "Escanear código QR",
    cancel: "Cancelar",
```

Replace with:

```typescript
    title: "Escanear código QR",
    cancel: "Cancelar",
    requestingAccess: "Solicitando acceso a la cámara…",
```

- [ ] **Step 6: Run the type checker to verify it passes**

Run: `npx tsc --noEmit 2>&1 | grep -E "translations\.ts"`

Expected: PASS — no output at all. The repo has known pre-existing type errors in other files, so grep to `translations.ts` rather than reading the whole output.

- [ ] **Step 7: Lint and test**

Run: `npx eslint src/i18n/translations.ts && npm test`

Expected: eslint clean; the Vitest suite green, including `src/i18n/localeDefaults.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add src/i18n/translations.ts
git commit -m "i18n: add qrScan.requestingAccess in en/fa/es"
```

---

### Task 2: Extract the duplicated header into one shared element

**Files:**
- Modify: `src/screens/QrScanScreen.tsx` — insert after the `onPasteLink` callback (ends `:157`), then replace the header blocks at `:187-206` and `:264-283`
- Test: none — behavior-preserving refactor, verified by `tsc` / `eslint` / manual

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: a local `const header` (a `JSX.Element`) in the `QrScanScreen` function body, rendering the ✕ `Pressable` and the title. Task 3 renders `{header}` in the loading branch.

This task changes no pixels. The two branches that already show a header must look and behave exactly as before; only the source of their JSX moves.

- [ ] **Step 1: Build the shared element**

In `src/screens/QrScanScreen.tsx`, insert the following immediately after the closing `}, [onScanned, t]);` of `onPasteLink` and before the `// First-render permission gate.` comment block. It must sit above the early returns, and below every hook call.

```tsx
  // Shared by all three render states below. Built once rather than pasted
  // into each branch: the loading state needs the same escape hatch the other
  // two already have, and a third copy would be a third place to forget it.
  // Only one branch renders per commit, so reusing the element is safe.
  const header = (
    <View
      style={[styles.headerBar, { paddingTop: insets.top + 12 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={() => navigation.goBack()}
        style={({ pressed }) => [
          styles.headerCloseBtn,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={t("qrScan.cancel")}
        hitSlop={10}
      >
        <Ionicons name="close" size={20} color="#fff" />
      </Pressable>
      <Text style={styles.headerTitle}>{t("qrScan.title")}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
```

- [ ] **Step 2: Use it in the permission-denied branch**

Inside `if (!permission.granted) {`, find this block (the comment line plus the whole `<View style={[styles.headerBar, ...]}>` element) and delete it, replacing all of it with the single line `{header}`:

```tsx
        {/* Translucent header with close button */}
        <View
          style={[styles.headerBar, { paddingTop: insets.top + 12 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [
              styles.headerCloseBtn,
              pressed && styles.pressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={t("qrScan.cancel")}
            hitSlop={10}
          >
            <Ionicons name="close" size={20} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitle}>{t("qrScan.title")}</Text>
          <View style={styles.headerSpacer} />
        </View>
```

becomes:

```tsx
        {header}
```

- [ ] **Step 3: Use it in the camera-live branch**

In the final `return`, find the equivalent block — it differs only in its comment and indentation — and replace it the same way. Keep it in its current position, directly after `<CameraView … />` and before the viewfinder comment, so paint order is unchanged:

```tsx
      {/* Top translucent header with close (✕) button */}
      <View
        style={[styles.headerBar, { paddingTop: insets.top + 12 }]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.headerCloseBtn,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("qrScan.cancel")}
          hitSlop={10}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
        <Text style={styles.headerTitle}>{t("qrScan.title")}</Text>
        <View style={styles.headerSpacer} />
      </View>
```

becomes:

```tsx
      {header}
```

- [ ] **Step 4: Verify nothing broke**

Run: `npx tsc --noEmit 2>&1 | grep -E "QrScanScreen\.tsx"; npx eslint src/screens/QrScanScreen.tsx; npm test`

Expected: no `QrScanScreen.tsx` type errors, eslint clean, suite green. In particular eslint must not report `Ionicons`, `Pressable`, or `Text` as unused — all three are still referenced by the shared element and elsewhere in the file.

- [ ] **Step 5: Confirm visually that nothing changed**

Run the app (`npm start`, then open on a device or simulator) and open the QR scanner from the group-invite flow. The header must look identical to before this task: ✕ on the leading side, "Scan QR Code" centered, tapping ✕ dismisses. Check the denied state too by revoking camera permission in OS settings.

- [ ] **Step 6: Commit**

```bash
git add src/screens/QrScanScreen.tsx
git commit -m "refactor(qr-scan): hoist duplicated header into one element"
```

---

### Task 3: Give the loading state the header and a caption

**Files:**
- Modify: `src/screens/QrScanScreen.tsx:171-177` (the permission gate's early return) and the `permissionRoot` entry in `buildStyles` (`:601-607`)
- Test: none — see "A note on TDD"

**Interfaces:**
- Consumes: `const header` from Task 2; `t("qrScan.requestingAccess")` from Task 1.
- Produces: nothing consumed downstream. This is the last task.

- [ ] **Step 1: Rewrite the early return**

Find this block — leave the `if` condition itself exactly as it is, and leave the long `// First-render permission gate.` comment above it in place:

```tsx
  if (!permission || (permission.status === "undetermined" && !requestSettled)) {
    return (
      <View style={[styles.permissionRoot, { paddingTop: insets.top + 20 }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
```

Replace with:

```tsx
  if (!permission || (permission.status === "undetermined" && !requestSettled)) {
    return (
      <View style={styles.darkRoot}>
        <View style={styles.gradientLayer} />
        {header}
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.caption}>{t("qrScan.requestingAccess")}</Text>
        </View>
      </View>
    );
  }
```

- [ ] **Step 2: Swap the now-dead style for the new one**

At the bottom of `buildStyles`, find:

```tsx
    /* ── Loading shell shown before permission state resolves ────── */
    permissionRoot: {
      flex: 1,
      backgroundColor: "#061E1E",
      paddingHorizontal: 24,
      alignItems: "center",
    },
```

Replace with:

```tsx
    /* ── Loading shell shown before permission state resolves ────── */
    loadingWrap: {
      ...StyleSheet.absoluteFillObject,
      alignItems: "center",
      justifyContent: "center",
    },
```

`permissionRoot` had exactly one consumer — the return you just rewrote — so it is dead now and must go rather than linger. The `caption` style already carries the right size, color, `marginTop`, and `paddingHorizontal`, so it needs no changes.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -E "QrScanScreen\.tsx"; npx eslint src/screens/QrScanScreen.tsx; npm test`

Expected: no `QrScanScreen.tsx` type errors, eslint clean, suite green. If eslint flags `insets` as unused, something went wrong — it is still needed by `header` and by `bottomHintWrap`.

- [ ] **Step 4: Verify the actual fix on a device**

This is the step that proves the bug is gone, so do not skip it. On a build that has never been granted camera permission (fresh install, or reset via OS settings), open the QR scanner and watch the moment before the system dialog appears:

1. The ✕ and "Scan QR Code" title are visible at the top.
2. "Requesting camera access…" sits under the spinner, centered.
3. The system dialog is modal on both platforms, so our ✕ is never tappable while it is on screen — do not try. Instead verify the stall case, which is what this branch actually fixes: background the app while the dialog is still up, then return to it. The permission request has not settled and `askedRef.current` is already latched, so the app should still be showing this loading branch (✕, title, spinner); confirm tapping ✕ dismisses the scanner and returns to the previous screen without a crash or a stuck overlay.
4. Repeat with the app language set to Farsi and confirm the caption reads `درخواست دسترسی به دوربین…` and the header mirrors to RTL.

- [ ] **Step 5: Commit**

```bash
git add src/screens/QrScanScreen.tsx
git commit -m "fix(qr-scan): add cancel button to permission-loading state"
```

---

## Self-Review

**Spec coverage.** Every section of the spec maps to a task: "Share the header instead of copying it" → Task 2; "Rewrite the loading branch" and the `loadingWrap` / `permissionRoot` style changes → Task 3; "New translation key" including the `es` rationale → Task 1; the Testing section → the verification steps in all three tasks plus the manual passes in Tasks 2 and 3. The spec's "Explicitly not doing" list is carried into Global Constraints. The spec's "Behavior and edge cases" notes are enforced by the constraint that the permission effect stays byte-identical, and edge case 4 (the pre-dialog window and the stall case) is checked in Task 3 Step 4.

**Placeholders.** None. Every code step carries the literal text to insert or replace, every run step carries the exact command and expected result.

**Type consistency.** One symbol crosses task boundaries — `header`, produced in Task 2 Step 1 and consumed in Task 3 Step 1 — spelled identically in both. The translation key is `qrScan.requestingAccess` in Task 1 Steps 1, 3, 4, 5 and in Task 3 Step 1. The new style is `loadingWrap` in both places it appears in Task 3.
