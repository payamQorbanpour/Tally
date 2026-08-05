# Disable Spanish Locale (Soft) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Spanish unreachable from the language picker and from device auto-detection, without deleting any Spanish infrastructure — reversible later with no rebuilding.

**Architecture:** Two independent edits: (1) remove the `es` entry from `SettingsScreen.tsx`'s language picker array, and (2) remove the `es` branch from `appLocaleForLanguage` and the `ES` region entry from `APP_LOCALE_BY_REGION` in `src/i18n/localeDefaults.ts`, so `resolveAppLocale` falls through to the bundled/remote default instead of resolving to `"es"`. `AppLocale`'s `"es"` member, `translations.ts`'s `es` object, `SHIPPED_LOCALES`, and the remote `locale_default`/`locale_region_map` override paths are all explicitly untouched — an operator can still push a remote `locale_default: "es"` override if ever needed, and existing `es` users keep rendering correctly.

**Tech Stack:** TypeScript, React Native, Vitest.

## Global Constraints

- **Soft disable only** — this plan never touches `AppLocale`'s `"es"` member (`src/i18n/translations.ts:1`), the `es` object in `translations.ts`, `src/sync/profilePrefsSync.ts`'s `VALID_LOCALES`, `SHIPPED_LOCALES` (`src/i18n/localeDefaults.ts:58`), or any per-screen locale map in `GroupsScreen.tsx`/`ActivityScreen.tsx`.
- Existing `es` users are unaffected: their persisted `locale` setting still resolves and renders.
- This is explicitly a build-time code change, not a remote-config toggle — no `app_config` key is added for it.

---

### Task 1: Remove Spanish from the language picker

**Files:**
- Modify: `src/screens/SettingsScreen.tsx:216-223`

**Interfaces:** none — this is a local `useMemo` array literal with no other consumers.

No new unit test — this screen has no existing test file (no `.test.ts` file exists under `src/screens/`; nothing in this codebase renders screen components in tests). Verify by reading the diff and running the full suite so nothing else regresses.

- [ ] **Step 1: Remove the `es` entry**

In `src/screens/SettingsScreen.tsx`, change:

```tsx
  const languageOptions: { code: AppLocale; label: string }[] = useMemo(
    () => [
      { code: "en", label: t("account.languageEnglish") },
      { code: "fa", label: t("account.languageFarsi") },
      { code: "es", label: t("account.languageSpanish") },
    ],
    [t],
  );
```

to:

```tsx
  const languageOptions: { code: AppLocale; label: string }[] = useMemo(
    () => [
      { code: "en", label: t("account.languageEnglish") },
      { code: "fa", label: t("account.languageFarsi") },
    ],
    [t],
  );
```

The `account.languageSpanish` translation key is left in place in `translations.ts` (all three locales) — only the picker option disappears, per the design doc's soft-disable scope.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the array element type `{ code: AppLocale; label: string }` still accepts a 2-element array).

- [ ] **Step 3: Commit**

```bash
git add src/screens/SettingsScreen.tsx
git commit -m "fix(i18n): remove Spanish from the language picker"
```

---

### Task 2: Remove Spanish from device auto-detection, and update its test coverage

**Files:**
- Modify: `src/i18n/localeDefaults.ts:26-31,40-45`
- Test: `src/i18n/localeDefaults.test.ts` (full-file rewrite of affected assertions)

**Interfaces:**
- Produces: `resolveAppLocale` (`src/i18n/localeDefaults.ts:93-112`, unchanged signature) now never returns `"es"` from a device's language or region alone — only from an explicit remote `locale_default`/`locale_region_map` override, which is untouched.

**Important — spec/code discrepancy found during planning:** the design doc says to remove "the `es`/`ca` branch from `appLocaleForLanguage`". The actual function only has an `es` branch — there is no `ca` (Catalan) branch in the code today (confirmed by reading the full file). Step 1 below removes only the `es` branch; there is nothing else to remove.

**Important — existing test breakage found during planning:** `src/i18n/localeDefaults.test.ts` currently has 9 assertions across 6 `it` blocks that assert `resolveAppLocale(...)` returns `"es"` for various es-language or ES-region device inputs. After Step 3's implementation change, every one of those device-driven paths returns `"en"` (or, in one case, falls through to the next preferred shipped language). These tests must be rewritten to the new expected behavior — the design doc's "no new unit tests needed" line undersells this: existing tests need updating, not just running, or the suite will fail red after Step 3. This task follows TDD in the correct order for a behavior change to an existing function: update the test file's expectations first (Step 1), confirm they fail against the current implementation (Step 2), then change the implementation (Step 3) and confirm green (Step 4).

