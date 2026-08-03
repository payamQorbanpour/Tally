# Post-Login Sync & Native Permission Prompts — Design

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning

Two independent workstreams, specified together because both were raised in the
same session:

- **A.** Sync should run right after login when the account has sync enabled,
  with a warning when local data is at risk.
- **B.** OS permission requests (camera, mic, etc.) must surface the native
  system dialog first, never a custom in-app substitute.

---

## Workstream A — Sync right after login

### Problem

Three distinct defects, all reachable from "log in with an existing email":

1. **Fresh device / reinstall.** The sync toggle
   (`app_settings.cloud_sync_user_enabled`) is device-local only.
   `src/sync/profilePrefsSync.ts:14-18` deliberately excludes it from the cloud
   `profiles` row. A user who had sync on elsewhere installs the app, logs in,
   and nothing syncs — their data does not appear until they find the toggle in
   Account and turn it on manually.

2. **Sign-in race.** `src/db/DatabaseContext.tsx:232-263` keys its post-login
   sync effect on `authSession.user.email`, which becomes non-null as soon as
   the Supabase session loads. That can precede
   `remapLocalUserIdInSqlite` in `src/auth/AuthSQLiteBinding.tsx:85`, so the
   sync may run while `getLocalUserId()` is still `DEFAULT_LOCAL_USER_ID` and
   push rows under the wrong user id. This race exists today; auto-syncing at
   login makes it far more likely to fire.

3. **Silent data loss (pre-existing).** `pullAllFromSupabase` deletes local rows
   absent from the cloud (`deleteLocalNotInRemote`,
   `src/sync/supabaseSync.ts:353-355`). The only rows spared are those listed in
   `sync_cloud_insert_pending`, and `cloudInsertPendingAdd` is called from
   exactly one place — `src/sync/groupInviteAccept.ts:64`. Groups and expenses
   created locally before signing in are never marked. Because
   `pushMergedToSupabase` pulls *before* it pushes
   (`src/sync/supabaseSync.ts:519`), the first sync **deletes local-only groups
   and expenses before uploading them**. Today this is reachable via the manual
   toggle at `src/screens/AccountScreen.tsx:1420`, which flips sync on with no
   warning. Auto-syncing at login would trigger it without any user action at
   all.

### Preference model: account default, device override

The device-local setting stays authoritative for the device it is set on, and
gains a meaningful third state:

| `app_settings.cloud_sync_user_enabled` | Meaning |
| --- | --- |
| `null` (absent) | Never chosen on this device — inherit the account default |
| `"1"` | Explicitly on here |
| `"0"` | Explicitly off here — never overridden by the account default |

This preserves the shared-laptop case the current design protects: a device the
user deliberately turned sync off on stays off. `getSetting` already returns
`null` for an unset key, so the tri-state needs no schema change locally.

Verify during implementation that nothing collapses `null` into `"0"`
prematurely. Two existing writes are safe as-is:
`DatabaseContext.tsx:246-247` only fires when `wants` is true (never true for
`null`), and `:274-276` only fires when the value is already on.

The account default lives in a new nullable column, where `null` means the
account has never expressed a preference:

```sql
-- supabase/migrations/20260803000000_profile_cloud_sync_pref.sql
alter table public.profiles add column if not exists cloud_sync_enabled boolean;

grant insert (cloud_sync_enabled) on public.profiles to authenticated;
grant update (cloud_sync_enabled) on public.profiles to authenticated;
```

The grants are **mandatory, not optional**.
`supabase/migrations/20260502000000_lock_profiles_entitlements.sql:20-27`
revokes table-wide INSERT/UPDATE from `authenticated` and re-grants only
`id, preferred_locale, default_currency, appearance, updated_at`. Postgres
column grants are additive, so this widens that set without disturbing it.
Without the grants, client writes to the new column fail.

`src/sync/profilePrefsSync.ts` gains two functions:

- `fetchAccountCloudSyncPref(): Promise<boolean | null>`
- `pushAccountCloudSyncPref(enabled: boolean): Promise<void>`

These stay **separate from `ProfilePrefsPatch`**. That type's contract is
"preferences mirrored in both directions on every sign-in"; `cloud_sync_enabled`
is a default that propagates only on explicit user action. Folding it in would
break the documented invariant at `profilePrefsSync.ts:14-18`. Update that
doc comment to describe the two-tier model rather than deleting it.

`setCloudSyncUserEnabled` in `DatabaseContext` calls `pushAccountCloudSyncPref`
(best-effort, no-op when signed out) so flipping the toggle on any device
updates the account default.

### Fixing the sign-in race

`DatabaseContext` exposes two new context members:

- `authLinkReady: boolean` — the local user id is confirmed bound to the
  authenticated uid
- `markAuthLinkReady(): void`

`AuthSQLiteBinding` calls `markAuthLinkReady()` at the end of **both** its
paths: the already-linked early return (`AuthSQLiteBinding.tsx:58`) and the
fresh-link path after the remap and profile bootstrap complete (`:148`). It must
**not** be called on the account-conflict path (`:69-82`) or the soft-delete
cancel path (`:121-128`), both of which sign out.

