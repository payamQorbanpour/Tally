# Farsi Currency Labels (IRT/IRR) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the app locale is Farsi, show `تومان` for `IRT` and `ریال` for `IRR` instead of the raw ISO code/symbol, everywhere money is formatted. No other currency or locale is affected.

**Architecture:** Add an **optional** `locale?: AppLocale` parameter to `src/data/currencies.ts`'s three formatting functions (`formatMinor`, `formatMinorWithSymbol`, `currencySymbol`), backed by one small `FARSI_CURRENCY_LABELS` map. Optional + defaulted means every existing call that omits `locale` is byte-for-byte unaffected — this is additive, not a breaking signature change. From there, thread `locale` outward to all 12 call sites: 8 already have `useLocale()`'s `locale` in scope as a component-level variable (some need it added to an existing destructure), and 3 are outside the component tree (`notifications.ts`, `groupExport.ts`, and `GroupDetailScreen.tsx`'s module-level `youStatus` helper) and need `locale` passed in as an explicit parameter from their caller. `src/data/tallyRepo.ts` is a re-export barrel for `formatMinor` — it needs no changes itself, but its one consumer (`ReceiptAssignDnDModal.tsx`) does.

**Tech Stack:** TypeScript, React Native, Vitest.

## Global Constraints

- `locale` is **always the last parameter**, **always optional**, on every function this plan touches — matching the exact pattern in `src/data/currencies.ts`'s existing functions and every `app_config` accessor in this codebase (fallback/default behavior when the parameter is absent).
- Farsi substitution is scoped to exactly two codes: `IRT` → `تومان`, `IRR` → `ریال`. No other code changes behavior at any locale. `currencyLabel()` (the "IRT — Iran — Iranian toman" picker text) is explicitly out of scope and is never touched by this plan.
- Every call site update passes the **already-in-scope** `locale`/`appLocale` variable from that file's own `useLocale()` call (or threads it in as a new parameter for the 3 non-component files) — no new `useLocale()` calls are introduced where one doesn't already exist in the component.

---

### Task 1: Core `currencies.ts` change, with tests first

**Files:**
- Modify: `src/data/currencies.ts:186-248` (`formatMinor`, `currencySymbol`, `formatMinorWithSymbol`)
- Test: `src/data/currencies.test.ts`

**Interfaces:**
- Produces: `formatMinor(amountMinor: number, currency: string, locale?: AppLocale): string`, `currencySymbol(currency: string, locale?: AppLocale): string`, `formatMinorWithSymbol(amountMinor: number, currency: string, locale?: AppLocale): string` — consumed by Tasks 2-4. `AppLocale` is already imported in this file (`src/data/currencies.ts:1`).

- [ ] **Step 1: Write the failing tests**

In `src/data/currencies.test.ts`, change the import block from:

```ts
import { describe, expect, it } from "vitest";
import {
  applyDecimalSeparatorToAmountInput,
  stripImeSpuriousZeroDotAfterFocus,
  currencyMinorExponent,
  formatMinor,
  formatUnsignedMoneyInputDisplay,
  minorToAmountInputString,
  minorToAmountString,
  parseMoneyToMinor,
} from "./currencies";
```

to:

```ts
import { describe, expect, it } from "vitest";
import {
  applyDecimalSeparatorToAmountInput,
  stripImeSpuriousZeroDotAfterFocus,
  currencyMinorExponent,
  currencySymbol,
  formatMinor,
  formatMinorWithSymbol,
  formatUnsignedMoneyInputDisplay,
  minorToAmountInputString,
  minorToAmountString,
  parseMoneyToMinor,
} from "./currencies";
```

Then append this new `describe` block at the end of the file:

```ts
describe('Farsi currency labels (locale: "fa")', () => {
  it("substitutes the Farsi word for IRT/IRR in formatMinor", () => {
    expect(formatMinor(1_500_000, "IRT", "fa")).toBe("تومان 15,000");
    expect(formatMinor(15_000_000, "IRR", "fa")).toBe("ریال 150,000");
  });

  it("substitutes the Farsi word for IRT/IRR in currencySymbol and formatMinorWithSymbol", () => {
    expect(currencySymbol("IRT", "fa")).toBe("تومان");
    expect(currencySymbol("IRR", "fa")).toBe("ریال");
    expect(formatMinorWithSymbol(1_500_000, "IRT", "fa")).toBe("تومان15,000");
    expect(formatMinorWithSymbol(15_000_000, "IRR", "fa")).toBe("ریال150,000");
  });

  it('leaves an unrelated currency code unaffected by locale: "fa"', () => {
    expect(formatMinor(1250, "USD", "fa")).toBe("USD 12.50");
    expect(currencySymbol("USD", "fa")).toBe("$");
    expect(formatMinorWithSymbol(1250, "USD", "fa")).toBe("$12.50");
  });

  it("reproduces today's exact output when locale is omitted (backward-compatibility guard)", () => {
    expect(formatMinor(1_500_000, "IRT")).toBe("IRT 15,000");
    expect(formatMinor(15_000_000, "IRR")).toBe("IRR 150,000");
    expect(currencySymbol("IRR")).toBe("﷼");
    expect(formatMinorWithSymbol(15_000_000, "IRR")).toBe("﷼150,000");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/data/currencies.test.ts`
Expected: FAIL — `formatMinor(1_500_000, "IRT", "fa")` returns `"IRT 15,000"` (the third argument is currently ignored/nonexistent), and `currencySymbol`/`formatMinorWithSymbol` aren't yet exported with a 2-arg/3-arg signature that accepts `"fa"` meaningfully. Also a TS error importing `currencySymbol`/`formatMinorWithSymbol` is fine to see if the test runner surfaces it — they already exist, just without the new behavior.

- [ ] **Step 3: Implement the Farsi label map and thread `locale` through the three functions**

In `src/data/currencies.ts`, insert this new block immediately before `export function formatMinor`:

```ts
/**
 * Farsi-language overrides for the currency code/symbol slot. Scoped
 * narrowly to IRT/IRR per the Farsi/RTL Batch A design doc — not a general
 * ISO-currency-name-to-Farsi map.
 */
const FARSI_CURRENCY_LABELS: Readonly<Record<string, string>> = {
  IRT: "تومان",
  IRR: "ریال",
};

function farsiCurrencyLabel(code: string, locale?: AppLocale): string | undefined {
  return locale === "fa" ? FARSI_CURRENCY_LABELS[code] : undefined;
}

```

Then change:

```ts
export function formatMinor(amountMinor: number, currency: string): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const code = currency.trim().toUpperCase();
  const wholeStr = addThousandsSeparators(String(whole));
  if (exp === 0) return `${sign}${code} ${wholeStr}`;
  if (frac === 0) return `${sign}${code} ${wholeStr}`;
  const fracStr = frac.toString().padStart(exp, "0");
  return `${sign}${code} ${wholeStr}.${fracStr}`;
}
```

to:

```ts
export function formatMinor(amountMinor: number, currency: string, locale?: AppLocale): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const code = currency.trim().toUpperCase();
  const label = farsiCurrencyLabel(code, locale) ?? code;
  const wholeStr = addThousandsSeparators(String(whole));
  if (exp === 0) return `${sign}${label} ${wholeStr}`;
  if (frac === 0) return `${sign}${label} ${wholeStr}`;
  const fracStr = frac.toString().padStart(exp, "0");
  return `${sign}${label} ${wholeStr}.${fracStr}`;
}
```

Then change:

```ts
export function currencySymbol(currency: string): string {
  const code = currency.trim().toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}
```

to:

```ts
export function currencySymbol(currency: string, locale?: AppLocale): string {
  const code = currency.trim().toUpperCase();
  return farsiCurrencyLabel(code, locale) ?? CURRENCY_SYMBOLS[code] ?? code;
}
```

Then change:

```ts
export function formatMinorWithSymbol(amountMinor: number, currency: string): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const sym = currencySymbol(currency);
  const wholeStr = addThousandsSeparators(String(whole));
  if (exp === 0) return `${sign}${sym}${wholeStr}`;
  if (frac === 0) return `${sign}${sym}${wholeStr}`;
  const fracStr = frac.toString().padStart(exp, "0");
  return `${sign}${sym}${wholeStr}.${fracStr}`;
}
```

to:

```ts
export function formatMinorWithSymbol(amountMinor: number, currency: string, locale?: AppLocale): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const sym = currencySymbol(currency, locale);
  const wholeStr = addThousandsSeparators(String(whole));
  if (exp === 0) return `${sign}${sym}${wholeStr}`;
  if (frac === 0) return `${sign}${sym}${wholeStr}`;
  const fracStr = frac.toString().padStart(exp, "0");
  return `${sign}${sym}${wholeStr}.${fracStr}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/data/currencies.test.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/data/currencies.ts src/data/currencies.test.ts
git commit -m "feat(i18n): add Farsi IRT/IRR currency labels to currencies.ts"
```

---

### Task 2: Thread `locale` through `notifications.ts` and its two UI callers

**Files:**
- Modify: `src/core/notifications.ts:1-13,64-179` (imports, `deriveNotifications`)
- Modify: `src/screens/NotificationsScreen.tsx:44,62`
- Modify: `src/components/NotificationsPopover.tsx:40,55`

**Interfaces:**
- Consumes: `formatMinor(amountMinor, currency, locale?)` from Task 1.
- Produces: `deriveNotifications(db: TallyDb, locale?: AppLocale): Promise<NotificationItem[]>`.

**Scope note (ripple stops here):** `getNotificationsUnreadCount(db)` (`src/core/notifications.ts:318-332`) calls `deriveNotifications(db)` internally but only counts items — it never renders a title to the user — so it is **not modified**; it keeps calling `deriveNotifications(db)` with `locale` omitted (fine, since the parameter is optional and the count doesn't depend on it). Its own caller, `useNotificationsUnreadCount()` (`src/hooks/useNotificationsUnreadCount.ts`), and *that* hook's caller, `GroupsListHeader.tsx`, are **not touched** by this task.

No new test — `deriveNotifications` composes several async SQLite reads and isn't unit-tested today (no test file exists for `notifications.ts`); Task 1's tests already cover the underlying `formatMinor` locale behavior this depends on. Verify with typecheck + full suite.

- [ ] **Step 1: Add the `AppLocale` import and thread the parameter through `deriveNotifications`**

In `src/core/notifications.ts`, change:

```ts
import type { TallyDb } from "../db/tallyDb";
import { getLocalUserId } from "../db/ids";
import { formatMinor } from "../data/currencies";
```

to:

```ts
import type { TallyDb } from "../db/tallyDb";
import { getLocalUserId } from "../db/ids";
import { formatMinor } from "../data/currencies";
import type { AppLocale } from "../i18n/translations";
```

Change:

```ts
export async function deriveNotifications(
  db: TallyDb,
): Promise<NotificationItem[]> {
```

to:

```ts
export async function deriveNotifications(
  db: TallyDb,
  locale?: AppLocale,
): Promise<NotificationItem[]> {
```

Change:

```ts
        title: `You owe ${formatMinor(owes, g.currency)}`,
```

to:

```ts
        title: `You owe ${formatMinor(owes, g.currency, locale)}`,
```

Change:

```ts
        title: `You're owed ${formatMinor(balance, g.currency)}`,
```

to:

```ts
        title: `You're owed ${formatMinor(balance, g.currency, locale)}`,
```

Change:

```ts
        title: isMine
          ? `You added ${formatMinor(e.amount_minor, g.currency)}`
          : `${e.payer_name} added ${formatMinor(e.amount_minor, g.currency)}`,
```

to:

```ts
        title: isMine
          ? `You added ${formatMinor(e.amount_minor, g.currency, locale)}`
          : `${e.payer_name} added ${formatMinor(e.amount_minor, g.currency, locale)}`,
```

- [ ] **Step 2: Update `NotificationsScreen.tsx`**

Change:

```tsx
  const { t, isRTL } = useLocale();
```

to:

```tsx
  const { t, locale, isRTL } = useLocale();
```

Change:

```tsx
        const [next, persistedRead, persistedArchived] = await Promise.all([
          deriveNotifications(db),
          getNotificationReadIds(db),
          getNotificationArchivedIds(db),
        ]);
```

to:

```tsx
        const [next, persistedRead, persistedArchived] = await Promise.all([
          deriveNotifications(db, locale),
          getNotificationReadIds(db),
          getNotificationArchivedIds(db),
        ]);
```

- [ ] **Step 3: Update `NotificationsPopover.tsx`**

Change:

```tsx
  const { t, isRTL } = useLocale();
```

to:

```tsx
  const { t, locale, isRTL } = useLocale();
```

Change:

```tsx
      const [next, persistedRead, persistedArchived] = await Promise.all([
        deriveNotifications(db),
        getNotificationReadIds(db),
        getNotificationArchivedIds(db),
      ]);
```

to:

```tsx
      const [next, persistedRead, persistedArchived] = await Promise.all([
        deriveNotifications(db, locale),
        getNotificationReadIds(db),
        getNotificationArchivedIds(db),
      ]);
```

- [ ] **Step 4: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/core/notifications.ts src/screens/NotificationsScreen.tsx src/components/NotificationsPopover.tsx
git commit -m "feat(i18n): thread locale into notification titles for Farsi currency labels"
```

---

### Task 3: Thread `locale` through `groupExport.ts` and `GroupDetailScreen.tsx`

**Files:**
- Modify: `src/core/groupExport.ts:1-9,298-325` (imports, `buildGroupReportModel`, `buildGroupExportReportHtml`)
- Modify: `src/screens/GroupDetailScreen.tsx` (11 direct `formatMinor` call sites, 5 `groupExport` wrapper call sites across 3 `useCallback`s, and the module-level `youStatus` helper)

**Interfaces:**
- Consumes: `formatMinor(amountMinor, currency, locale?)` from Task 1.
- Produces: `buildGroupReportModel(bundle: GroupExportBundle, locale?: AppLocale): GroupReportModel`, `buildGroupExportReportHtml(bundle: GroupExportBundle, options?: GroupExportHtmlOptions, locale?: AppLocale): string`.

`locale` is already destructured in scope for the whole component at `src/screens/GroupDetailScreen.tsx:981` (`const { t, locale, isRTL } = useLocale();`) — every call site inside the component body or its `useCallback`s can reference it directly. The one exception is `youStatus`, a module-level function (`:3137-3141`) called with explicit arguments rather than closing over component scope — it needs `locale` added as a new parameter.

No new test — this screen has no test file (no `.test.ts` exists under `src/screens/`); Task 1's tests cover the underlying formatting behavior. Verify with typecheck + full suite.

- [ ] **Step 1: Add the `AppLocale` import to `groupExport.ts` and thread `locale` through the two report-building exports**

In `src/core/groupExport.ts`, change:

```ts
import type { TallyDb } from "../db/tallyDb";
import { formatMinor } from "../data/currencies";
```

to:

```ts
import type { TallyDb } from "../db/tallyDb";
import { formatMinor } from "../data/currencies";
import type { AppLocale } from "../i18n/translations";
```

Change:

```ts
export function buildGroupReportModel(bundle: GroupExportBundle): GroupReportModel {
  const { group, expenses } = bundle;
  const metaLine = `${group.currency} · ${new Date().toISOString().slice(0, 10)}`;
  const rows: GroupReportRow[] = expenses.map(({ expense: e, splits }) => ({
    date: e.expense_date,
    paidBy: e.payer_name,
    amount: formatMinor(e.amount_minor, group.currency),
    description: e.description,
    category: e.category?.trim() ?? "",
    split:
      splits.length > 0
        ? splits
            .map((s) => `${s.name} (${formatMinor(s.owed_minor, group.currency)})`)
            .join(", ")
        : "—",
  }));
  return { title: group.name, metaLine, rows };
}
```

to:

```ts
export function buildGroupReportModel(
  bundle: GroupExportBundle,
  locale?: AppLocale,
): GroupReportModel {
  const { group, expenses } = bundle;
  const metaLine = `${group.currency} · ${new Date().toISOString().slice(0, 10)}`;
  const rows: GroupReportRow[] = expenses.map(({ expense: e, splits }) => ({
    date: e.expense_date,
    paidBy: e.payer_name,
    amount: formatMinor(e.amount_minor, group.currency, locale),
    description: e.description,
    category: e.category?.trim() ?? "",
    split:
      splits.length > 0
        ? splits
            .map((s) => `${s.name} (${formatMinor(s.owed_minor, group.currency, locale)})`)
            .join(", ")
        : "—",
  }));
  return { title: group.name, metaLine, rows };
}
```

Change:

```ts
export function buildGroupExportReportHtml(
  bundle: GroupExportBundle,
  options?: GroupExportHtmlOptions,
): string {
  const m = buildGroupReportModel(bundle);
```

to:

```ts
export function buildGroupExportReportHtml(
  bundle: GroupExportBundle,
  options?: GroupExportHtmlOptions,
  locale?: AppLocale,
): string {
  const m = buildGroupReportModel(bundle, locale);
```

- [ ] **Step 2: `runGroupExportPdf` — pass `locale` and update its dependency array**

Change:

```tsx
      const bundle = await loadGroupExportBundle(db, groupId);
      const html = buildGroupExportReportHtml(bundle);
      const stem = safeGroupExportFileStem(bundle.group.name);
      await shareGroupPdfFromHtml(html, `tally-${stem}-${exportFileStamp()}.pdf`);
```

to:

```tsx
      const bundle = await loadGroupExportBundle(db, groupId);
      const html = buildGroupExportReportHtml(bundle, undefined, locale);
      const stem = safeGroupExportFileStem(bundle.group.name);
      await shareGroupPdfFromHtml(html, `tally-${stem}-${exportFileStamp()}.pdf`);
```

Change the dependency array immediately below this callback:

```tsx
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t]);

  const runGroupExportPng = useCallback(async () => {
```

to:

```tsx
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t, locale]);

  const runGroupExportPng = useCallback(async () => {
```

- [ ] **Step 3: `runGroupExportPng` — pass `locale` at both call sites and update its dependency array**

Change:

```tsx
      if (Platform.OS === "web") {
        const html = buildGroupExportReportHtml(bundle);
        const dataUrl = await captureReportHtmlAsPng(html);
        await shareFileUri(dataUrl, `tally-${stem}-${stamp}.png`, "image/png", "public.png");
        return;
      }
      setReportSnapshotModel(buildGroupReportModel(bundle));
```

to:

```tsx
      if (Platform.OS === "web") {
        const html = buildGroupExportReportHtml(bundle, undefined, locale);
        const dataUrl = await captureReportHtmlAsPng(html);
        await shareFileUri(dataUrl, `tally-${stem}-${stamp}.png`, "image/png", "public.png");
        return;
      }
      setReportSnapshotModel(buildGroupReportModel(bundle, locale));
```

Change its dependency array:

```tsx
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t]);

  const currency = group?.currency ?? "USD";
```

to:

```tsx
  }, [db, group, groupExportBusy, groupId, exportFileStamp, t, locale]);

  const currency = group?.currency ?? "USD";
```

- [ ] **Step 4: `shareSuggestedSettlements` — pass `locale` at three call sites and update its dependency array**

Change:

```tsx
      const amountStr = formatMinor(p.amountMinor, currency);
      return t("groupDetail.settlementLine", { from, to, amount: amountStr });
```

to:

```tsx
      const amountStr = formatMinor(p.amountMinor, currency, locale);
      return t("groupDetail.settlementLine", { from, to, amount: amountStr });
```

Change:

```tsx
      if (Platform.OS === "web") {
        const html = buildGroupExportReportHtml(bundle);
        const dataUrl = await captureReportHtmlAsPng(html);
        await shareFileUri(dataUrl, `tally-${stem}-settlements-${stamp}.png`, "image/png", "public.png");
        await Share.share({ message, title: groupName });
        return;
      }
```

to:

```tsx
      if (Platform.OS === "web") {
        const html = buildGroupExportReportHtml(bundle, undefined, locale);
        const dataUrl = await captureReportHtmlAsPng(html);
        await shareFileUri(dataUrl, `tally-${stem}-settlements-${stamp}.png`, "image/png", "public.png");
        await Share.share({ message, title: groupName });
        return;
      }
```

Change:

```tsx
      try {
        setReportSnapshotModel(buildGroupReportModel(bundle));
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 320);
        });
        pngUri = await captureGroupExportPng(pngViewRef);
```

to:

```tsx
      try {
        setReportSnapshotModel(buildGroupReportModel(bundle, locale));
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 320);
        });
        pngUri = await captureGroupExportPng(pngViewRef);
```

Change its dependency array:

```tsx
  }, [
    interactionLocked,
    sortedSettlements,
    group?.name,
    group,
    members,
    currency,
    t,
    db,
    groupId,
    exportFileStamp,
  ]);
```

to:

```tsx
  }, [
    interactionLocked,
    sortedSettlements,
    group?.name,
    group,
    members,
    currency,
    locale,
    t,
    db,
    groupId,
    exportFileStamp,
  ]);
```

- [ ] **Step 5: `remindOneSettlement` — pass `locale` and update its dependency array**

Change:

```tsx
      const amountStr = formatMinor(p.amountMinor, currency);
      const line = t("groupDetail.settlementLine", { from, to, amount: amountStr });
```

to:

```tsx
      const amountStr = formatMinor(p.amountMinor, currency, locale);
      const line = t("groupDetail.settlementLine", { from, to, amount: amountStr });
```

Change:

```tsx
    [interactionLocked, group?.name, members, currency, t],
  );
```

to:

```tsx
    [interactionLocked, group?.name, members, currency, locale, t],
  );
```

- [ ] **Step 6: The remaining direct render-time `formatMinor` calls — pass `locale`**

These 7 call sites are plain expressions evaluated on every render (not inside a `useCallback`), so `locale` from the component's own scope is already reachable — no dependency array to update. Apply each:

Change (`renderSuggestedSettlement`):
```tsx
    const amountStr = formatMinor(p.amountMinor, currency);
```
to:
```tsx
    const amountStr = formatMinor(p.amountMinor, currency, locale);
```

Change:
```tsx
          <Text style={styles.balanceDashTotalAmt} numberOfLines={1}>
            {formatMinor(groupTotalMinor, currency)}
          </Text>
```
to:
```tsx
          <Text style={styles.balanceDashTotalAmt} numberOfLines={1}>
            {formatMinor(groupTotalMinor, currency, locale)}
          </Text>
```

Change:
```tsx
              {formatMinor(myNetAbsMinor, currency)}
```
to:
```tsx
              {formatMinor(myNetAbsMinor, currency, locale)}
```

Change:
```tsx
            {t("groupDetail.balancesSettlementSummary", {
              count: String(sortedSettlements.length),
              amount: formatMinor(totalSettlementVolumeMinor, currency),
            })}
```
to:
```tsx
            {t("groupDetail.balancesSettlementSummary", {
              count: String(sortedSettlements.length),
              amount: formatMinor(totalSettlementVolumeMinor, currency, locale),
            })}
```

Change:
```tsx
                        ? t("groupDetail.balanceGetsBack", {
                              amount: formatMinor(raw, currency),
                            })
                          : t("groupDetail.balanceOwes", {
                              amount: formatMinor(-raw, currency),
                            });
```
to:
```tsx
                        ? t("groupDetail.balanceGetsBack", {
                              amount: formatMinor(raw, currency, locale),
                            })
                          : t("groupDetail.balanceOwes", {
                              amount: formatMinor(-raw, currency, locale),
                            });
```

Change:
```tsx
            const amountLabel = formatMinor(e.amount_minor, currency);
```
to:
```tsx
            const amountLabel = formatMinor(e.amount_minor, currency, locale);
```

- [ ] **Step 7: `youStatus` — add `locale` as an explicit parameter (module-level function, no closure over component scope)**

Change:

```tsx
function youStatus(
  e: ExpenseRowWithMyShare,
  currency: string,
  t: Translate,
): { text: string; tone: "lent" | "owe" | "neutral" } | null {
  const owed = e.my_owed_minor ?? 0;
  if (e.payer_id === getLocalUserId()) {
    const lent = e.amount_minor - owed;
    if (lent > 0) {
      return {
        text: t("groupDetail.youLent", {
          amount: formatMinor(lent, currency),
        }),
        tone: "lent",
      };
    }
    return { text: t("groupDetail.youPaid"), tone: "neutral" };
  }
  if (owed > 0) {
    return {
      text: t("groupDetail.youOweShare", {
        amount: formatMinor(owed, currency),
      }),
      tone: "owe",
    };
  }
```

to:

```tsx
function youStatus(
  e: ExpenseRowWithMyShare,
  currency: string,
  t: Translate,
  locale: AppLocale,
): { text: string; tone: "lent" | "owe" | "neutral" } | null {
  const owed = e.my_owed_minor ?? 0;
  if (e.payer_id === getLocalUserId()) {
    const lent = e.amount_minor - owed;
    if (lent > 0) {
      return {
        text: t("groupDetail.youLent", {
          amount: formatMinor(lent, currency, locale),
        }),
        tone: "lent",
      };
    }
    return { text: t("groupDetail.youPaid"), tone: "neutral" };
  }
  if (owed > 0) {
    return {
      text: t("groupDetail.youOweShare", {
        amount: formatMinor(owed, currency, locale),
      }),
      tone: "owe",
    };
  }
```

Update its one call site — change:

```tsx
            const status = youStatus(e, currency, t);
```

to:

```tsx
            const status = youStatus(e, currency, t, locale);
```

`AppLocale` is already imported in this file (`src/screens/GroupDetailScreen.tsx:84`), so no new import is needed for this step.

- [ ] **Step 8: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/groupExport.ts src/screens/GroupDetailScreen.tsx
git commit -m "feat(i18n): thread locale through group export and GroupDetailScreen currency displays"
```

---

### Task 4: Remaining 8 screen/component call sites

**Files:**
- Modify: `src/screens/AccountScreen.tsx:1320`
- Modify: `src/screens/FriendsScreen.tsx:336,667,676,796-799`
- Modify: `src/screens/GroupsScreen.tsx:541,555,563,662-665,712-715`
- Modify: `src/screens/AddExpenseScreen.tsx` (14 call sites, listed below)
- Modify: `src/screens/ActivityScreen.tsx:422,445`
- Modify: `src/screens/ReceiptAssignDnDModal.tsx:236,500-503,552,571-574,633-636`
- Modify: `src/screens/AiReceiptScreen.tsx:1174,2422,2857,2974,3302-3305,3481-3484`
- Modify: `src/components/GroupTotalsBreakdown.tsx:48,136,195`

**Interfaces:**
- Consumes: `formatMinor`/`formatMinorWithSymbol`/`currencySymbol` from Task 1. All 8 files already import these from `"../data/currencies"` (or, for `ReceiptAssignDnDModal.tsx`, via the `tallyRepo.ts` re-export barrel — no import line changes needed there since it's a pure passthrough).

Every file below already calls `useLocale()`. 4 files (`AccountScreen`, `GroupsScreen`, `AddExpenseScreen`, `ActivityScreen`) already destructure `locale` (or, in `AddExpenseScreen`, the alias `appLocale`) — nothing to add there. 4 files (`FriendsScreen`, `ReceiptAssignDnDModal`, `AiReceiptScreen`, `GroupTotalsBreakdown`) destructure `useLocale()` without pulling out `locale` — Step 1 in each of those adds it.

No new tests — these are React Native screen components with no existing test files (confirmed: no `.test.ts`/`.test.tsx` exists under `src/screens/` or `src/components/`). Task 1's tests cover the underlying formatting logic these calls depend on. Verify with typecheck + full suite + the manual smoke check in Step 10.

- [ ] **Step 1: `AccountScreen.tsx`** (`locale` already in scope via `const { locale, t, isRTL } = useLocale();` at line 796)

Change:

```tsx
              {formatMinor(accountStats.netMinor, accountStats.netCurrency)}
```

to:

```tsx
              {formatMinor(accountStats.netMinor, accountStats.netCurrency, locale)}
```

- [ ] **Step 2: `FriendsScreen.tsx`**

Change:

```tsx
  const { t, isRTL } = useLocale();
```

to:

```tsx
  const { t, locale, isRTL } = useLocale();
```

Change:

```tsx
              <Text style={styles.summaryAmountOwed} numberOfLines={1}>
                {formatMinor(sumTotals.owed, summaryCcy)}
              </Text>
```

to:

```tsx
              <Text style={styles.summaryAmountOwed} numberOfLines={1}>
                {formatMinor(sumTotals.owed, summaryCcy, locale)}
              </Text>
```

Change:

```tsx
              <Text style={styles.summaryAmountOwe} numberOfLines={1}>
                {formatMinor(sumTotals.owe, summaryCcy)}
              </Text>
```

to:

```tsx
              <Text style={styles.summaryAmountOwe} numberOfLines={1}>
                {formatMinor(sumTotals.owe, summaryCcy, locale)}
              </Text>
```

Change:

```tsx
                                {formatMinorWithSymbol(
                                  Math.abs(s.netMinor),
                                  s.currency || defaultCcy,
                                )}
```

to:

```tsx
                                {formatMinorWithSymbol(
                                  Math.abs(s.netMinor),
                                  s.currency || defaultCcy,
                                  locale,
                                )}
```

- [ ] **Step 3: `GroupsScreen.tsx`** (`locale` already in scope via `const { t, locale, isRTL } = useLocale();` at line 320)

Change:

```tsx
                      {sign}
                      {formatMinorWithSymbol(Math.abs(net), row.currency)}
```

to:

```tsx
                      {sign}
                      {formatMinorWithSymbol(Math.abs(net), row.currency, locale)}
```

Change:

```tsx
                      <Text style={styles.summaryOwed}>
                        {formatMinorWithSymbol(row.owedMinor, row.currency)}
```

to:

```tsx
                      <Text style={styles.summaryOwed}>
                        {formatMinorWithSymbol(row.owedMinor, row.currency, locale)}
```

Change:

```tsx
                      <Text style={styles.summaryOwe}>
                        {formatMinorWithSymbol(row.owesMinor, row.currency)}
```

to:

```tsx
                      <Text style={styles.summaryOwe}>
                        {formatMinorWithSymbol(row.owesMinor, row.currency, locale)}
```

Change:

```tsx
                      {formatMinorWithSymbol(
                        Math.abs(item.myBalanceMinor),
                        item.currency,
                      )}
```

to:

```tsx
                      {formatMinorWithSymbol(
                        Math.abs(item.myBalanceMinor),
                        item.currency,
                        locale,
                      )}
```

Change:

```tsx
                  <Text style={styles.ccyRowCode}>{row.currency}</Text>
                    {formatMinorWithSymbol(
                      row.owedMinor - row.owesMinor,
                      row.currency,
                    )}
```

to:

```tsx
                  <Text style={styles.ccyRowCode}>{row.currency}</Text>
                    {formatMinorWithSymbol(
                      row.owedMinor - row.owesMinor,
                      row.currency,
                      locale,
                    )}
```

- [ ] **Step 4: `AddExpenseScreen.tsx`** (`appLocale` already in scope via `const { t, locale: appLocale, isRTL } = useLocale();` at line 1459 — reachable from every call site below since they're all inside this one component's body)

Change:

```tsx
          ? t("addExpense.equalSummaryEach", {
              amount: formatMinorWithSymbol(each, currency),
            })
```

to:

```tsx
          ? t("addExpense.equalSummaryEach", {
              amount: formatMinorWithSymbol(each, currency, appLocale),
            })
```

Change:

```tsx
      const sumLabel = formatMinorWithSymbol(sum, currency);
      const targetLabel = formatMinorWithSymbol(target, currency);
```

to:

```tsx
      const sumLabel = formatMinorWithSymbol(sum, currency, appLocale);
      const targetLabel = formatMinorWithSymbol(target, currency, appLocale);
```

Change:

```tsx
          suffix = ` · ${t("addExpense.exactRemaining", {
            amount: formatMinorWithSymbol(diff, currency),
          })}`;
```

to:

```tsx
          suffix = ` · ${t("addExpense.exactRemaining", {
            amount: formatMinorWithSymbol(diff, currency, appLocale),
          })}`;
```

Change:

```tsx
          suffix = ` · ${t("addExpense.exactOver", {
            amount: formatMinorWithSymbol(-diff, currency),
          })}`;
```

to:

```tsx
          suffix = ` · ${t("addExpense.exactOver", {
            amount: formatMinorWithSymbol(-diff, currency, appLocale),
          })}`;
```

Change:

```tsx
          ? t("addExpense.sharesSummaryLine", {
              count: String(sum),
              amount: formatMinorWithSymbol(perShare, currency),
            })
```

to:

```tsx
          ? t("addExpense.sharesSummaryLine", {
              count: String(sum),
              amount: formatMinorWithSymbol(perShare, currency, appLocale),
            })
```

Change:

```tsx
        status = t("addExpense.summaryAdjustOver", {
          amount: formatMinorWithSymbol(sum, currency),
        });
```

to:

```tsx
        status = t("addExpense.summaryAdjustOver", {
          amount: formatMinorWithSymbol(sum, currency, appLocale),
        });
```

Change:

```tsx
        status = t("addExpense.summaryAdjustUnder", {
          amount: formatMinorWithSymbol(-sum, currency),
        });
```

to:

```tsx
        status = t("addExpense.summaryAdjustUnder", {
          amount: formatMinorWithSymbol(-sum, currency, appLocale),
        });
```

Change:

```tsx
                <Text style={styles.amountSymbol}>{currencySymbol(currency)}</Text>
```

to:

```tsx
                <Text style={styles.amountSymbol}>{currencySymbol(currency, appLocale)}</Text>
```

Change:

```tsx
                    const each = formatMinorWithSymbol(perPerson, currency);
```

to:

```tsx
                    const each = formatMinorWithSymbol(perPerson, currency, appLocale);
```

Change:

```tsx
                    preview = included
                      ? formatMinorWithSymbol(
                          liveEqualAdjustShares?.get(m.id) ?? 0,
                          currency,
                        )
                      : t("addExpense.notIncluded");
```

to:

```tsx
                    preview = included
                      ? formatMinorWithSymbol(
                          liveEqualAdjustShares?.get(m.id) ?? 0,
                          currency,
                          appLocale,
                        )
                      : t("addExpense.notIncluded");
```

Change:

```tsx
                    preview = formatMinorWithSymbol(minor, currency);
```

to:

```tsx
                    preview = formatMinorWithSymbol(minor, currency, appLocale);
```

Change:

```tsx
                    preview = formatMinorWithSymbol(
                      Math.round((amt * pct) / 100),
                      currency,
                    );
```

to:

```tsx
                    preview = formatMinorWithSymbol(
                      Math.round((amt * pct) / 100),
                      currency,
                      appLocale,
                    );
```

There are **two identical occurrences** of the following line (one inside the `splitMode === "exact"` block, one inside the `splitMode === "adjust"` block) — change **both**:

```tsx
                            {currencySymbol(currency)}
```

to:

```tsx
                            {currencySymbol(currency, appLocale)}
```

- [ ] **Step 5: `ActivityScreen.tsx`** (`locale` already in scope via `const { t, locale, isRTL } = useLocale();` at line 275)

Change:

```tsx
    if (item.kind === "expense") {
      const amount = formatMinorWithSymbol(item.amountMinor, item.currency);
```

to:

```tsx
    if (item.kind === "expense") {
      const amount = formatMinorWithSymbol(item.amountMinor, item.currency, locale);
```

Change:

```tsx
    // settlement
    const amount = formatMinorWithSymbol(item.amountMinor, item.currency);
```

to:

```tsx
    // settlement
    const amount = formatMinorWithSymbol(item.amountMinor, item.currency, locale);
```

- [ ] **Step 6: `ReceiptAssignDnDModal.tsx`**

Change:

```tsx
  const { t, isRTL } = useLocale();
```

to:

```tsx
  const { t, locale, isRTL } = useLocale();
```

Change:

```tsx
                    <Text style={styles.itemAmt}>
                      {formatMinor(
                        majorFloatToMinor(ln.amountMajor, currency),
                        currency,
                      )}
                    </Text>
```

to:

```tsx
                    <Text style={styles.itemAmt}>
                      {formatMinor(
                        majorFloatToMinor(ln.amountMajor, currency),
                        currency,
                        locale,
                      )}
                    </Text>
```

Change:

```tsx
                    <Text style={styles.personTotal}>
                      {formatMinor(total, currency)}
                    </Text>
```

to:

```tsx
                    <Text style={styles.personTotal}>
                      {formatMinor(total, currency, locale)}
                    </Text>
```

Change:

```tsx
                          <Text style={styles.assignedChipAmt}>
                            {formatMinor(
                              majorFloatToMinor(ln.amountMajor, currency),
                              currency,
                            )}
                          </Text>
```

to:

```tsx
                          <Text style={styles.assignedChipAmt}>
                            {formatMinor(
                              majorFloatToMinor(ln.amountMajor, currency),
                              currency,
                              locale,
                            )}
                          </Text>
```

Change:

```tsx
            <Text style={styles.itemAmt}>
              {formatMinor(
                majorFloatToMinor(drag.amountMajor, currency),
                currency,
              )}
            </Text>
```

to:

```tsx
            <Text style={styles.itemAmt}>
              {formatMinor(
                majorFloatToMinor(drag.amountMajor, currency),
                currency,
                locale,
              )}
            </Text>
```

- [ ] **Step 7: `AiReceiptScreen.tsx`**

Change:

```tsx
  const { t, isRTL } = useLocale();
```

to:

```tsx
  const { t, locale, isRTL } = useLocale();
```

Change:

```tsx
  const mismatch =
    modelTotalMinor !== null && modelTotalMinor !== aggregateMinor
      ? formatMinor(Math.abs(modelTotalMinor - aggregateMinor), groupCurrency)
      : null;
```

to:

```tsx
  const mismatch =
    modelTotalMinor !== null && modelTotalMinor !== aggregateMinor
      ? formatMinor(Math.abs(modelTotalMinor - aggregateMinor), groupCurrency, locale)
      : null;
```

Change:

```tsx
                            {formatMinor(memberOwed, groupCurrency)}
```

to:

```tsx
                            {formatMinor(memberOwed, groupCurrency, locale)}
```

Change:

```tsx
              {t("aiReceipt.assignedTotal", {
                amount: formatMinor(aggregateMinor, groupCurrency),
              })}
```

to:

```tsx
              {t("aiReceipt.assignedTotal", {
                amount: formatMinor(aggregateMinor, groupCurrency, locale),
              })}
```

Change:

```tsx
                  <Text style={styles.proposedAmt}>
                    {formatMinor(
                      majorFloatToMinor(item.amountMajor, groupCurrency),
                      groupCurrency,
                    )}
                  </Text>
```

to:

```tsx
                  <Text style={styles.proposedAmt}>
                    {formatMinor(
                      majorFloatToMinor(item.amountMajor, groupCurrency),
                      groupCurrency,
                      locale,
                    )}
                  </Text>
```

Change:

```tsx
          <Text style={styles.dragGhostAmt}>
            {formatMinor(
              majorFloatToMinor(drag.amountMajor, groupCurrency),
              groupCurrency,
            )}
          </Text>
```

to:

```tsx
          <Text style={styles.dragGhostAmt}>
            {formatMinor(
              majorFloatToMinor(drag.amountMajor, groupCurrency),
              groupCurrency,
              locale,
            )}
          </Text>
```

- [ ] **Step 8: `GroupTotalsBreakdown.tsx`**

Change:

```tsx
export function GroupTotalsBreakdown({ groupId, currency }: Props) {
  const { colors } = useTheme();
  const { t } = useLocale();
```

to:

```tsx
export function GroupTotalsBreakdown({ groupId, currency }: Props) {
  const { colors } = useTheme();
  const { t, locale } = useLocale();
```

There are **two identical occurrences** of the following block (one in the top-categories list, one in the "show all" expanded list) — change **both**:

```tsx
                  <Text style={styles.catAmt}>
                    {formatMinor(r.total_minor, currency)}
                  </Text>
```

to:

```tsx
                  <Text style={styles.catAmt}>
                    {formatMinor(r.total_minor, currency, locale)}
                  </Text>
```

- [ ] **Step 9: Typecheck and run the full suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 10: Manual smoke check**

Start the app (Expo dev server), switch the language to Farsi in Settings, and confirm: an IRT/IRR group's balances on Groups, Group Detail, Friends, Account, Activity, and Add Expense all show `تومان`/`ریال` instead of `IRT`/`IRR`; switch back to English/leave a non-Farsi group and confirm those still show the raw ISO code as before.

- [ ] **Step 11: Commit**

```bash
git add src/screens/AccountScreen.tsx src/screens/FriendsScreen.tsx src/screens/GroupsScreen.tsx src/screens/AddExpenseScreen.tsx src/screens/ActivityScreen.tsx src/screens/ReceiptAssignDnDModal.tsx src/screens/AiReceiptScreen.tsx src/components/GroupTotalsBreakdown.tsx
git commit -m "feat(i18n): show Farsi IRT/IRR currency labels across remaining screens"
```

## Self-Review Notes

- **Spec coverage:** all 12 call sites named in the design doc are covered — Task 1 (core), Task 2 (`notifications.ts`), Task 3 (`groupExport.ts` + `GroupDetailScreen.tsx`, which also covers the design doc's `GroupDetailScreen.tsx` entry), Task 4 (the other 8 files). `tallyRepo.ts` needed no changes (confirmed: it only re-exports `formatMinor`, never calls it) — its one barrel consumer, `ReceiptAssignDnDModal.tsx`, is handled in Task 4 Step 6.
- **Type consistency:** every call site passes either the component's own `locale` (or `appLocale` alias in `AddExpenseScreen.tsx`) or threads a new `locale?: AppLocale` parameter — no mismatched names between tasks.
- **Placeholder scan:** every step shows the literal before/after code; none says "similar to above" or "add appropriate handling" without showing the actual diff, including the two files (`AddExpenseScreen.tsx`, `GroupTotalsBreakdown.tsx`) with duplicate-looking lines that appear more than once in the file — each is called out explicitly as "two identical occurrences" so both get changed, not just the first.
- **Ripple correctly scoped:** `getNotificationsUnreadCount`, `useNotificationsUnreadCount`, and `GroupsListHeader.tsx` are explicitly excluded in Task 2 with the reasoning (count-only, never renders currency text) — avoids an unnecessary 3-file ripple the original recon considered.