- [ ] **Step 1: Rewrite the test file's expectations**

Replace the full contents of `src/i18n/localeDefaults.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import { resolveAppLocale, type DeviceLocale } from "./localeDefaults";

const phone = (
  languageCode: string | null,
  languageTag: string | null,
  regionCode: string | null,
): DeviceLocale => ({ languageCode, languageTag, regionCode });

describe("resolveAppLocale", () => {
  it("keeps a supported phone language regardless of where the user is", () => {
    expect(resolveAppLocale([phone("fa", "fa-IR", "IR")])).toBe("fa");
    expect(resolveAppLocale([phone("fa", "fa-IR", "ES")])).toBe("fa");
  });

  it("falls back to region when the phone language is not one we ship", () => {
    expect(resolveAppLocale([phone("en", "en-US", "IR")])).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-US", "AF")])).toBe("fa");
    expect(resolveAppLocale([phone("ur", "ur-PK", "PK")])).toBe("fa");
  });

  it("defaults to English for Europe and the Americas", () => {
    expect(resolveAppLocale([phone("de", "de-DE", "DE")])).toBe("en");
    expect(resolveAppLocale([phone("fr", "fr-FR", "FR")])).toBe("en");
    expect(resolveAppLocale([phone("en", "en-US", "US")])).toBe("en");
    expect(resolveAppLocale([phone("en", "en-CA", "CA")])).toBe("en");
  });

  it("honours the order of the OS preference list", () => {
    expect(
      resolveAppLocale([phone("de", "de-DE", "DE"), phone("fa", "fa-IR", "DE")]),
    ).toBe("fa");
    expect(
      resolveAppLocale([phone("fa", "fa-IR", "DE"), phone("de", "de-DE", "DE")]),
    ).toBe("fa");
  });

  it("reads the region from the language tag when regionCode is absent", () => {
    expect(resolveAppLocale([phone("en", "en-IR", null)])).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-AF", null)])).toBe("fa");
  });

  it("normalises casing and ignores script subtags", () => {
    expect(resolveAppLocale([phone("EN", "en-US", "ir")])).toBe("fa");
    expect(resolveAppLocale([phone("FA", "FA-ir", null)])).toBe("fa");
    expect(resolveAppLocale([phone("zh", "zh-Hant-TW", "TW")])).toBe("en");
  });

  it("degrades to English on empty or malformed input", () => {
    expect(resolveAppLocale([])).toBe("en");
    expect(resolveAppLocale([phone(null, null, null)])).toBe("en");
    expect(resolveAppLocale([phone("", "", "")])).toBe("en");
  });
});

describe("Spanish is disabled: no longer resolved from device signals", () => {
  it("falls through an es-language phone to the next shipped preference, or the default", () => {
    expect(resolveAppLocale([phone("es", "es-ES", "ES")])).toBe("en");
    expect(resolveAppLocale([phone("es", "es-MX", "MX")])).toBe("en");
    expect(
      resolveAppLocale([phone("es", "es-ES", "DE"), phone("fa", "fa-IR", "DE")]),
    ).toBe("fa"); // es no longer intercepts the language loop; fa (next preference) wins
  });

  it("falls through an ES-region device to the default, since the bundled region map no longer includes ES", () => {
    expect(resolveAppLocale([phone("ca", "ca-ES", "ES")])).toBe("en");
    expect(resolveAppLocale([phone("en", "en-GB", "ES")])).toBe("en");
    expect(resolveAppLocale([phone(null, "en-ES", null)])).toBe("en");
  });
});

describe("resolveAppLocale with remote overrides", () => {
  const en = [{ languageCode: "en", languageTag: "en-US", regionCode: "US" }];
  const enInTurkey = [{ languageCode: "en", languageTag: "en-TR", regionCode: "TR" }];
  const farsiPhone = [{ languageCode: "fa", languageTag: "fa-IR", regionCode: "IR" }];

  it("uses a remote region map to reach a region the bundle does not know", () => {
    expect(resolveAppLocale(enInTurkey)).toBe("en"); // bundled: TR is unmapped
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "fa" } })).toBe("fa");
  });

  it("merges the remote region map over the bundled one rather than replacing it", () => {
    // An operator adding a single region must not silently drop the bundled
    // ones. Losing IR -> fa would break first-run Farsi for Iran, which is
    // the exact case this remote-config system was built in-house for.
    const onlyTurkey = { regionMap: { TR: "fa" } };
    expect(resolveAppLocale(enInTurkey, onlyTurkey)).toBe("fa"); // the added region
    expect(resolveAppLocale([phone("en", "en-US", "IR")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "AF")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "PK")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-GB", "ES")], onlyTurkey)).toBe("en"); // ES is no longer bundled now that Spanish is disabled
    expect(resolveAppLocale([phone("en", "en-US", "US")], onlyTurkey)).toBe("en"); // unmapped
  });

  it("lets a remote entry override a bundled region for that region only", () => {
    const overrideIran = { regionMap: { IR: "en" } };
    expect(resolveAppLocale([phone("de", "de-DE", "IR")], overrideIran)).toBe("en");
    expect(resolveAppLocale([phone("de", "de-DE", "AF")], overrideIran)).toBe("fa"); // untouched
  });

  it("uses a remote fallback when neither language nor region matches", () => {
    // Deliberately still reachable: disabling Spanish removed it from the
    // picker and from device-driven detection only, not from AppLocale or
    // the remote-config fallback path (see the Farsi/RTL Batch A design doc).
    expect(resolveAppLocale(en, { fallback: "es" })).toBe("es");
  });

  it("never lets a remote value override an explicit device language", () => {
    // A Farsi phone stays Farsi no matter what the server says. Language is
    // the strongest preference a user expresses without opening settings.
    expect(resolveAppLocale(farsiPhone, { regionMap: { IR: "es" }, fallback: "en" })).toBe("fa");
  });

  it("ignores remote values that are not locales we ship", () => {
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "de" } })).toBe("en");
    expect(resolveAppLocale(en, { fallback: "de" })).toBe("en");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/i18n/localeDefaults.test.ts`
