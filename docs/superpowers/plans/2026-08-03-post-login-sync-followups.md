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

## Closed follow-ups

All of these were fixed after the branch's final review. Listed so the reasoning
survives, since the execution workspace holding the review reports is scratch.

- **`doFullSync` had no mutex** (`e2d1fea`). Every sync now queues on one promise
  chain. `pullAllFromSupabase` and `markRowsForUpload` each issue a bare `BEGIN`
  and SQLite has no nested transactions, so an overlapping run's `ROLLBACK` could
  abort another's write. `refreshCloudData` (pull-to-refresh) bypassed `doFullSync`
  entirely and joins the chain too. Chained rather than dropped, so a queued
  caller's work still happens and a pull can't swallow a pending push.
- **`markRowsForUpload` ran outside that chain** (`d7c5159`). Safe only by
  call-site ordering before; now safe by construction.
- **`markAuthLinkReady` could be skipped silently** (`d4e3fa6`). It is the sole
  trigger for launch sync and sat after three profile/prefs round-trips whose
  failures land in a catch that only logs — so one network blip meant no sync for
  the whole session. Moved to just after the soft-delete decision, the last point
  that can sign out. The three sign-out paths still return before reaching it.
- **Dropped wakeups on a non-latching pass** (`d7c5159`). Both unlatched exits in
  the auto-sync loop returned even with `autoSyncPendingRef` set, discarding a
  dependency transition that had already happened — and the effect does not
  re-fire for it. They now `continue`. Bounded: only the in-flight guard sets the
  flag, and that needs a genuine dependency change.
- **Unordered Supabase reads** (`d7c5159`). PostgREST caps rows at 1000 and an
  unordered select may return a different subset per call, so
  `collectLocalOnlyRowIds` and `pullAllFromSupabase` could disagree about what
  exists remotely and mark server-present rows as local-only. All three id/row
  reads are now `.order("id")`. This does not raise the cap — see below.
- **Photo-denied alert was a dead end** (`d7c5159`). It named a setting the user
  had no way to reach; it now offers Open Settings, matching the QR scanner.
- **The destructive warning understated its blast radius** (`d7c5159`). "Use cloud
  data only" deletes settlements and member records alongside the groups and
  expenses whose counts are shown; the copy now says so in all three locales.
- **Leftovers from the task interleave** (`26907a3`): a comment describing a sync
  that moved elsewhere, an unused `canUseCloud` dependency, and `authLinkReady`
  exposed on the public context type with no consumer.

## Deliberately left open

### Pagination beyond 1000 rows

Ordering the reads makes truncation deterministic and keeps the two views aligned,
which is what protected the merge gate's precision. It does **not** paginate. An
account exceeding PostgREST's 1000-row cap in any table still has rows the pull
never sees — and `deleteLocalNotInRemote` will treat those as absent remotely.

That is a **pre-existing bug and worse than anything this branch introduced**: at
that scale the pull deletes local rows purely because the server's response was
truncated. Fixing it means range-paginating every read in `supabaseSync.ts`, which
is a change to shipped sync behavior well beyond this plan's scope. Flagged as the
single highest-value follow-up for that file.

### The gate protects the first enable only

By design. A device whose preference is already `"1"` takes the pre-existing launch
path with no merge prompt; its exposure is unchanged from before this branch.

Making the gate authoritative — e.g. a `mergeGateCleared` flag folded into
`cloudSyncEffective` — was considered and rejected during execution: it would make
*all* sync availability depend on a flag set only by the auth-link-gated effect, so
if that signal never fires, sync would be entirely dead. Worse than the problem.
Revisit only with that tradeoff in mind.

### At-risk detection still keys on groups and expenses

`collectLocalOnlyRowIds` computes and `markRowsForUpload` marks all eight synced
tables, but the "is anything at risk?" predicate looks only at groups and expenses.
A settlement recorded offline on an otherwise-synced device is still deleted by the
next pull without the prompt firing.

Widening the predicate was considered and rejected: a row deleted on another device
is indistinguishable from one never uploaded, so every such deletion would raise a
destructive-sounding prompt on a healthy device, and choosing "merge" would
resurrect the deleted row. The warning copy was widened instead, so the prompt is
at least honest about what it removes when it does fire. Closing this properly
needs a tombstone or a per-row sync-state column — a data-model change.

### Smaller items

- Sign-out clears the in-flight guard while a frame may still be suspended, so a
  fast re-sign-in can start a second concurrent body. Narrower now that syncs are
  serialised, but the guard itself is still not reentrancy-safe.
- `setCloudSyncUserEnabled` rejects an empty *profile* email while the auto-sync
  effect's eligibility check accepts an auth-session email. Not reachable on the
  normal path — `AuthSQLiteBinding` writes the session email before signalling —
  but the two conditions should agree.
- A disable landing during an in-flight enable is silently reverted when the enable
  completes and writes `"1"`.
- `PostLoginSyncMergePrompt` is an `absoluteFill` `View`, not a `Modal`, so Android
  hardware back navigates behind it while the overlay stays up. Inherited from
  `ConfirmEmailOverlay`'s pattern; fixing it should fix both.
- `markRowsForUpload` entries never expire; only a successful
  `pushMergedToSupabase` clears them.
- `src/sync/deleteRemoteAccount.ts` holds 25 of the repo's 37 remaining type
  errors — the largest cluster, untouched by this work.

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
