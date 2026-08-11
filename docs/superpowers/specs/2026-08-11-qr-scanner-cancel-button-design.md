# QR Scanner: cancel button on the permission-loading state

**Date:** 2026-08-11
**Status:** Approved, ready for planning

## Problem

The request was "the camera page should have a cross button at top to cancel
it," scoped during brainstorming to every camera surface in the app. Auditing
those surfaces showed only one real gap.

| Surface | What opens | In-app cancel today |
| --- | --- | --- |
| QR scan (`src/screens/QrScanScreen.tsx`) | Our own `expo-camera` `CameraView` | ✕ in header, in two of three render states |
| Profile photo (`AccountScreen.tsx:1066` → `pickProfileAvatar.ts:78`) | OS camera via `ImagePicker.launchCameraAsync` | None — OS supplies its own |
| AI receipt photo (`AiReceiptScreen.tsx:2112`) | OS camera via `ImagePicker.launchCameraAsync` | None — OS supplies its own |

The two `launchCameraAsync` call sites hand control to the platform: iOS shows
`UIImagePickerController`, Android launches the device camera app, and web falls
back to `<input type="file" capture>` (see
`node_modules/expo-image-picker/build/ExponentImagePicker.web.js`). None of those
surfaces accept our chrome, and each already provides a native cancel. Replacing
them with a custom capture screen was considered and **explicitly rejected** as
out of scope: the cost is a new screen plus two rewired flows plus the loss of
the native square-crop editor, in exchange for cosmetic consistency.

That leaves `QrScanScreen`, which renders three states:

- `:171` — permission request in flight. A bare `ActivityIndicator` on a dark
  background. **No header, no ✕, no escape.**
- `:179` — permission denied. Header with ✕, plus Grant/Settings and paste-link
  routes.
- `:254` — camera live. Header with ✕, viewfinder, paste-link hint.

The comment at `:159-170` treats the first state as transient and says the user
will be "released to the panel." That holds only if `requestPermission()`
settles. If it never does — app backgrounded mid-prompt, or a rejection that
leaves `permission.status` at `undetermined` — `askedRef.current` has already
latched `true`, so no retry fires and the user sits on a spinner with no way
back.

## Scope

Two files:

- `src/screens/QrScanScreen.tsx`
- `src/i18n/translations.ts`

The OS-camera flows are deliberately untouched.

## Design

### Share the header instead of copying it

The header JSX is byte-identical at `:188-206` and `:265-283`. Build it once in
the component body as an element and reference it from all three returns:

```tsx
const header = (
  <View
    style={[styles.headerBar, { paddingTop: insets.top + 12 }]}
    pointerEvents="box-none"
  >
    <Pressable
      onPress={() => navigation.goBack()}
      style={({ pressed }) => [styles.headerCloseBtn, pressed && styles.pressed]}
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

Everything it needs (`styles`, `insets`, `t`, `navigation`) is already in scope,
so this costs no prop plumbing. It must be declared above the early returns.
Only one branch renders per commit, so reusing the element object is safe.

A module-level `ScanHeader({ styles, insets, title, label, onClose })` was the
alternative. It buys isolated testability the repo cannot currently exercise
(see Testing) in exchange for five props, so it was not chosen.

### Rewrite the loading branch

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

Style changes in `buildStyles`:

- **Add** `loadingWrap`: `...StyleSheet.absoluteFillObject`, `alignItems:
  "center"`, `justifyContent: "center"`.
- **Delete** `permissionRoot`. This branch is its only consumer, so it becomes
  dead once rewritten.
- Reuse the existing `caption` style unchanged.

### New translation key

Add `requestingAccess: string` to the `qrScan` block of the `MessageTree` type,
then a value in each locale:

| Locale | Value |
| --- | --- |
| `en` | `Requesting camera access…` |
| `fa` | `درخواست دسترسی به دوربین…` |
| `es` | `Solicitando acceso a la cámara…` |

`en`, `fa`, and `es` are each declared `: MessageTree` (`translations.ts:1313`,
`:2386`, `:3460`), so the compiler rejects the build until all three exist. That
is the parity guard; no runtime test is needed for it.

Spanish is soft-disabled in the language picker (`SettingsScreen.tsx:222-232`),
but its `MessageTree` stays intact and still serves users already on `es` plus
the remote-override path, so the `es` string is required and must be a real
translation rather than an English copy.

Out of scope but noted: `qrScan.scanning` and `qrScan.holdSteady` are translated
in all three locales and referenced nowhere. Leave them alone — removing them is
unrelated to this change.

## Behavior and edge cases

- **Permission logic is untouched.** The `askedRef` / `requestSettled` effect at
  `:56-81` and the gate condition itself are unchanged. This is purely additive
  UI; nothing about when the OS prompt fires moves.
- **Dismissal** uses `navigation.goBack()`, matching the other two branches
  exactly.
- **RTL** needs no handling. `headerBar` is a plain `flexDirection: "row"` that
  React Native mirrors automatically under `I18nManager`, as it already does in
  the two shipping branches. The shared element inherits that behavior.
- **Tapping ✕ while the OS dialog is up** dismisses our screen; the user answers
  the system prompt and lands on the previous screen. The in-flight
  `requestPermission()` promise then resolves into an unmounted component, which
  the existing `try`/`catch`/`finally` at `:71-80` already absorbs.

## Testing

No component-render infrastructure exists. `vitest.config.ts` sets
`environment: "node"` and every test in the suite is pure logic
(`src/core/*.test.ts`, `src/premium/*.test.ts`, and similar). Introducing React
Testing Library to assert one button is not justified by this change, and a test
asserting the new key exists across locales would only restate what `tsc`
enforces.

Verification is therefore:

1. `npx tsc --noEmit`, then filter the output to the two changed files. There is
   no `typecheck` script in `package.json`, and the repo carries known
   pre-existing type errors elsewhere; the check is that this change adds none
   of its own.
2. `npx eslint src/screens/QrScanScreen.tsx src/i18n/translations.ts`
   (`npm run lint` runs `expo lint` across the whole repo, which is noisier than
   needed here).
3. `npm test` — the suite must stay green. No new tests are added.
4. Manual: on a fresh install, open the QR scanner and confirm the ✕ is visible
   and tappable while the system permission dialog is up, and that tapping it
   returns to the previous screen.

## Explicitly not doing

- Building a shared in-app `CameraCaptureScreen` to replace `launchCameraAsync`.
- Any change to `AccountScreen`, `pickProfileAvatar`, or `AiReceiptScreen`.
- Removing the dead `qrScan.scanning` / `qrScan.holdSteady` keys.