Expected: FAIL — the new `"Spanish is disabled"` describe block and several assertions in `"honours the order..."`/`"reads the region..."`/`"merges the remote region map..."` fail against the *current* implementation, which still resolves `es` from language/region.

- [ ] **Step 3: Remove the `es` language branch and `ES` region entry**

In `src/i18n/localeDefaults.ts`, change:

```ts
const APP_LOCALE_BY_REGION: Record<string, AppLocale> = {
  IR: "fa",
  AF: "fa",
  PK: "fa",
  ES: "es",
};
```

to:

```ts
const APP_LOCALE_BY_REGION: Record<string, AppLocale> = {
  IR: "fa",
  AF: "fa",
  PK: "fa",
};
```

and change:

```ts
function appLocaleForLanguage(tag: string | null | undefined): AppLocale | null {
  const lang = tag?.trim().toLowerCase().split(/[-_]/)[0];
  if (lang === "fa") return "fa";
  if (lang === "es") return "es";
  return null;
}
```

to:

```ts
function appLocaleForLanguage(tag: string | null | undefined): AppLocale | null {
  const lang = tag?.trim().toLowerCase().split(/[-_]/)[0];
  if (lang === "fa") return "fa";
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/i18n/localeDefaults.test.ts`
Expected: PASS (all tests, including the new "Spanish is disabled" block).

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/i18n/localeDefaults.ts src/i18n/localeDefaults.test.ts
git commit -m "fix(i18n): disable Spanish auto-detection from device language/region"
```

## Self-Review Notes

- **Spec coverage:** design doc section 2's two bullet points (picker removal, detection removal) map to Task 1 and Task 2 of this plan respectively; the "explicitly NOT touched" list was checked against the actual codebase and nothing in this plan touches `AppLocale`, `translations.ts`'s `es` object, `profilePrefsSync.ts`, or `GroupsScreen.tsx`/`ActivityScreen.tsx`'s locale maps.
- **Discrepancy flagged:** the design doc's mention of a `"ca"` branch does not match the current code (Task 2 note above) — handled by only removing what actually exists.
- **Discrepancy flagged:** the design doc's testing section undersold the work needed on `localeDefaults.test.ts` — Task 2 corrects this with a full rewrite of the affected assertions rather than leaving them to fail.