`AuthSQLiteBinding` renders under `DatabaseProvider` (it calls `useTallyData`),
so the signal flows parent-to-child correctly.

The post-login sync effect gates on `authLinkReady` instead of racing on
`authSession.user.email`.

### Decision logic

New module `src/sync/postLoginSync.ts`, with the decision expressed as a pure
function so it is testable without a database or network:

Split into two pure functions, because the at-risk-data query is a network call
that must not run until the preference has already resolved to "on".

**Stage 1 — resolve the preference.** No I/O:

```ts
type ResolvedSyncPref =
  | { kind: "off" }                        // local explicit "0", or both unset/off
  | { kind: "on"; inherited: boolean }     // sync wanted; `inherited` = came from the account
  ;

function resolveSyncPref(input: {
  accountPref: boolean | null;   // profiles.cloud_sync_enabled
  localPref: boolean | null;     // null = never chosen on this device
}): ResolvedSyncPref;
```

Rules, in order: an explicit `localPref` always wins (`false` → `off`, `true` →
`on` with `inherited: false`, even when the account default says off). When
`localPref` is `null`, take `accountPref` (`true` → `on` with `inherited: true`;
`false` or `null` → `off`).

**Stage 2 — decide the action.** Called only when stage 1 returned `on`:

```ts
type LoginSyncAction =
  | { kind: "inherit-blocked" }   // write the pref locally, run no sync
  | { kind: "sync" }              // sync now, nothing at risk
  | { kind: "confirm-merge"; localOnly: LocalOnlyCounts };

function decidePostLoginSync(input: {
  eligible: boolean;
  localOnly: LocalOnlyCounts | null;   // null = none found / query skipped
}): LoginSyncAction;
```

Returns `inherit-blocked` when `eligible` is false; `confirm-merge` when
`localOnly` is non-null and non-empty; otherwise `sync`.

`eligible` is the existing gate composition: `canUseCloud && emailConfirmed &&
premium.isPremium && localUserHasProfileEmail`.

**Call order in the effect:** wait for `authLinkReady` → `fetchAccountCloudSyncPref`
→ `resolveSyncPref` → persist the resolved pref locally when it was inherited →
if `on` and `eligible`, run `collectLocalOnlyRowIds` → `decidePostLoginSync` →
act.

**Blocked devices inherit but do not sync.** When the account says sync is on
but the device is not premium or the email is unconfirmed
(`inherit-blocked`), write the inherited preference to local settings so the
Account toggle reads ON, and run no sync. `SyncStatusPill` and the existing
premium gate already explain why nothing is running, and the existing
`cloudSyncEffective` effects
(`DatabaseContext.tsx:294-348`) start syncing on their own the moment premium
or confirmation lands. No additional dialog — login may already show the
soft-delete restore prompt and the merge prompt.

### Detecting at-risk local data

New export in `src/sync/supabaseSync.ts`:

```ts
export async function collectLocalOnlyRowIds(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<{
  byTable: Record<SyncedTable, string[]>;
  groupCount: number;
  expenseCount: number;
}>;
```

One `select id` per synced table, diffed against the local id set for that
table. Cheap relative to the full `select("*")` that `pullAllFromSupabase`
already performs. Skip the local user's own `users` row, consistent with
`deleteLocalNotInRemote:66`.

Run it only when the resolved preference is on **and** the device has at least
one local group. A fresh install seeds only the local user row
(`ensureLocalUserSeed` in `src/db/tallyDatabaseOpen.ts:36`) — no sample groups —
so the prompt cannot fire spuriously on a clean device.

### Merge mechanism

On **Merge**, insert exactly the ids returned by `collectLocalOnlyRowIds` into
`sync_cloud_insert_pending` before running the sync. That table is already
honored on both sides of the sync:

- `deleteLocalNotInRemote` skips them (`supabaseSync.ts:68`), so the pull does
  not delete them
- `shouldApplyRemoteRow` skips them (`:113`), so the pull does not clobber them
- `pushMergedToSupabase` uploads them and clears the table (`:520-522`)

**Mark only the remote-absent ids.** Marking rows that *do* exist remotely would
make `shouldApplyRemoteRow` suppress a legitimately newer remote version during
this pull, after which the push would overwrite the remote with stale local
data. The precision is what makes the merge safe.

On **Use cloud data only**, sync without marking — the current behavior, local-
only rows are deleted.

On **Not now**, keep the inherited preference but skip this sync. Re-prompt on
next launch.

### Merge prompt UI

New `src/components/PostLoginSyncMergePrompt.tsx`, following the existing
`ConfirmEmailOverlay` pattern in `App.tsx:342-351` — a `StyleSheet.absoluteFill`
overlay rendered at the App root.

Not `Alert.alert`: three outcomes plus row counts do not fit `window.confirm` on
web, and the existing promise-wrapped `Alert` pattern in
`AuthSQLiteBinding.tsx:101-120` degrades to two options there.

Content: the count of at-risk groups and expenses, and the destination account
email. Actions:

- **Merge into my account** (default, primary)
- **Use cloud data only** — destructive styling; copy states plainly that the
  listed local groups and expenses will be deleted from this device
