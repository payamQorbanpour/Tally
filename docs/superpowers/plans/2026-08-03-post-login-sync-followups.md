# Post-Login Sync — Follow-ups and Outstanding Verification

Companion to `2026-08-03-post-login-sync-design.md` and
`2026-08-03-post-login-sync.md`. Records what the branch `implement/post-login-sync`
deliberately left undone, so it isn't lost when the scratch workspace is deleted.

Every item below was surfaced by a review during execution and consciously
deferred — none is an unknown.

---

## Runtime verification — NOT done

**Nothing in this branch has been executed.** The environment had no simulator and
no Supabase account, so every check was static: type checking, lint, and unit tests
over the pure decision logic. The sync flow's actual behavior is unverified.

Two flows need a human before this ships.

### 1. Merge prompt at login

Highest risk. The whole feature turns on it, and it has never run.

1. Sign out. Create a group with at least one expense while signed out.
2. Sign in with a **premium, email-confirmed** account that already holds different data.
3. Expect the merge overlay, with counts matching the local groups/expenses.
4. **Merge into my account** — the local group must still exist afterwards *and* appear in the account.
5. Repeat from a clean state, choose **Not now** — no sync should run, and the Account toggle must read off.
6. Repeat, choose **Use cloud data only** — local-only rows are deleted, as the copy warns.

Throttle the network for step 2 if possible. Several of the hardest bugs in this
branch involved entitlements resolving *after* the login effect started, and a slow
connection widens that window.

### 2. Camera dialog on a fresh install

1. Delete and reinstall so camera access has never been granted.
2. Open a group → invite → scan QR.
3. The native `"Tally" Would Like to Access the Camera` sheet must be the **first**
   thing shown. Tally's own panel must not appear before it.
4. Tap **Don't Allow** → the panel appears with **Open Settings**.
5. On Android, deny *without* "Don't ask again", then tap **Add Photo** on the profile
   avatar flow — the OS dialog should appear again.

Step 3 is the originally reported bug. The first fix for it was wrong (it relocated
the flash rather than removing it), and the corrected version went through two review
rounds without ever running on a device.

## Deployment prerequisites

- **Apply `supabase/migrations/20260803000001_profile_cloud_sync_pref.sql`** before
  the client ships. Without it `fetchAccountCloudSyncPref` returns `null` for
  everyone and the account-default feature is silently inert — it degrades to
  today's behavior rather than breaking, but it won't work.
- **Native rebuild required** for the widened photo-library purpose strings
  (`app.json`). They do not reach users over an OTA update.

---

## Known gaps, worth fixing

### `doFullSync` has no mutex — nested `BEGIN` is reachable

`src/db/DatabaseContext.tsx` calls `doFullSync` from six places (periodic poll,
foreground catch-up, realtime subscribe, realtime change, the enable path, the
launch path). Both `pullAllFromSupabase` and `markRowsForUpload` issue
`db.execAsync("BEGIN")` on the same SQLite connection, and SQLite has no nested
transactions — so two overlapping syncs mean the loser's `ROLLBACK` can abort the
winner's transaction mid-write.

The enable path is single-flighted (`enableInFlightRef`), which closes the route
that final review found. The general case is open. A mutex around `doFullSync`
would close it properly.

### Dropped wakeup on a non-latching return

The auto-sync effect records a dependency change that lands mid-run
(`autoSyncPendingRef`) and loops. But two early returns exit the loop even when that
flag is set, so a transition that arrived during the awaits is discarded — reachable
when `clearMergeGate` throws while a dependency changed in flight. Sync then isn't
retried until the next unrelated dependency change or an app relaunch.

Strictly better than the behavior it replaced (which latched and guaranteed no
retry). Converting those returns to `continue` is **not** obviously correct — it
would re-run the account-preference fetch and re-arm the merge prompt — so this
needs a design decision rather than a mechanical change.

### The gate protects the first enable only

By design, per the plan. A device whose preference is already `"1"` takes the
pre-existing launch path (`doFullSync(true, …)`), with no merge prompt. Its
residual exposure is unchanged from before this branch, not introduced by it.

Closing it properly would mean making the merge gate authoritative — e.g. a
`mergeGateCleared` flag folded into `cloudSyncEffective`. That was considered and
rejected during execution: it would make *all* sync availability depend on a flag
set only by the auth-link-gated effect, so if `authLinkReady` never fires, sync
would be entirely dead. Worse than the problem. Revisit only with that tradeoff in
mind.

