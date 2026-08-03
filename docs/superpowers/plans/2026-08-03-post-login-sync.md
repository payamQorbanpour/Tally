# Post-Login Sync & Native Permission Prompts — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync automatically right after login when the account has sync enabled, without silently deleting data the user created on this device — and make every OS permission request surface the native system dialog first.

**Architecture:** A nullable `profiles.cloud_sync_enabled` column becomes the account-level default; the existing device-local `app_settings.cloud_sync_user_enabled` becomes tri-state (`null` = never chosen here) and overrides it. Turning sync on — from login *or* from the Account toggle — routes through one gate in `setCloudSyncUserEnabled` that first checks for local rows absent from the cloud and prompts before the destructive pull. Separately, `QrScanScreen` is changed to request camera permission on mount so the OS dialog precedes the app's custom denial panel.

**Tech Stack:** React Native + Expo (new architecture), TypeScript, expo-sqlite, Supabase (`@supabase/supabase-js` + Postgres RLS), vitest, expo-camera / expo-image-picker / expo-audio.

**Source spec:** `docs/superpowers/specs/2026-08-03-post-login-sync-design.md`

## Global Constraints

- **Locales:** every user-facing string needs keys in all three locales — `en`, `fa`, `es` — plus an entry in the `MessageTree` type. All three live in `src/i18n/translations.ts` (type at the top, `en` at :1233, `fa` at :2259, `es` at :3286).
- **Interpolation:** `t()` templates use `{{name}}` placeholders, called as `t("a.b", { name })`.
- **RTL:** `fa` is RTL. Components read `isRTL` from `useLocale()` and build styles via `useMemo(() => buildStyles(colors, isRTL), [colors, isRTL])`.
- **Column grants:** any new client-written column on `public.profiles` requires an explicit `grant insert (col)` **and** `grant update (col)` — `supabase/migrations/20260502000000_lock_profiles_entitlements.sql:20-27` revoked table-wide INSERT/UPDATE from `authenticated`.
- **Best-effort network:** new Supabase reads wrap in the existing `guardNetworkCall` from `src/core/networkGuard` and swallow failures — **except** merge-marking, which must abort the sync on failure.
- **Tests:** vitest, `npm test`. Only `src/**/*.test.ts` and `supabase/functions/**/*.test.ts` are collected (`vitest.config.ts:9`). Environment is `node` — test files must not import React Native, `expo-sqlite`, or `@supabase/supabase-js`.
- **Lint:** run `npm run lint` (`expo lint`) on every file changed before committing. This is a standing rule from the user's global CLAUDE.md.
- **Terminology:** the account-level column is `cloud_sync_enabled`; the device-local setting key is `cloud_sync_user_enabled`. They are different things — do not conflate them.

**One refinement to the spec:** the spec named the toggle's return type `EnableSyncResult = "enabled" | "ineligible" | "dismissed"`. Since the same function also handles *disabling*, this plan uses `"applied"` in place of `"enabled"`. Behavior is identical.

---

### Task 1: Migration — account-level sync preference column

**Files:**
- Create: `supabase/migrations/20260803000000_profile_cloud_sync_pref.sql`

**Interfaces:**
- Consumes: nothing
- Produces: `public.profiles.cloud_sync_enabled boolean` (nullable), readable and writable by `authenticated` for the caller's own row

- [ ] **Step 1: Read the existing grant migration so the new grants match its style**

Run: `cat supabase/migrations/20260502000000_lock_profiles_entitlements.sql`

You are looking at lines 20-27, which revoke table-wide INSERT/UPDATE and re-grant five named columns. Postgres column grants are additive, so the new file only needs to add its own column — it must not repeat or re-revoke anything.

- [ ] **Step 2: Write the migration**

```sql
-- Account-level default for the cloud-sync toggle.
--
-- The per-device preference lives in local SQLite (`app_settings`,
-- key `cloud_sync_user_enabled`) and stays authoritative for the device it
-- was set on — a user can keep sync on for their phone and off on a shared
-- laptop. This column is only the *default* a device inherits when it has
-- never made an explicit choice, so a fresh install signing in to an
-- existing account starts syncing without hunting for the toggle.
--
-- NULL means the account has never expressed a preference.
--
-- The grants are required, not decorative: `20260502000000_lock_profiles_
-- entitlements.sql` revoked table-wide INSERT/UPDATE from `authenticated`
-- and re-granted only named columns. Column grants are additive, so this
-- widens that set without disturbing it. Without them, client writes to
-- this column fail with "permission denied for table profiles".

alter table public.profiles
  add column if not exists cloud_sync_enabled boolean;

grant insert (cloud_sync_enabled) on public.profiles to authenticated;
grant update (cloud_sync_enabled) on public.profiles to authenticated;
```

- [ ] **Step 3: Verify the SQL parses and applies**

Run: `npx supabase db reset` if you have a local Supabase running, otherwise `npx supabase db lint`.

Expected: no errors. If neither command is available in this environment, verify by inspection that the file contains exactly one `alter table` and two `grant` statements, and skip to Step 4 — the migration is applied by the deploy pipeline, not by this plan.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260803000000_profile_cloud_sync_pref.sql
git commit -m "feat(sync): add profiles.cloud_sync_enabled account default"
```

---

### Task 2: Preference resolution and post-login decision logic

**Files:**
- Create: `src/sync/postLoginSync.ts`
- Test: `src/sync/postLoginSync.test.ts`

**Interfaces:**
- Consumes: nothing (pure module — no imports at all, so it is safe under vitest's `node` environment)
- Produces:
  - `type LocalOnlyCounts = { groupCount: number; expenseCount: number }`
  - `type MergeChoice = "merge" | "cloud-only" | "dismiss"`
  - `type EnableSyncResult = "applied" | "ineligible" | "dismissed"`
  - `type ResolvedSyncPref = { kind: "off" } | { kind: "on"; inherited: boolean }`
  - `type LoginSyncAction = { kind: "inherit-blocked" } | { kind: "sync" } | { kind: "confirm-merge"; localOnly: LocalOnlyCounts }`
  - `resolveSyncPref({ accountPref, localPref }): ResolvedSyncPref`
  - `decidePostLoginSync({ eligible, localOnly }): LoginSyncAction`
  - `parseLocalSyncPref(raw: string | null | undefined): boolean | null`

- [ ] **Step 1: Write the failing test**

Create `src/sync/postLoginSync.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  decidePostLoginSync,
  parseLocalSyncPref,
  resolveSyncPref,
} from "./postLoginSync";

describe("parseLocalSyncPref", () => {
  it("treats a missing key as 'never chosen on this device'", () => {
    expect(parseLocalSyncPref(null)).toBe(null);
    expect(parseLocalSyncPref(undefined)).toBe(null);
    expect(parseLocalSyncPref("")).toBe(null);
  });

  it("reads both stored truthy spellings", () => {
    expect(parseLocalSyncPref("1")).toBe(true);
    expect(parseLocalSyncPref("true")).toBe(true);
  });

  it("treats anything else as an explicit off", () => {
    expect(parseLocalSyncPref("0")).toBe(false);
    expect(parseLocalSyncPref("false")).toBe(false);
  });
});