- **Not now** — dismiss without syncing

### Error handling

New network reads (`fetchAccountCloudSyncPref`, `collectLocalOnlyRowIds`) go
through the existing `guardNetworkCall` and are best-effort: on failure, fall
back to the device-local preference and skip the prompt rather than blocking
login.

One exception, deliberately not best-effort: **if merge-marking fails, abort the
sync** rather than proceeding unprotected. Swallowing that error is precisely
the data-loss path this design exists to close.

---

## Workstream B — Native OS permission prompts

### Problem

Permission requests must surface the platform's own dialog (the standard
`"Tally" Would Like to Access the Camera` sheet) as the first thing the user
sees. One site violates this.

`src/screens/QrScanScreen.tsx:43` uses `useCameraPermissions()`, which only
*reads* status — it never prompts. The gate at `:129` (`if
(!permission.granted)`) is true for `undetermined` as well as `denied`, so a
first-time user gets Tally's custom full-screen panel, and the OS dialog appears
only after they tap "Allow camera access" (`:177`).

Audit of every other site — all correct, no changes needed beyond adopting the
shared helper:

| Site | Behavior |
| --- | --- |
| `src/core/pickProfileAvatar.ts:53,68` | Calls `request*Async` directly → native dialog first |
| `src/screens/AiReceiptScreen.tsx:1405,1459,1531` | `get*` then `request*`; in-app messaging only *after* denial |
| `src/premium/AiCreditsContext.tsx:212-215` | `getTrackingPermissionsAsync` then `requestTrackingPermissionsAsync` when undetermined |

Location is not requested anywhere in the app.

The `app.json` usage-description strings are already configured correctly
(`expo-camera` plugin at `:95-102`, `expo-image-picker` at `:81-88`,
`expo-audio` at `:89-94`, iOS `infoPlist` at `:24-29`), so the native dialog
renders proper copy as soon as it is actually triggered.

### Fix

`QrScanScreen` requests permission on mount when `permission.status ===
"undetermined"`, so the OS dialog is the first thing the user sees. The custom
panel is retained strictly for the post-denial state, preserving the existing
`canAskAgain` branch: re-request when true, `RNLinking.openSettings()` when
false (`:172-186`).

New `src/core/permissions.ts` wraps the rule — never pre-prompt, request
natively, handle denial in-app afterwards — so future permission sites follow
it by construction. The three already-correct call sites adopt the helper.

### Flagged, out of scope unless requested

`NSPhotoLibraryUsageDescription` (`app.json:25`) reads "Tally needs access to
your photos to let you choose a group icon", but the photo library is also used
for receipt scanning (`AiReceiptScreen.tsx:1405-1420`). Apple review flags
purpose strings that do not cover all actual uses. A one-line copy change fixes
it; it is not part of this work.

---

## Testing

`src/sync/postLoginSync.test.ts` (vitest, matching the existing
`src/i18n/localeDefaults.test.ts`):

- `resolveSyncPref` across the full 3 × 3 matrix: local pref `on`/`off`/`unset`
  × account pref `on`/`off`/`null`, asserting `inherited` is set only when the
  local pref was unset
- Explicit local `"0"` is never overridden by an account default of `on`
  (the shared-laptop guarantee)
- Explicit local `"1"` syncs even when the account default is `off`
- `decidePostLoginSync` across eligible/blocked × local-only data
  present/absent/null
- Merge-marking selects exactly the remote-absent ids and no others

## Internationalisation

New keys in `src/i18n/translations.ts` for `en`, `fa`, and `es`: merge prompt
copy (title, counts, three action labels, destructive warning) and any QR
permission string changes.

The working tree already carries uncommitted changes to
`src/i18n/translations.ts`, `src/i18n/localeDefaults.ts`, and
`src/i18n/LocaleContext.tsx`. This work lands on top of those.

## Files touched

**New**

- `supabase/migrations/<timestamp>_profile_cloud_sync_pref.sql`
- `src/sync/postLoginSync.ts`
- `src/sync/postLoginSync.test.ts`
- `src/components/PostLoginSyncMergePrompt.tsx`
- `src/core/permissions.ts`

**Modified**

- `src/sync/profilePrefsSync.ts` — account-level sync pref fetch/push
- `src/sync/supabaseSync.ts` — `collectLocalOnlyRowIds`, merge marking
- `src/db/DatabaseContext.tsx` — `authLinkReady`, post-login sync effect, push
  account pref from `setCloudSyncUserEnabled`
- `src/auth/AuthSQLiteBinding.tsx` — call `markAuthLinkReady()`
- `src/screens/QrScanScreen.tsx` — request on mount when undetermined
- `src/screens/AccountScreen.tsx` — route the manual toggle through the same
  merge prompt
- `src/core/pickProfileAvatar.ts`, `src/screens/AiReceiptScreen.tsx`,
  `src/premium/AiCreditsContext.tsx` — adopt the permissions helper
- `src/i18n/translations.ts` — new keys for `en` / `fa` / `es`
- `App.tsx` — render the merge prompt overlay