### `markAuthLinkReady` is the only launch-sync trigger, and can be skipped silently

`src/auth/AuthSQLiteBinding.tsx` calls it *after* `pushLocalProfileToCloud` and the
profile-prefs sync. A network failure in either lands in the catch, which only
`console.error`s — so `authLinkReady` never flips and no launch sync happens for
that session.

Moving `markAuthLinkReady()` up to immediately after the id remap and
`setSetting(activeLocalUserId)` succeed would fix it. That is all the flag actually
asserts.

### At-risk detection covers only groups and expenses

`collectLocalOnlyRowIds` computes and `markRowsForUpload` marks all eight synced
tables, but the prompt's "is anything at risk?" predicate looks only at groups and
expenses. A settlement recorded offline on an otherwise-synced device is deleted by
the next pull without the prompt firing.

Widening the predicate has a real tradeoff — a row deleted on another device looks
identical to a row never uploaded, so "merge" would resurrect it. At minimum the
prompt's counts should name everything "Use cloud data only" will actually delete.

### Unpaginated Supabase selects

`collectLocalOnlyRowIds` and `pullAllFromSupabase` both issue unordered `select`s
capped at PostgREST's 1000-row default. The reasoning that they "truncate
identically" only holds if both return the same page, which unordered queries do not
guarantee. For an account exceeding 1000 rows in any table, `markRowsForUpload`
could mark ids that *do* exist remotely — the precision violation
`localOnlyRows.test.ts` documents as harmful.

The underlying "pull deletes everything past row 1000" bug is pre-existing and
worse. This branch simply shouldn't depend on the two truncations lining up.

### Photo-denied alert has no route forward

`src/screens/AccountScreen.tsx` shows a buttonless `Alert` when photo access is
denied — no "Open Settings" action — and `PickProfileAvatarResult`'s
`permissionDenied` variant doesn't expose `canAskAgain` for a caller to branch on.
Android soft-deny users have a retry path via the OS; iOS hard-deny users have no
in-app route at all. `QrScanScreen`'s panel does this correctly and is the model.

---

## Smaller items

- Sign-out clears the in-flight guard while a frame may still be suspended, so a
  fast re-sign-in can start a second concurrent body. Same structural gap as the
  missing mutex.
- `setCloudSyncUserEnabled` rejects an empty *profile* email, while the auto-sync
  effect's eligibility check accepts an auth-session email. Divergent conditions;
  not reachable on the normal path because `AuthSQLiteBinding` writes the session
  email before signalling, but the two should agree.
- A disable landing during an in-flight enable is silently reverted when the enable
  completes and writes `"1"`.
- `PostLoginSyncMergePrompt` is an `absoluteFill` `View`, not a `Modal`, so Android
  hardware back navigates behind it while the overlay stays up. Inherited from
  `ConfirmEmailOverlay`'s pattern.
- `markRowsForUpload` entries never expire; only a successful `pushMergedToSupabase`
  clears them.
- `src/sync/deleteRemoteAccount.ts` holds 25 of the repo's 37 remaining type errors —
  the largest cluster, untouched by this work.
- Stale leftovers in `DatabaseContext.tsx`: a comment describing a sync the effect no
  longer performs, an unused `canUseCloud` dependency, and `authLinkReady` exposed on
  the context type with no consumer outside the provider.

---

## Baselines, for future regression checks

Measured at `7cae333` (the in-flight snapshot this branch started from):

| | Baseline | After this branch |
|---|---|---|
| `tsc --noEmit` errors | 60 | **37** |
| Tests | 18 failing / 145 passing | 18 failing / **158** passing |
| Lint | 22 problems (1 error) | 22 problems, none in changed files |

The 18 test failures are pre-existing, all in `src/observability/sentry.test.ts` —
a Rollup `import typeof` parse failure on `react-native/index.js`. The type-error
drop came from widening `guardNetworkCall` to accept thenables.

**Note for anyone running these:** this repo's shell is wrapped by a tool that
condenses command output. Prefix with `rtk proxy` to see real output — unprefixed,
`npx vitest run` prints `PASS (7) FAIL (0)` rather than vitest's actual summary,
which has already caused one false "fabricated evidence" review finding.