describe("resolveSyncPref", () => {
  it("inherits the account default when the device has never chosen", () => {
    expect(resolveSyncPref({ accountPref: true, localPref: null })).toEqual({
      kind: "on",
      inherited: true,
    });
    expect(resolveSyncPref({ accountPref: false, localPref: null })).toEqual({
      kind: "off",
    });
    expect(resolveSyncPref({ accountPref: null, localPref: null })).toEqual({
      kind: "off",
    });
  });

  // The shared-laptop guarantee: a device the user deliberately turned sync
  // off on must never be switched back on by the account default.
  it("never overrides an explicit local off", () => {
    expect(resolveSyncPref({ accountPref: true, localPref: false })).toEqual({
      kind: "off",
    });
  });

  it("honours an explicit local on even when the account says off", () => {
    expect(resolveSyncPref({ accountPref: false, localPref: true })).toEqual({
      kind: "on",
      inherited: false,
    });
    expect(resolveSyncPref({ accountPref: null, localPref: true })).toEqual({
      kind: "on",
      inherited: false,
    });
  });

  it("marks inherited only when the value came from the account", () => {
    expect(resolveSyncPref({ accountPref: true, localPref: true })).toEqual({
      kind: "on",
      inherited: false,
    });
  });
});

describe("decidePostLoginSync", () => {
  it("inherits the preference but runs no sync when the device is blocked", () => {
    expect(decidePostLoginSync({ eligible: false, localOnly: null })).toEqual({
      kind: "inherit-blocked",
    });
    // Blocked wins even when there is data at risk — we are not syncing at all.
    expect(
      decidePostLoginSync({
        eligible: false,
        localOnly: { groupCount: 3, expenseCount: 9 },
      }),
    ).toEqual({ kind: "inherit-blocked" });
  });

  it("syncs straight away when nothing local is at risk", () => {
    expect(decidePostLoginSync({ eligible: true, localOnly: null })).toEqual({
      kind: "sync",
    });
    expect(
      decidePostLoginSync({
        eligible: true,
        localOnly: { groupCount: 0, expenseCount: 0 },
      }),
    ).toEqual({ kind: "sync" });
  });

  it("asks before syncing when local-only rows would be deleted", () => {
    expect(
      decidePostLoginSync({
        eligible: true,
        localOnly: { groupCount: 2, expenseCount: 0 },
      }),
    ).toEqual({
      kind: "confirm-merge",
      localOnly: { groupCount: 2, expenseCount: 0 },
    });
    // Expenses alone are enough — a group can be shared while its expenses aren't.
    expect(
      decidePostLoginSync({
        eligible: true,
        localOnly: { groupCount: 0, expenseCount: 5 },
      }),
    ).toEqual({
      kind: "confirm-merge",
      localOnly: { groupCount: 0, expenseCount: 5 },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/postLoginSync.test.ts`

Expected: FAIL — `Failed to resolve import "./postLoginSync"`.

- [ ] **Step 3: Write the implementation**

Create `src/sync/postLoginSync.ts`:

```ts
/**
 * Pure decision logic for "should we sync right after login, and is anything
 * on this device at risk if we do?".
 *
 * Deliberately free of imports so it runs under vitest's `node` environment
 * and can be reasoned about without a database, a network, or React. All the
 * I/O lives in `DatabaseContext`, which calls these functions in order:
 *
 *   authLinkReady → fetchAccountCloudSyncPref → resolveSyncPref
 *     → persist the pref locally when it was inherited
 *     → if on and eligible: collectLocalOnlyRowIds → decidePostLoginSync → act
 */

/** Rows that exist on this device but not in the signed-in account. */
export type LocalOnlyCounts = {
  groupCount: number;
  expenseCount: number;
};

/** What the user picked in the pre-sync merge prompt. */
export type MergeChoice = "merge" | "cloud-only" | "dismiss";

/**
 * Outcome of `setCloudSyncUserEnabled`. `"dismissed"` means the user backed
 * out of the merge prompt — the caller must leave the toggle visually off and
 * the stored preference untouched.
 */
export type EnableSyncResult = "applied" | "ineligible" | "dismissed";

export type ResolvedSyncPref =
  | { kind: "off" }
  /** `inherited` is true when the value came from the account, not this device. */
  | { kind: "on"; inherited: boolean };

/**
 * Read the tri-state device preference out of its stored string form.
 * `null` means the key is absent — this device has never chosen, so it should
 * inherit the account default. That is distinct from an explicit `"0"`.
 */
export function parseLocalSyncPref(
  raw: string | null | undefined,
): boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  return raw === "1" || raw === "true";
}

/**
 * Device choice beats account default, always. This is what keeps sync off on
 * a shared laptop the user deliberately turned it off on.
 */
export function resolveSyncPref(input: {
  accountPref: boolean | null;
  localPref: boolean | null;
}): ResolvedSyncPref {
  const { accountPref, localPref } = input;
  if (localPref !== null) {
    return localPref ? { kind: "on", inherited: false } : { kind: "off" };
  }
  return accountPref === true
    ? { kind: "on", inherited: true }
    : { kind: "off" };
}

export type LoginSyncAction =
  /** Sync is wanted but this device can't yet (not premium / email unconfirmed). */
  | { kind: "inherit-blocked" }
  | { kind: "sync" }
  | { kind: "confirm-merge"; localOnly: LocalOnlyCounts };

/** Call only when `resolveSyncPref` returned `{ kind: "on" }`. */
export function decidePostLoginSync(input: {
  eligible: boolean;
  /** `null` when the query was skipped or found nothing. */
  localOnly: LocalOnlyCounts | null;
}): LoginSyncAction {
  if (!input.eligible) return { kind: "inherit-blocked" };
  const lo = input.localOnly;
  if (lo && (lo.groupCount > 0 || lo.expenseCount > 0)) {
    return { kind: "confirm-merge", localOnly: lo };
  }
  return { kind: "sync" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sync/postLoginSync.test.ts`

Expected: PASS — 10 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/sync/postLoginSync.ts src/sync/postLoginSync.test.ts
git commit -m "feat(sync): add post-login sync preference resolution"
```

---

### Task 3: Fetch and push the account-level sync preference

**Files:**
- Modify: `src/sync/profilePrefsSync.ts` (append; also update the doc comment at :14-18)

**Interfaces:**
- Consumes: Task 1's `profiles.cloud_sync_enabled` column
- Produces:
  - `fetchAccountCloudSyncPref(): Promise<boolean | null>`
  - `pushAccountCloudSyncPref(enabled: boolean): Promise<void>`

- [ ] **Step 1: Update the doc comment on `ProfilePrefsPatch`**

The comment at `src/sync/profilePrefsSync.ts:14-18` currently says the sync toggle is intentionally excluded and device-local. That is still true of `ProfilePrefsPatch`, but the file now also carries an account-level default, so the comment must explain the two-tier model rather than contradict the new functions below it.

Replace lines 14-18 with:

```ts
/**
 * Preferences synced to the remote `public.profiles` row. The cloud sync
 * toggle is intentionally **not** part of this patch — it's device-local so a
 * user can have sync on their phone and off on a shared laptop, and these
 * fields are mirrored in both directions on every sign-in.
 *
 * The account-level *default* for that toggle does live in `profiles`, as
 * `cloud_sync_enabled` — see `fetchAccountCloudSyncPref` at the bottom of this
 * file. It is a fallback for devices that have never chosen, not a mirror, so
 * it deliberately stays out of this type.
 */
```

- [ ] **Step 2: Append the two functions to the end of the file**

```ts
/**
 * Read the account-level default for the cloud-sync toggle. `null` means the
 * account has never expressed a preference (or we couldn't reach Supabase) —
 * callers fall back to the device-local setting.
 *
 * Best-effort: a network failure returns `null` rather than throwing, so a
 * flaky connection can never block sign-in.
 */
export async function fetchAccountCloudSyncPref(): Promise<boolean | null> {
  if (!isSignedIn()) return null;
  const client = createTallySupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await guardNetworkCall(() =>
      client
        .from("profiles")
        .select("cloud_sync_enabled")
        .eq("id", getLocalUserId())
        .maybeSingle(),
    );
    if (error || !data) return null;
    const raw = (data as { cloud_sync_enabled?: boolean | null })
      .cloud_sync_enabled;
    return typeof raw === "boolean" ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Record this device's explicit toggle choice as the account default, so the
 * user's next fresh install inherits it. Called only from
 * `setCloudSyncUserEnabled` — never on sign-in, which would let a device that
 * merely inherited the value echo it back and defeat the tri-state.
 *
 * Best-effort: failures are swallowed. The local preference is authoritative
 * for this device either way.
 */
export async function pushAccountCloudSyncPref(
  enabled: boolean,
): Promise<void> {
  if (!isSignedIn()) return;
  const client = createTallySupabaseClient();
  if (!client) return;
  try {
    await guardNetworkCall(() =>
      client.from("profiles").upsert(
        {
          id: getLocalUserId(),
          cloud_sync_enabled: enabled,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      ),
    );
  } catch {
    /* best-effort */
  }
}
```

No new imports are needed — `guardNetworkCall`, `createTallySupabaseClient`, `getLocalUserId`, and `isSignedIn` are all already in scope at the top of this file.

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: no errors in `src/sync/profilePrefsSync.ts`. (Pre-existing errors elsewhere in the repo, if any, are not yours to fix.)

- [ ] **Step 4: Lint and commit**

```bash
npm run lint
git add src/sync/profilePrefsSync.ts
git commit -m "feat(sync): read and write the account-level cloud sync default"
```

---

### Task 4: Detect and protect local-only rows

**Files:**
- Create: `src/sync/localOnlyRows.ts`
- Test: `src/sync/localOnlyRows.test.ts`
- Modify: `src/sync/supabaseSync.ts` (export the table-name type at :43; append the I/O wrappers)

**Why a separate file for the pure part:** `supabaseSync.ts` imports `expo-sqlite` and `@supabase/supabase-js`, so vitest's `node` environment cannot load it. The set-difference logic goes in its own import-free module so it can be tested; the I/O wrapper stays in `supabaseSync.ts`.

**Interfaces:**
- Consumes: `TABLE_DELETE_ORDER`, `getLocalUserId` (both already in `supabaseSync.ts`)
- Produces:
  - From `src/sync/localOnlyRows.ts`: `diffLocalOnlyIds(localIds: string[], remoteIds: Set<string>): string[]`
  - From `src/sync/supabaseSync.ts`:
    - `type SyncedTableName` — the union of the eight table names
    - `type LocalOnlyRowIds = { byTable: Record<SyncedTableName, string[]>; groupCount: number; expenseCount: number }`
    - `collectLocalOnlyRowIds(sb, db): Promise<LocalOnlyRowIds>`
    - `markRowsForUpload(db, byTable): Promise<void>`

- [ ] **Step 1: Write the failing test**

Create `src/sync/localOnlyRows.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { diffLocalOnlyIds } from "./localOnlyRows";

describe("diffLocalOnlyIds", () => {
  it("keeps only the local ids the account doesn't have", () => {
    expect(diffLocalOnlyIds(["a", "b", "c"], new Set(["b"]))).toEqual([
      "a",
      "c",
    ]);
  });

  it("returns nothing when every local row is already in the account", () => {
    expect(diffLocalOnlyIds(["a", "b"], new Set(["a", "b", "z"]))).toEqual([]);
  });

  it("returns everything when the account is empty", () => {
    expect(diffLocalOnlyIds(["a", "b"], new Set())).toEqual(["a", "b"]);
  });

  it("handles an empty local table", () => {
    expect(diffLocalOnlyIds([], new Set(["a"]))).toEqual([]);
  });

  // Marking a row that DOES exist remotely would make `shouldApplyRemoteRow`
  // skip a legitimately newer remote version during the pull, after which the
  // push would overwrite the server with stale local data. Precision is the
  // whole point of this function.
  it("never includes an id present on both sides", () => {
    const out = diffLocalOnlyIds(["shared", "local"], new Set(["shared"]));
    expect(out).not.toContain("shared");
    expect(out).toEqual(["local"]);
  });

  it("preserves duplicates rather than silently deduping", () => {
    expect(diffLocalOnlyIds(["a", "a"], new Set())).toEqual(["a", "a"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/sync/localOnlyRows.test.ts`

Expected: FAIL — `Failed to resolve import "./localOnlyRows"`.

- [ ] **Step 3: Write the pure module**

Create `src/sync/localOnlyRows.ts`:

```ts
/**
 * Set difference behind the pre-sync merge check, split into its own
 * import-free module so it is testable under vitest's `node` environment —
 * `supabaseSync.ts` pulls in `expo-sqlite` and `@supabase/supabase-js`, which
 * cannot load there.
 *
 * Returns the ids present locally but absent from the account: exactly the
 * rows `deleteLocalNotInRemote` would delete on the next pull.
 */
export function diffLocalOnlyIds(
  localIds: string[],
  remoteIds: Set<string>,
): string[] {
  return localIds.filter((id) => !remoteIds.has(id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/sync/localOnlyRows.test.ts`

Expected: PASS — 6 tests.

- [ ] **Step 5: Export the table-name type from `supabaseSync.ts`**

Change line 43 of `src/sync/supabaseSync.ts` from:

```ts
type SyncedTable = (typeof TABLE_UPSERT_ORDER)[number];
```

to:

```ts
type SyncedTable = (typeof TABLE_UPSERT_ORDER)[number];
/** Public alias — consumers outside this module need it for `Record` keys. */
export type SyncedTableName = SyncedTable;
```

Add the new import after line 3:

```ts
import { diffLocalOnlyIds } from "./localOnlyRows";
```

- [ ] **Step 6: Append the I/O wrappers to the end of `supabaseSync.ts`**

```ts
/** Ids present on this device but absent from the signed-in account. */
export type LocalOnlyRowIds = {
  byTable: Record<SyncedTableName, string[]>;
  groupCount: number;
  expenseCount: number;
};

/**
 * Find the local rows a pull would delete — everything not present in the
 * account. Iterates `TABLE_DELETE_ORDER` specifically because that is the list
 * `deleteLocalNotInRemote` walks, so the two stay in agreement by construction.
 *
 * One `select id` per table: cheap next to the `select("*")` that
 * `pullAllFromSupabase` runs moments later.
 *
 * Throws on a Supabase error. The caller must treat that as "don't sync" —
 * syncing without knowing what is at risk is the data-loss path.
 */
export async function collectLocalOnlyRowIds(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<LocalOnlyRowIds> {
  const myId = getLocalUserId();
  const byTable = {} as Record<SyncedTableName, string[]>;

  for (const t of TABLE_DELETE_ORDER) {
    const { data, error } = await sb.from(t).select("id");
    if (error) throw new Error(`Supabase list ${t}: ${error.message}`);
    const remoteIds = new Set(
      (data as { id: string }[] | null | undefined)?.map((r) => r.id) ?? [],
    );
    const rows = await db.getAllAsync<{ id: string }>(`SELECT id FROM ${t}`);
    const localIds = rows
      .map((r) => r.id)
      // A pull never deletes the caller's own `users` row
      // (`deleteLocalNotInRemote` skips it), so it is never "at risk".
      .filter((id) => !(t === "users" && id === myId));
    byTable[t] = diffLocalOnlyIds(localIds, remoteIds);
  }

  return {
    byTable,
    groupCount: byTable.groups.length,
    expenseCount: byTable.expenses.length,
  };
}

/**
 * Protect the given rows across the next sync by listing them in
 * `sync_cloud_insert_pending`. That table is already honoured on both sides:
 * `deleteLocalNotInRemote` skips those ids (so the pull won't delete them),
 * `shouldApplyRemoteRow` skips them (so the pull won't clobber them), and
 * `pushMergedToSupabase` uploads them and then clears the table.
 *
 * Pass only ids that are genuinely absent remotely — see `collectLocalOnlyRowIds`.
 *
 * Throws on failure. The caller must abort the sync rather than proceeding
 * with the rows unprotected.
 */
export async function markRowsForUpload(
  db: SQLiteDatabase,
  byTable: Record<SyncedTableName, string[]>,
): Promise<void> {
  const ids = Object.values(byTable).flat();
  if (ids.length === 0) return;
  await db.execAsync("BEGIN");
  try {
    for (const id of ids) {
      await db.runAsync(
        `INSERT OR IGNORE INTO sync_cloud_insert_pending (id) VALUES (?)`,
        id,
      );
    }
    await db.execAsync("COMMIT");
  } catch (e) {
    try {
      await db.execAsync("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}
```

- [ ] **Step 7: Verify the whole suite and types still pass**

Run: `npm test && npx tsc --noEmit`

Expected: all tests PASS; no new type errors.

- [ ] **Step 8: Lint and commit**

```bash
npm run lint
git add src/sync/localOnlyRows.ts src/sync/localOnlyRows.test.ts src/sync/supabaseSync.ts
git commit -m "feat(sync): detect and protect rows absent from the account"
```

---

### Task 5: Translation keys for the merge prompt

**Files:**
- Modify: `src/i18n/translations.ts` (`MessageTree` type, then the `en` / `fa` / `es` objects)

**Interfaces:**
- Consumes: nothing
- Produces: the `syncMerge.*` key group, used by Task 6

**Note:** the working tree already carries uncommitted changes to this file. Add to it; do not revert anything.

- [ ] **Step 1: Add the type block**

In the `MessageTree` type, immediately after the `qrScan: { … }` block (which starts at :1012), add:

```ts
  /** Pre-sync prompt shown when this device has data the account doesn't. */
  syncMerge: {
    title: string;
    /** Carries `{{email}}`. */
    body: string;
    /** Carries `{{groups}}` and `{{expenses}}`. */
    counts: string;
    mergeCta: string;
    cloudOnlyCta: string;
    cloudOnlyWarning: string;
    dismissCta: string;
  };
```

`counts` is a separate string from `body` on purpose: it keeps raw numbers out of a sentence, which sidesteps plural agreement in all three languages.

- [ ] **Step 2: Add the `en` strings**

In `export const en: MessageTree` (starts :1233), after its `qrScan: { … }` block:

```ts
  syncMerge: {
    title: "Merge this device's data?",
    body:
      "This device has groups and expenses that aren't in your {{email}} account yet.",
    counts: "{{groups}} groups · {{expenses}} expenses",
    mergeCta: "Merge into my account",
    cloudOnlyCta: "Use cloud data only",
    cloudOnlyWarning:
      "These groups and expenses will be deleted from this device.",
    dismissCta: "Not now",
  },
```

- [ ] **Step 3: Add the `fa` strings**

In `export const fa: MessageTree` (starts :2259), in the same position:

```ts
  syncMerge: {
    title: "داده‌های این دستگاه ادغام شود؟",
    body:
      "در این دستگاه گروه‌ها و هزینه‌هایی هست که هنوز در حساب {{email}} شما وجود ندارد.",
    counts: "{{groups}} گروه · {{expenses}} هزینه",
    mergeCta: "ادغام در حساب من",
    cloudOnlyCta: "فقط از داده‌های ابری استفاده کن",
    cloudOnlyWarning: "این گروه‌ها و هزینه‌ها از این دستگاه حذف می‌شوند.",
    dismissCta: "فعلاً نه",
  },
```

- [ ] **Step 4: Add the `es` strings**

In `export const es: MessageTree` (starts :3286), in the same position:

```ts
  syncMerge: {
    title: "¿Combinar los datos de este dispositivo?",
    body:
      "Este dispositivo tiene grupos y gastos que aún no están en tu cuenta {{email}}.",
    counts: "{{groups}} grupos · {{expenses}} gastos",
    mergeCta: "Combinar con mi cuenta",
    cloudOnlyCta: "Usar solo los datos de la nube",
    cloudOnlyWarning:
      "Estos grupos y gastos se eliminarán de este dispositivo.",
    dismissCta: "Ahora no",
  },
```

- [ ] **Step 5: Verify all three locales satisfy the type**

Run: `npx tsc --noEmit`

Expected: no errors. A missing key in any locale surfaces here as "Property 'syncMerge' is missing in type" — that is the check doing its job.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/i18n/translations.ts
git commit -m "feat(i18n): add sync merge prompt strings for en/fa/es"
```

---

### Task 6: The merge prompt overlay component

**Files:**
- Create: `src/components/PostLoginSyncMergePrompt.tsx`

**Interfaces:**
- Consumes: `MergeChoice` and `LocalOnlyCounts` from Task 2; `syncMerge.*` from Task 5
- Produces: `<PostLoginSyncMergePrompt email counts onChoose />` where `onChoose: (c: MergeChoice) => void`

Model it on `src/screens/ConfirmEmailOverlay.tsx` — same structural pattern (icon tile, centred title + body, CTA column) and the same `buildStyles(colors, isRTL)` convention.

- [ ] **Step 1: Write the component**

```tsx
import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import type { LocalOnlyCounts, MergeChoice } from "../sync/postLoginSync";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

/**
 * Shown before the first sync of a session whenever this device holds groups
 * or expenses the signed-in account doesn't have.
 *
 * This is load-bearing, not a courtesy: `pullAllFromSupabase` deletes local
 * rows absent from the account, and `pushMergedToSupabase` pulls *before* it
 * pushes — so without an answer here, turning sync on destroys local-only data
 * before it is ever uploaded.
 *
 * A full overlay rather than `Alert.alert` because there are three outcomes
 * plus row counts, and `window.confirm` (the web fallback used elsewhere in
 * this codebase) only expresses two.
 */
export function PostLoginSyncMergePrompt({
  email,
  counts,
  onChoose,
}: {
  email: string;
  counts: LocalOnlyCounts;
  onChoose: (choice: MergeChoice) => void;
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  // Bold the email inside the body sentence — same split trick as
  // ConfirmEmailOverlay, which keeps the template a single translatable string.
  const bodyParts = useMemo(() => {
    const raw = t("syncMerge.body", { email });
    const idx = raw.indexOf(email);
    if (idx < 0) return { before: raw, after: "" };
    return { before: raw.slice(0, idx), after: raw.slice(idx + email.length) };
  }, [email, t]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.page}>
        <View style={styles.iconTile}>
          <Ionicons name="git-merge-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t("syncMerge.title")}</Text>
        <Text style={styles.body}>
          {bodyParts.before}
          <Text style={styles.bodyEmphasis}>{email}</Text>
          {bodyParts.after}
        </Text>
        <Text style={styles.counts}>
          {t("syncMerge.counts", {
            groups: String(counts.groupCount),
            expenses: String(counts.expenseCount),
          })}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.ctaCol}>
          <AppButton
            variant="primary"
            fullWidth
            label={t("syncMerge.mergeCta")}
            onPress={() => onChoose("merge")}
          />
          <AppButton
            variant="destructive"
            fullWidth
            label={t("syncMerge.cloudOnlyCta")}
            onPress={() => onChoose("cloud-only")}
          />
          <Text style={styles.warning}>{t("syncMerge.cloudOnlyWarning")}</Text>
          <AppButton
            variant="ghost"
            fullWidth
            label={t("syncMerge.dismissCta")}
            onPress={() => onChoose("dismiss")}
          />
        </View>
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const tc = { textAlign: "center" as const };
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      writingDirection: isRTL ? "rtl" : "ltr",
      ...(Platform.OS === "web"
        ? { minHeight: "100vh" as unknown as number }
        : {}),
    },
    page: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    iconTile: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.3,
      marginBottom: 8,
      ...tc,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      maxWidth: 360,
      ...tc,
    },
    bodyEmphasis: { color: colors.text, fontWeight: "700" },
    counts: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      marginTop: 12,
      ...tc,
    },
    footer: { paddingHorizontal: 22, paddingTop: 8 },
    ctaCol: { gap: 10 },
    warning: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.muted,
      marginTop: -2,
      ...tc,
    },
  });
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: no errors. If `colors.owedSoft` does not exist on `ThemeColors`, open `src/theme/tokens.ts` and substitute the nearest soft-accent token — `ConfirmEmailOverlay.tsx:105` uses `colors.owedSoft` for the same treatment, so it should resolve.

- [ ] **Step 3: Lint and commit**

```bash
npm run lint
git add src/components/PostLoginSyncMergePrompt.tsx
git commit -m "feat(sync): add pre-sync merge prompt overlay"
```

---

### Task 7: Signal when the auth↔SQLite link is complete

**Files:**
- Modify: `src/db/DatabaseContext.tsx` (type at :48-80, provider body, context value at :452-468)
- Modify: `src/auth/AuthSQLiteBinding.tsx` (:28, :58, :148, :168)

**Why:** `DatabaseContext`'s post-login effect currently keys on `authSession.user.email`, which lands as soon as the session loads — possibly *before* `remapLocalUserIdInSqlite` (`AuthSQLiteBinding.tsx:85`) has bound the local id to the Supabase uid. Syncing in that window pushes rows under `DEFAULT_LOCAL_USER_ID`. Task 10 gates the auto-sync on this signal.

**Interfaces:**
- Consumes: nothing
- Produces: `authLinkReady: boolean` and `markAuthLinkReady: () => void` on `TallyDataContext`

- [ ] **Step 1: Add the state and the two context members**

In `src/db/DatabaseContext.tsx`, add to the `TallyDataContext` type (after `bumpDataRevision` at :72):

```ts
  /**
   * True once the local SQLite user id is confirmed bound to the authenticated
   * uid. Anything that pushes rows must wait for this — before it, writes
   * would go up under `DEFAULT_LOCAL_USER_ID`.
   */
  authLinkReady: boolean;
  /** Called by `AuthSQLiteBinding` when its bootstrap completes. */
  markAuthLinkReady: () => void;
```

Add the state next to the other `useState` calls (near :103):

```ts
  const [authLinkReady, setAuthLinkReady] = useState(false);
```

Add the callback next to `bumpDataRevision` (near :357):

```ts
  const markAuthLinkReady = useCallback(() => {
    setAuthLinkReady(true);
  }, []);
```

Add both to the provider value object (near :465):

```ts
        authLinkReady,
        markAuthLinkReady,
```

- [ ] **Step 2: Reset the flag on sign-out**

Still in `DatabaseContext.tsx`, add this effect after the existing auth-email effect (which ends at :291):

```ts
  // Signing out unbinds the local id (`performLocalSignOutCleanup`), so the
  // link signal has to drop with it — otherwise the next sign-in would look
  // already-linked and could sync against the previous account's id.
  useEffect(() => {
    if (!authSession?.user?.id) setAuthLinkReady(false);
  }, [authSession?.user?.id]);
```

- [ ] **Step 3: Call it from both success paths in `AuthSQLiteBinding`**

In `src/auth/AuthSQLiteBinding.tsx`, pull the new member out of the hook at :28:

```ts
  const { db, bumpDataRevision, markAuthLinkReady } = useTallyData();
```

In the already-linked branch (`if (myId === uid)`, :53-68), add the call inside the async IIFE after `bumpDataRevision()`:

```ts
      void (async () => {
        try {
          await hydrateLocalProfileFromCloud(db, uid);
          bumpDataRevision();
        } catch {
          /* best-effort */
        }
        // Signal regardless of the hydrate outcome — the id binding itself is
        // already correct, which is all this flag asserts.
        markAuthLinkReady();
      })();
      return;
```

In the fresh-link branch, add it immediately after `lastLinkedUid.current = uid;` (:148):

```ts
        lastLinkedUid.current = uid;
        markAuthLinkReady();
        bumpDataRevision();
```

Do **not** add it to the account-conflict path (:69-82), the soft-delete-cancel path (:121-128), or the `catch` block — all three sign out or abort, so the link is not established.

Finally, add `markAuthLinkReady` to the effect's dependency array at :168:

```ts
  }, [loading, session?.user?.id, db, bumpDataRevision, signOut, t, markAuthLinkReady]);
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/db/DatabaseContext.tsx src/auth/AuthSQLiteBinding.tsx
git commit -m "feat(sync): signal when the auth-to-SQLite link completes"
```

---

### Task 8: Route enabling sync through the merge gate

**Files:**
- Modify: `src/db/DatabaseContext.tsx` (imports, prompt state, `setCloudSyncUserEnabled` at :401-428, context type and value)

**Why here and not in the login effect:** the destructive path is reachable today from the Account toggle (`AccountScreen.tsx:1420` → `setCloudSyncUserEnabled(true)` → `doFullSync(true, { bypassProfileEmailCheck: true })` → pull-then-delete). Putting the gate inside `setCloudSyncUserEnabled` means the login effect (Task 10) and the toggle share one implementation, and there is exactly one place where "sync is being turned on" is handled.

**Interfaces:**
- Consumes: `collectLocalOnlyRowIds`, `markRowsForUpload` (Task 4); `pushAccountCloudSyncPref` (Task 3); `MergeChoice`, `EnableSyncResult`, `LocalOnlyCounts` (Task 2)
- Produces:
  - `setCloudSyncUserEnabled: (enabled: boolean) => Promise<EnableSyncResult>` — signature change, was `Promise<boolean>`
  - `mergePrompt: { email: string; counts: LocalOnlyCounts } | null` on the context
  - `resolveMergePrompt: (choice: MergeChoice) => void` on the context

- [ ] **Step 1: Add the imports**

In `src/db/DatabaseContext.tsx`, extend the existing `../sync/supabaseSync` import (:25-30):

```ts
import {
  collectLocalOnlyRowIds,
  createTallySupabaseClient,
  markRowsForUpload,
  pullAllFromSupabase,
  pushMergedToSupabase,
  TALLY_SUPABASE_TABLES,
} from "../sync/supabaseSync";
```

And add two new imports:

```ts
import { pushAccountCloudSyncPref } from "../sync/profilePrefsSync";
import type {
  EnableSyncResult,
  LocalOnlyCounts,
  MergeChoice,
} from "../sync/postLoginSync";
```

- [ ] **Step 2: Add the prompt state and resolver**

Next to the other `useState` calls (near :103):

```ts
  const [mergePrompt, setMergePrompt] = useState<{
    email: string;
    counts: LocalOnlyCounts;
  } | null>(null);
```

Next to the other refs (near :126):

```ts
  // Holds the `resolve` of the promise `promptMergeDecision` is awaiting, so
  // the overlay's button press can complete an async flow started elsewhere.
  const mergeResolverRef = useRef<((c: MergeChoice) => void) | null>(null);
```

And the resolver callback, next to `bumpDataRevision` (near :357):

```ts
  const resolveMergePrompt = useCallback((choice: MergeChoice) => {
    const resolve = mergeResolverRef.current;
    mergeResolverRef.current = null;
    setMergePrompt(null);
    resolve?.(choice);
  }, []);
```

- [ ] **Step 3: Add the gate helper**

Place this just above `setCloudSyncUserEnabled` (before :401):

```ts
  /** Suspend until the user answers the merge overlay. */
  const promptMergeDecision = useCallback(
    (email: string, counts: LocalOnlyCounts): Promise<MergeChoice> =>
      new Promise<MergeChoice>((resolve) => {
        mergeResolverRef.current = resolve;
        setMergePrompt({ email, counts });
      }),
    [],
  );

  /**
   * Everything that must happen before the first sync of a session: find the
   * rows a pull would delete, ask the user when there are any, and protect
   * them if they chose to merge.
   *
   * Returns false when the user dismissed — the caller must not enable sync.
   */
  const clearMergeGate = useCallback(
    async (
      client: ReturnType<typeof createTallySupabaseClient>,
      sqlite: SQLiteDatabase,
      email: string,
    ): Promise<boolean> => {
      if (!client) return true;
      const localOnly = await collectLocalOnlyRowIds(client, sqlite);
      const atRisk = localOnly.groupCount > 0 || localOnly.expenseCount > 0;
      if (!atRisk) return true;

      const choice = await promptMergeDecision(email, {
        groupCount: localOnly.groupCount,
        expenseCount: localOnly.expenseCount,
      });
      if (choice === "dismiss") return false;
      if (choice === "merge") {
        // Deliberately NOT best-effort: syncing with these rows unprotected is
        // precisely the data loss this gate exists to prevent, so a failure
        // here must abort rather than fall through.
        await markRowsForUpload(sqlite, localOnly.byTable);
      }
      return true;
    },
    [promptMergeDecision],
  );
```

`SQLiteDatabase` is already imported as a type at :22.

- [ ] **Step 4: Rewrite `setCloudSyncUserEnabled`**

Replace the whole callback at :401-428 with:

```ts
  const setCloudSyncUserEnabled = useCallback(
    async (enabled: boolean): Promise<EnableSyncResult> => {
      if (!value) return "ineligible";

      if (!enabled) {
        setCloudUserEnabled(false);
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "0");
        setSyncState((s) => ({ ...s, lastError: null, busy: false }));
        void pushAccountCloudSyncPref(false);
        return "applied";
      }

      if (!premium.isPremium) return "ineligible";
      const p = await getLocalUserProfile(value.tally);
      const email = p.email?.trim() ?? "";
      if (!email) return "ineligible";
      setLocalUserHasProfileEmail(true);

      if (canUseCloud) {
        const client = createTallySupabaseClient();
        try {
          const proceed = await clearMergeGate(client, value.sqlite, email);
          if (!proceed) return "dismissed";
        } catch {
          // We couldn't determine what was at risk, so we must not run the
          // destructive pull. Leave the preference untouched and let the user
          // retry — reporting this as ineligible surfaces the existing alert.
          return "ineligible";
        }
      }

      setCloudUserEnabled(true);
      await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "1");
      void pushAccountCloudSyncPref(true);

      if (canUseCloud) {
        try {
          await doFullSync(true, { bypassProfileEmailCheck: true });
        } catch {
          // keep preference
        }
      }
      return "applied";
    },
    [value, canUseCloud, doFullSync, premium.isPremium, clearMergeGate],
  );
```

Note the ordering change: the preference is now written **after** the gate clears, so a dismissed prompt leaves the stored value untouched.

- [ ] **Step 5: Update the context type and value**

In the `TallyDataContext` type, change :70 to:

```ts
  setCloudSyncUserEnabled: (enabled: boolean) => Promise<EnableSyncResult>;
```

and add after it:

```ts
  /** Non-null while the pre-sync merge overlay should be on screen. */
  mergePrompt: { email: string; counts: LocalOnlyCounts } | null;
  /** Answer the merge overlay; resumes the suspended `setCloudSyncUserEnabled`. */
  resolveMergePrompt: (choice: MergeChoice) => void;
```

Add both to the provider value object (near :464):

```ts
        mergePrompt,
        resolveMergePrompt,
```

- [ ] **Step 6: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: exactly one error, in `src/screens/AccountScreen.tsx` — `setCloudSyncUserEnabled` now returns `EnableSyncResult` where a `boolean` was expected. Task 9 fixes it. If you see errors anywhere else, they are yours.

- [ ] **Step 7: Commit**

```bash
git add src/db/DatabaseContext.tsx
git commit -m "feat(sync): gate enabling sync behind the merge prompt"
```

Lint is deferred to Task 9 — `AccountScreen.tsx` is knowingly broken between these two commits.

---

### Task 9: Handle the tri-state result at the Account toggle

**Files:**
- Modify: `src/screens/AccountScreen.tsx:1420-1428`

**Interfaces:**
- Consumes: `EnableSyncResult` from Task 8
- Produces: nothing

- [ ] **Step 1: Replace the boolean branch**

`AccountScreen.tsx:1420-1428` currently reads:

```ts
                                  const ok = await setCloudSyncUserEnabled(true);
                                  if (!ok) {
                                    Alert.alert(
                                      t("account.cloudSyncAlertNoEmailTitle"),
                                      t("account.cloudSyncAlertNoEmailBody"),
                                    );
                                  } else {
                                    await load();
                                  }
```

Replace with:

```ts
                                  const res = await setCloudSyncUserEnabled(true);
                                  if (res === "ineligible") {
                                    Alert.alert(
                                      t("account.cloudSyncAlertNoEmailTitle"),
                                      t("account.cloudSyncAlertNoEmailBody"),
                                    );
                                  } else if (res === "applied") {
                                    await load();
                                  }
                                  // "dismissed": the user backed out of the
                                  // merge prompt. The preference was never
                                  // written, so the switch falls back to off on
                                  // its own — say nothing, they just answered.
```

- [ ] **Step 2: Check the two other call sites still compile**

Run: `sed -n '1615,1620p;1855,1860p' src/screens/AccountScreen.tsx`

Expected: both are bare `await setCloudSyncUserEnabled(false);` statements that ignore the result, so they need no change.

- [ ] **Step 3: Verify the type error from Task 8 is gone**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 4: Lint and commit**

```bash
npm run lint
git add src/screens/AccountScreen.tsx
git commit -m "fix(sync): handle dismissed merge prompt at the account toggle"
```

---

### Task 10: Sync automatically after login

**Files:**
- Modify: `src/db/DatabaseContext.tsx` (post-open effect at :232-263; new effect after it; the sign-out effect from Task 7)

**Interfaces:**
- Consumes: `authLinkReady` (Task 7), `setCloudSyncUserEnabled` (Task 8), `fetchAccountCloudSyncPref` (Task 3), `resolveSyncPref` / `parseLocalSyncPref` (Task 2)
- Produces: nothing

- [ ] **Step 1: Remove the sync call from the post-open effect**

The effect at :232-263 does two jobs: it establishes `localUserHasProfileEmail` / `cloudPrefReady` (keep) and it fires a sync (move). Delete these four lines from its tail (:255-258):

```ts
      if (wants && hasEmail && canUseCloud) {
        if (!alive) return;
        await doFullSync(true, { bypassProfileEmailCheck: true });
      }
```

Leave `setCloudPrefReady(true)` as the last statement. Drop `doFullSync` from that effect's dependency array at :263 — it is no longer referenced there.

- [ ] **Step 2: Add the once-per-uid guard ref**

Next to the other refs (near :126):

```ts
  const autoSyncedForUidRef = useRef<string | null>(null);
```

- [ ] **Step 3: Add the auto-sync effect**

Insert immediately after the post-open effect edited in Step 1:

```ts
  // Sync once per sign-in, as soon as the local id is bound to the auth uid.
  //
  // Gated on `authLinkReady` rather than on the session email: the email lands
  // the moment Supabase restores the session, which can precede
  // `remapLocalUserIdInSqlite` and would push rows under DEFAULT_LOCAL_USER_ID.
  //
  // A device that has never chosen (`localPref === null`) inherits the account
  // default, so a fresh install signing in to an account with sync on starts
  // syncing without the user hunting for the toggle. An explicit local choice
  // always wins — that is what keeps sync off on a shared laptop.
  useEffect(() => {
    if (!value || !authLinkReady || !cloudPrefReady) return;
    const uid = authSession?.user?.id;
    if (!uid) return;
    // Once per signed-in uid — not on every dependency change.
    if (autoSyncedForUidRef.current === uid) return;
    autoSyncedForUidRef.current = uid;

    void (async () => {
      const localPref = parseLocalSyncPref(
        await getSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled),
      );
      // Only consult the account when this device has no opinion — a device
      // that merely inherited the value must not echo it back.
      const accountPref =
        localPref === null ? await fetchAccountCloudSyncPref() : null;
      const resolved = resolveSyncPref({ accountPref, localPref });
      if (resolved.kind === "off") return;

      const eligible =
        canUseCloud &&
        emailConfirmed &&
        premium.isPremium &&
        localUserHasProfileEmail;

      if (!eligible) {
        // Inherit the preference so the Account toggle reads ON and the
        // existing `cloudSyncEffective` effects pick it up the moment premium
        // or email confirmation lands. Run no sync now.
        if (resolved.inherited) {
          await setSetting(
            value.tally,
            SETTINGS_KEYS.cloudSyncUserEnabled,
            "1",
          );
          setCloudUserEnabled(true);
        }
        return;
      }

      // Routing through `setCloudSyncUserEnabled` rather than calling
      // `doFullSync` directly is deliberate: it is the single place that runs
      // the merge gate, so login and the Account toggle cannot diverge.
      await setCloudSyncUserEnabled(true);
    })();
  }, [
    value,
    authLinkReady,
    cloudPrefReady,
    authSession?.user?.id,
    canUseCloud,
    emailConfirmed,
    premium.isPremium,
    localUserHasProfileEmail,
    setCloudSyncUserEnabled,
  ]);
```

- [ ] **Step 4: Reset the guard on sign-out**

Extend the effect added in Task 7 Step 2:

```ts
  useEffect(() => {
    if (!authSession?.user?.id) {
      setAuthLinkReady(false);
      autoSyncedForUidRef.current = null;
    }
  }, [authSession?.user?.id]);
```

- [ ] **Step 5: Add the imports**

Merge `fetchAccountCloudSyncPref` into the `profilePrefsSync` import added in Task 8:

```ts
import {
  fetchAccountCloudSyncPref,
  pushAccountCloudSyncPref,
} from "../sync/profilePrefsSync";
```

And add the value imports from `postLoginSync` (the existing import from that module is type-only):

```ts
import { parseLocalSyncPref, resolveSyncPref } from "../sync/postLoginSync";
```

`decidePostLoginSync` is intentionally **not** imported here. Its branches need `await` between them, so the effect expresses them inline; the exported function remains the tested description of the same rules. Do not add an unused import for lint to flag.

- [ ] **Step 6: Verify types and tests**

Run: `npx tsc --noEmit && npm test`

Expected: no type errors; all tests pass.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/db/DatabaseContext.tsx
git commit -m "feat(sync): sync automatically once the auth link is ready"
```

---

### Task 11: Render the merge overlay

**Files:**
- Modify: `App.tsx` (import at :43, `ThemedApp` at :141-142, overlay block near :351)

**Interfaces:**
- Consumes: `mergePrompt` / `resolveMergePrompt` (Task 8), `PostLoginSyncMergePrompt` (Task 6)
- Produces: nothing

- [ ] **Step 1: Update the imports**

`ThemedApp` calls `useDatabase()` at :142; `DbErrorCapture` at :398 also calls it, so keep both hooks in the import. Change :43 to:

```ts
import {
  DatabaseProvider,
  useDatabase,
  useTallyData,
} from "./src/db/DatabaseContext";
```

And add:

```ts
import { PostLoginSyncMergePrompt } from "./src/components/PostLoginSyncMergePrompt";
```

- [ ] **Step 2: Take the fuller context in `ThemedApp`**

Change `App.tsx:142` from:

```ts
  const db = useDatabase();
```

to:

```ts
  const { db, mergePrompt, resolveMergePrompt } = useTallyData();
```

- [ ] **Step 3: Render the overlay**

`ThemedApp` is inside `DatabaseProvider`, `ThemeProvider`, and `LocaleProvider` (see the tree at `App.tsx:481-504`), so all three hooks the component needs are available.

Add immediately after the `showConfirmEmail` block (which ends at :351), before `{showGreeting ? … }`:

```tsx
        {mergePrompt ? (
          <View style={StyleSheet.absoluteFill}>
            <PostLoginSyncMergePrompt
              email={mergePrompt.email}
              counts={mergePrompt.counts}
              onChoose={resolveMergePrompt}
            />
          </View>
        ) : null}
```

Placed after the confirm-email overlay on purpose: an unconfirmed account is ineligible to sync, so the two can never both be live, but if that ever changes the confirm prompt should win.

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`

Expected: no errors.

- [ ] **Step 5: Manual smoke test**

Run: `npm run web`

1. Sign out if signed in.
2. Create a group with one expense while signed out.
3. Sign in with a premium, email-confirmed account that already has different data.
4. Expect the merge overlay, showing 1 group and 1 expense.
5. Choose **Merge into my account** — the local group must still be present afterwards, and must appear in the account.
6. Repeat from a clean state and choose **Not now** — no sync runs, and the Account toggle reads off.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add App.tsx
git commit -m "feat(sync): render the merge prompt overlay at the app root"
```

---

### Task 12: Native permission dialog first

**Files:**
- Create: `src/core/permissions.ts`
- Modify: `src/screens/QrScanScreen.tsx` (imports, and a new effect after :43)
- Modify: `src/core/pickProfileAvatar.ts` (:53, :68)

**The bug:** `useCameraPermissions()` only *reads* status — it never prompts. The gate at `QrScanScreen.tsx:129` (`if (!permission.granted)`) is true for `undetermined` as well as `denied`, so a first-time user sees Tally's custom panel and the OS dialog only appears after they tap "Allow camera access" at :177.

- [ ] **Step 1: Write the shared helper**

Create `src/core/permissions.ts`:

```ts
/**
 * House rule for OS permissions: **never pre-prompt**. Ask the platform first,
 * so the user's first sight of a permission request is the system dialog
 * ("Tally" Would Like to Access the Camera). Custom UI is for *after* a
 * denial — explaining what broke and offering Settings — never before.
 *
 * A custom screen shown ahead of the OS dialog trains users to dismiss both,
 * and on iOS the system dialog can only ever be shown once.
 *
 * The usage-description strings the dialog renders live in `app.json`: the
 * `expo-camera` / `expo-image-picker` / `expo-audio` plugin configs and the
 * iOS `infoPlist` block.
 */

export type PermissionSnapshot = {
  granted: boolean;
  /** False once the OS will no longer show the dialog — offer Settings instead. */
  canAskAgain: boolean;
  status: string;
};

/**
 * Read current status, and request only when the user has never been asked.
 * Returns the resulting snapshot.
 *
 * Never re-requests after an explicit denial: on iOS that call resolves
 * immediately without a dialog, which reads to the user as a dead button.
 * Check `canAskAgain` and send them to Settings instead.
 */
export async function ensureNativePermission(
  get: () => Promise<PermissionSnapshot>,
  request: () => Promise<PermissionSnapshot>,
): Promise<PermissionSnapshot> {
  const current = await get();
  if (current.granted) return current;
  if (current.status !== "undetermined") return current;
  return request();
}
```

- [ ] **Step 2: Request on mount in `QrScanScreen`**

Confirm `useEffect` is in the `react` import at the top of `src/screens/QrScanScreen.tsx` and add it if not (`useRef` is already there — `handledRef` at :46). Then add this effect immediately after the `useCameraPermissions()` call at :43:

```ts
  // Ask the OS the moment the scanner opens, so the native dialog is the first
  // thing the user sees. The custom panel below is strictly the post-denial
  // state — showing it first would put an in-app screen in front of a system
  // prompt the user has never been given.
  //
  // `status === "undetermined"` is the guard: re-requesting after an explicit
  // denial resolves instantly with no dialog on iOS, which looks like a broken
  // button. That case falls through to the panel's Settings branch.
  const askedRef = useRef(false);
  useEffect(() => {
    if (!permission || askedRef.current) return;
    if (permission.granted) return;
    if (permission.status !== "undetermined") return;
    askedRef.current = true;
    void requestPermission();
  }, [permission, requestPermission]);
```

Leave the panel at :129-186 exactly as it is — including the `canAskAgain` branch that swaps "Grant access" for "Open Settings" (:172-186). It is now reached only after a real denial, which is what it was written for.

- [ ] **Step 3: Route `pickProfileAvatar` through the helper**

The two calls at `src/core/pickProfileAvatar.ts:53` and `:68` request unconditionally — correct for a first ask, but they re-request after a denial. Add the import:

```ts
import { ensureNativePermission } from "./permissions";
```

Replace :53-54:

```ts
    const perm = await ensureNativePermission(
      ImagePicker.getMediaLibraryPermissionsAsync,
      ImagePicker.requestMediaLibraryPermissionsAsync,
    );
    if (!perm.granted) return { kind: "permissionDenied", reason: "library" };
```

Replace :68-69:

```ts
  const perm = await ensureNativePermission(
    ImagePicker.getCameraPermissionsAsync,
    ImagePicker.requestCameraPermissionsAsync,
  );
  if (!perm.granted) return { kind: "permissionDenied", reason: "camera" };
```

**Leave these three alone** — audited and already conformant, and rewriting working code to import a helper is churn without behavior change: `AiReceiptScreen.tsx:1405-1413` and `:1459` already do get-then-request; `AiCreditsContext.tsx:212-215` already guards on `status === "undetermined"`.

- [ ] **Step 4: Verify types**

Run: `npx tsc --noEmit`

Expected: no errors. If `ImagePicker.getMediaLibraryPermissionsAsync` returns a type that does not structurally match `PermissionSnapshot`, widen `PermissionSnapshot`'s fields to match what expo returns rather than casting at the call site.

- [ ] **Step 5: Manual smoke test**

Run: `npm run ios` (or `npm run android`) on a device or simulator where Tally has never been granted camera access — delete and reinstall the app if needed.

1. Open a group → invite → scan QR.
2. **Expected:** the native `"Tally" Would Like to Access the Camera` dialog appears immediately. Tally's own permission panel must NOT appear first.
3. Tap **Don't Allow** → the custom panel appears with **Open Settings**.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add src/core/permissions.ts src/screens/QrScanScreen.tsx src/core/pickProfileAvatar.ts
git commit -m "fix(permissions): show the OS dialog before any custom panel"
```

---

### Task 13: Widen the photo library purpose string

**Files:**
- Modify: `app.json:25` and `app.json:84`

**Why:** the string claims the photo library is for choosing a group icon, but `AiReceiptScreen.tsx:1405-1420` also uses it for receipt scanning. Apple rejects purpose strings that do not cover every actual use.

- [ ] **Step 1: Update both occurrences**

The same sentence appears twice and **must stay identical** — the `expo-image-picker` plugin's `photosPermission` overwrites the iOS `infoPlist` value at prebuild, so a mismatch means the plugin's copy silently wins.

At `app.json:25` (`ios.infoPlist.NSPhotoLibraryUsageDescription`) and `app.json:84` (`expo-image-picker` plugin `photosPermission`), replace:

```
Tally needs access to your photos to let you choose a group icon.
```

with:

```
Tally needs access to your photos to let you choose a group icon and to scan receipts for expense details.
```

- [ ] **Step 2: Verify both strings match**

Run: `grep -n "choose a group icon" app.json`

Expected: exactly two lines, byte-identical after the key.

- [ ] **Step 3: Commit**

```bash
git add app.json
git commit -m "fix(ios): cover receipt scanning in the photo library purpose string"
```

This is a native config change — it takes effect on the next native build, not via an OTA update. Call that out when handing the work back.

---

## Final verification

- [ ] **Full suite:** `npm test` — all green
- [ ] **Types:** `npx tsc --noEmit` — clean
- [ ] **Lint:** `npm run lint` — clean
- [ ] **Migration applied** to the target Supabase project before the client ships. Without it `fetchAccountCloudSyncPref` returns `null` for everyone — the feature degrades safely to today's behavior, but it won't work.
- [ ] **Native rebuild** required for Task 13 to take effect.
