# Farsi/RTL Batch A — Small Fixes — Design

**Date:** 2026-08-05
**Status:** Approved, ready for planning

## Problem

Real-device testing of the Farsi locale surfaced a batch of issues, reported as one list:
currency amounts show raw ISO codes instead of Farsi words, Spanish needs disabling,
the first-run feature tour has no remote kill switch, the app's brand name should read
differently in Farsi, and a floating button appeared mispositioned in one screenshot.

The list spans independent subsystems of very different sizes. This spec covers only the
four items small enough to have no real architectural decision — a boolean flag, a picker
entry, a currency-label lookup, and a translation-string edit. Three larger items
(RTL back-button direction, Persian digit display, a Persian/Hijri Shamsi calendar) are
each their own future spec; folding them in here would make this deliverable open-ended.

## Investigation finding, resolved before design

The reported "FAB button on the wrong side" was investigated and is **not the FabPill**
component (`src/ui/FabPill.tsx`), which is explicitly, deliberately pinned bottom-right
regardless of locale and is unrelated to this report. The screenshot's button is a
`reorder-three-outline` drag-handle icon in `AiReceiptScreen.tsx`'s "Exact" split mode
(`:2572-2582`), whose static row layout already branches on `isRTL` for both flex direction
and margins — the code looks correct on inspection. Dropped from this batch; a real
reproduction (e.g. a screen recording, since the bug may only appear mid-drag through the
hand-rolled `PanResponder`/`Animated` logic) is needed before scoping a fix.

## Scope

Four independent pieces, each small enough to ship as one PR-sized change:

1. Remote-config flag to disable the first-run feature tour
2. Soft-disable the Spanish locale
3. Farsi currency labels for IRT/IRR
4. Farsi app name

## 1. Onboarding tour remote-config flag

Tally has two separate first-run experiences that are easy to conflate: an **onboarding
flow** (`OnboardingProvider`, gated by `SETTINGS_KEYS.onboardingDone`, shown before the main
app renders) and an **in-app feature tour** (`TourProvider`, gated by
`SETTINGS_KEYS.tourDone`, a fab/ai/qr tooltip walkthrough shown once on the first Home visit
after onboarding). This flag targets **only the feature tour** — onboarding is untouched.

New key in the `app_config` registry (the general remote-config system shipped in
`docs/superpowers/specs/2026-08-04-remote-config-design.md`):

| key | `value_type` | `max_visibility` |
|---|---|---|
| `onboarding_tour_enabled` | boolean | public |

`public` because a hostile client lying about this value costs nothing — it only affects
whether tooltips appear, never security or billing. Seeded `true` at `everyone`, matching
today's always-on behavior exactly, so applying the migration changes nothing observable —
the same no-op-seed discipline every `app_config` migration follows.

**Consumption point:** `useAutoStartTour` in `src/providers/TourContext.tsx`, not the two
call sites (`AddExpenseScreen.tsx:1456`, `GroupsScreen.tsx:337`). Gating inside the hook
means both existing call sites — and any future one — inherit the flag automatically,
rather than requiring every call site to remember to check it. `useAutoStartTour` reads
`useRemoteConfig()` and short-circuits (does not start the tour, does not mark it as shown)
when `configBool(config, "onboarding_tour_enabled", true)` is `false`. Fails open: absent or
malformed config leaves the tour enabled, matching every other flag in this system.

An operator recipe (commented out, self-contained per the established `set-app-config.sql`
convention) is added for toggling this key.

## 2. Disable Spanish (soft)

**Soft, not full removal** — chosen specifically for reversibility ("for now"). Two changes:

- `src/screens/SettingsScreen.tsx:220` — remove the `{ code: "es", label:
  t("account.languageSpanish") }` entry from the language picker's rendered list. The
  translation key stays; only the picker option disappears.
- `src/i18n/localeDefaults.ts` — remove the `"es"`/`"ca"` branch from
  `appLocaleForLanguage` and the `"ES"` entry from the region-fallback map, so a
  Spanish-language or Spanish-region device falls through to the next check (another shipped
  language, then the bundled/remote default) instead of resolving to `"es"`.

**Explicitly NOT touched:** `AppLocale`'s `"es"` member, `translations.ts`'s `es` object,
`src/sync/profilePrefsSync.ts`'s `VALID_LOCALES`, and the per-screen locale maps in
`GroupsScreen.tsx`/`ActivityScreen.tsx`. All of this infrastructure stays intact and
correct — it's simply unreachable from the UI going forward. Re-enabling later means
restoring the picker entry and the two detection branches; no rebuilding.

**Existing `es` users, if any:** unaffected. Their persisted `locale` setting still resolves
and renders correctly — `translations.ts` still has the `es` object — they just can't be
newly assigned that locale by the picker or auto-detection anymore.

## 3. Farsi currency labels (تومان/ریال)

Scoped narrowly: **only** `IRT`→`تومان` and `IRR`→`ریال`. No general
ISO-currency-name-to-Farsi mapping — that's a much larger, unrequested project (190+
currencies), and nothing else in the report asked for it.

`src/data/currencies.ts` currently has three functions with no locale parameter:
`formatMinor(amountMinor, currency)`, `formatMinorWithSymbol(amountMinor, currency)`,
`currencySymbol(currency)`. Each gains an **optional** `locale?: AppLocale` parameter:

```ts
export function formatMinor(amountMinor: number, currency: string, locale?: AppLocale): string
export function formatMinorWithSymbol(amountMinor: number, currency: string, locale?: AppLocale): string
export function currencySymbol(currency: string, locale?: AppLocale): string
```

Optional and defaulted means every existing call that doesn't pass `locale` keeps behaving
exactly as today — this is additive, not a breaking signature change. When `locale ===
"fa"`, `IRT`/`IRR` substitute the Farsi word for the code (in `formatMinor`) or symbol slot
(in `formatMinorWithSymbol`/`currencySymbol`); every other currency code and every other
locale is unaffected.

A small internal map carries the two overrides:

```ts
const FARSI_CURRENCY_LABELS: Readonly<Record<string, string>> = {
  IRT: "تومان",
  IRR: "ریال",
};
```

**Coverage: all 12 call sites**, updated to pass `locale` from their own `useLocale()`:
`src/core/notifications.ts`, `src/core/groupExport.ts`, `src/screens/AccountScreen.tsx`,
`src/screens/FriendsScreen.tsx`, `src/screens/GroupsScreen.tsx`,
`src/screens/AddExpenseScreen.tsx`, `src/screens/ActivityScreen.tsx`,
`src/screens/ReceiptAssignDnDModal.tsx`, `src/screens/GroupDetailScreen.tsx`,
`src/screens/AiReceiptScreen.tsx`, `src/components/GroupTotalsBreakdown.tsx`,
`src/data/tallyRepo.ts`. Three of these (`notifications.ts`, `groupExport.ts`,
`tallyRepo.ts`) are outside the React component tree — each needs its own path to the
current locale (a parameter passed in from its caller, since none of these are hooks); the
implementation plan resolves this per call site rather than assuming a single pattern
fits all three.

`currencyLabel()` (the "IRT — Iran — Iranian toman" picker text) is explicitly out of
scope, per the earlier scoping answer — it stays English-only.

## 4. Farsi app name (یلات)

`"Tally"` appears as literal, hardcoded text inside `translations.ts`'s `fa` locale object
at roughly 13 lines of inline prose — there is no shared `appName` key to change once.
Every one of those `fa`-object occurrences is replaced with `"یلات"` directly, as a content
edit. `en` and `es` objects, `app.json`, and every hardcoded `"Tally"` reference outside
`translations.ts` (permission strings, screen titles built from constants, export
filenames) are untouched — this is a translation-content change only, not a rebrand.

## Testing

- `onboarding_tour_enabled`: a unit test on the gate logic asserting `configBool` default
  (`true` when absent/malformed) and that `false` genuinely suppresses the start call —
  the same per-key-fallback discipline as every other `app_config` consumer.
- Currency labels: direct unit tests on `formatMinor`/`formatMinorWithSymbol`/
  `currencySymbol` with `locale: "fa"` for `IRT`/`IRR`, and a case confirming an
  unrelated code (e.g. `USD`) is unaffected by `locale: "fa"`, and a case confirming
  omitting `locale` entirely reproduces today's exact output (backward-compatibility
  regression guard).
- Spanish removal and the app-name edit are content/config changes with no new logic —
  verified by reading the diff and running the existing suite; no new unit tests needed.

## Non-goals

- RTL back-button direction, Persian digit display, Persian/Hijri Shamsi calendar — each
  its own future spec.
- The FAB/drag-handle report — dropped, needs a real reproduction first.
- Full ISO-currency Farsi localization beyond IRT/IRR.
- Making Spanish removal remotely toggleable via `app_config` — this batch treats it as a
  build-time code change, not a remote flag; nothing in the request asked for the ability
  to re-enable it without a release.
