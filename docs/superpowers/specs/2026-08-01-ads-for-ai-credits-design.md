# Rewarded ads for AI credits

**Date:** 2026-08-01
**Status:** Approved design, not yet implemented

## Summary

Today every AI feature in Tally sits behind `PremiumContext.isPremium`, which is
granted only by a paid pass. This design adds a second way to reach AI: watching
a rewarded ad grants 3 AI credits, and each billable proxy call spends one.

Passes are not removed. They keep gating cloud sync, premium split modes, and the
premium group toggles exactly as they do now, and they gain a stronger value
proposition — an active pass means unlimited AI with no ads at all.

## Goals

- Let a signed-in user without a pass use AI receipt scanning, description
  parsing, and transcription by watching rewarded ads.
- Keep every credit grant server-verified, so a patched client cannot mint AI
  requests.
- Give passes a clearer upsell: unlimited AI, no ads.
- Support both Google AdMob and an Iranian ad network (Tapsell or Adivery)
  without a second architecture.

## Non-goals

- Removing or changing the pass model.
- Banner or interstitial ads. Rewarded ads only.
- Ad-gating cloud sync, split modes, or group toggles. Those stay pass-only.
- A web-compatible reward mechanism (offer walls, surveys).

## Decisions

| Question | Decision |
| --- | --- |
| Scope | Ads fund AI only. Passes keep gating sync, splits, group toggles. |
| Networks | AdMob and an Iranian network (Tapsell/Adivery), phased. |
| Pass holders | Unlimited AI, no ads. |
| Credit cost | 1 credit per proxy call; `classify-category` is free. |
| Expiry | Credits never expire. |
| Daily ad cap | None. |
| New-user grant | 5 credits, once per account. |
| Ad reward | 3 credits per completed ad. |
| Web | Signup grant is spendable; no way to earn more. Points to mobile or a pass. |
| Verification | Hybrid — AdMob SSV, nonce challenge/response for networks without a callback. |
| UI seam | The existing premium gate overlay in `AiReceiptScreen` becomes a credits panel. |

### Why no daily cap is safe

Each ad impression funds the credits it grants, so uncapped ads are not uncapped
cost — provided the grant is genuinely server-verified. The real defense against
abuse is signature/nonce verification plus the per-minute limiter already in
`ai-proxy`, not a daily ceiling. `AD_REWARDS_ENABLED` exists as a kill-switch if
fill rate or eCPM turn out worse than expected.

### Why `classify-category` is free

The app issues `classify-category` on its own when the group-type picker is off
(`isGroupTypePickerEnabled()` in `src/core/featureFlags.ts`). Charging for a call
the user never initiated would drain credits invisibly, which reads as a bug.

## Current state

- `src/premium/passes.ts` — pure pass model: Night Out (24h), Trip (7d),
  Explorer (30d), plus paid extensions.
- `src/premium/PremiumContext.tsx` — resolves `isPremium` from
  `isAlpha || deviceSubscriptionActive || profilePremium || hasActivePass ||
  (!signedIn && web)`.
- `isPremium` gates four things: AI (`AiReceiptScreen`), cloud sync
  (`src/db/DatabaseContext.tsx:113`), premium split modes (`AddExpenseScreen`),
  and group toggles (`CreateGroupScreen`, `GroupDetailScreen`).
- `supabase/functions/ai-proxy/index.ts` — authenticates, requires
  `profiles.is_premium` (402 otherwise), enforces a per-user-per-minute limit,
  then forwards to the upstream model. Four actions: `parse-receipt`,
  `parse-description`, `classify-category`, `transcribe`.
- No ads SDK in `package.json`. Locales: `en`, `fa`, `es`.

## Entitlement model

An AI call is allowed when the user is signed in with a confirmed email **and**
either:

- **Unlimited** — `isPremium` (active pass, `profiles.is_premium`, or
  `is_alpha`). No credit is spent, no ad is ever shown.
- **Credited** — balance ≥ 1. One credit is spent per billable call.

`isPremium`'s other four gates are untouched by this change.

## Server data model

New migration `supabase/migrations/20260801000000_ai_credits.sql`, following the
existing `20260428000000_ai_proxy_usage.sql` and
`20260502000000_lock_profiles_entitlements.sql` patterns.

### `public.ai_credit_balances`

| Column | Type | Notes |
| --- | --- | --- |
| `user_id` | `uuid` PK | references `auth.users (id) on delete cascade` |
| `balance` | `int not null default 0` | never negative |
| `lifetime_granted` | `int not null default 0` | |
| `lifetime_spent` | `int not null default 0` | |
| `updated_at` | `timestamptz not null default now()` | |

RLS enabled. **Select-own only; no insert, update, or delete policy for
`authenticated`.** Writes happen exclusively through `security definer`
functions called with the service role, matching how `profiles.is_premium` is
already treated as server-owned (see the comment at `PremiumContext.tsx:261`).

### `public.ai_credit_events`

Append-only ledger.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `bigint` generated always as identity PK | |
| `user_id` | `uuid not null` | references `auth.users` |
| `delta` | `int not null` | positive grant, negative spend |
| `reason` | `text not null` | `signup_grant` \| `ad_reward` \| `spend` \| `refund` \| `admin` |
| `provider` | `text` | `admob` \| `tapsell` \| null |
| `external_id` | `text` | AdMob `transaction_id`, or the nonce |
| `action` | `text` | proxy action for spends and refunds |
| `created_at` | `timestamptz not null default now()` | |

`create unique index ai_credit_events_provider_external
  on public.ai_credit_events (provider, external_id)
  where external_id is not null;`

That index is the idempotency key. A replayed AdMob callback becomes a no-op
rather than a double grant. RLS: select-own only, no client writes.

### `public.ad_reward_nonces`

| Column | Type | Notes |
| --- | --- | --- |
| `nonce` | `text` PK | server-generated, cryptographically random |
| `user_id` | `uuid not null` | references `auth.users` |
| `provider` | `text not null` | |
| `issued_at` | `timestamptz not null default now()` | |
| `expires_at` | `timestamptz not null` | issued_at + 5 minutes |
| `consumed_at` | `timestamptz` | null until claimed |

RLS: no client access at all. Only the Edge Function's service role touches it.

### Functions

Both are `security definer` with `set search_path = public`.

**`ai_credit_grant(p_user_id uuid, p_delta int, p_reason text, p_provider text,
p_external_id text) returns int`**

Inserts the event and bumps the balance in one transaction; returns the new
balance. When `(provider, external_id)` already exists, it returns the current
balance unchanged without inserting — idempotent by construction.

**`ai_credit_spend(p_user_id uuid, p_action text) returns int`**

Decrements the balance by 1 only if `balance > 0`, writes a `spend` event, and
returns the new balance. Returns `-1` when the balance is insufficient. Uses a
conditional `update ... where balance > 0 returning balance` so concurrent
requests cannot oversell.

### Signup grant

The existing `public.tally_handle_new_user_profile()` trigger on `auth.users`
gains a call to `ai_credit_grant(new.id, 5, 'signup_grant', null, null)`. Firing
on `auth.users` insert means the grant is once per account — reinstalling the app
reuses the same account and grants nothing further.

The grant amount lives in SQL, not in an Edge Function env var: a Postgres
trigger cannot read the function's environment. Changing it is a migration.
This only affects users created after the migration runs; existing accounts get
no retroactive grant, which is correct — they are all `is_premium` today.

## Edge Functions

### `ai-proxy` changes

`requireAuthed` currently returns 402 `premium_required` for non-premium callers
(`index.ts:105`). It stops deciding and starts reporting: it returns
`{ userId, isPremium, admin }` for any authenticated caller.

New order in the request handler:

1. `requireAuthed` → 401 if not signed in.
2. `enforceRateLimit` → 429. Runs for everyone, unchanged, still fails open.
3. If `action === "classify-category"`, skip billing.
4. If `isPremium`, skip billing.
5. Otherwise `ai_credit_spend`. Insufficient → 402
   `{ error: "insufficient_credits", balance: 0 }`. RPC error → 503.
6. Call upstream. On throw or non-2xx, refund via
   `ai_credit_grant(+1, 'refund', ...)` before returning the error.

Successful responses gain `credits_remaining` so the client syncs its balance
from the authoritative source.

**The credit check fails closed.** `enforceRateLimit` deliberately fails open
when its table is missing (`index.ts:135`), on the reasoning that the premium
gate bounds the bill. That reasoning stops holding once non-paying users reach
the proxy, so a failed credit RPC refuses the request.

### New `supabase/functions/ad-reward/index.ts`

Three routes:

**`POST /nonce`** — authenticated. Issues a single-use nonce bound to
`(user_id, provider)` with a 5-minute TTL. Returns `{ nonce }`.

**`POST /claim`** — authenticated. Body `{ nonce, provider }`. Verifies the nonce
exists, belongs to the caller, and is unexpired and unconsumed; marks it
consumed; grants `AD_REWARD_CREDITS` with `external_id = nonce`. This is the
phase-2 path for networks without a server callback.

**`GET /admob-ssv`** — unauthenticated by design; AdMob calls it, not the app.
Verifies the RSA-SHA256 signature over the query string against Google's key
server (`https://gstatic.com/admob/reward/verifier-keys.json`, cached and
selected by the `key_id` parameter), then grants `AD_REWARD_CREDITS` with
`external_id = transaction_id`. The Supabase user id arrives in AdMob's
`user_id` parameter, which the client sets before showing the ad.

This function must be deployed with `verify_jwt = false`, because AdMob presents
no JWT. Its only authentication is the RSA signature, so an unverifiable or
missing signature is a hard reject — this route never fails open.

### Configuration

Edge Function env vars, not client constants, so tuning is a config change:

| Var | Default | Purpose |
| --- | --- | --- |
| `AD_REWARD_CREDITS` | `3` | credits per completed ad |
| `AD_REWARDS_ENABLED` | `0` | kill-switch; `/claim` and `/admob-ssv` refuse when off |

The signup grant is not listed here — it lives in the SQL trigger, as explained
above.

## Client architecture

### `src/ads/` — the provider seam

- **`rewardedAdProvider.ts`** — interface and types only, no side effects:
  ```ts
  type RewardOutcome =
    | { kind: "ssv" }                       // server credits out-of-band
    | { kind: "nonce"; nonce: string }      // client claims via /claim
    | { kind: "dismissed" | "failed"; reason?: string };

  type RewardedAdProvider = {
    id: "admob" | "tapsell" | "none";
    isAvailable(): boolean;
    load(): Promise<void>;
    show(opts: { userId: string }): Promise<RewardOutcome>;
  };
  ```
- **`admobProvider.ts`** — lazily `import("react-native-google-mobile-ads")`, the
  same pattern `PremiumContext` uses for `expo-iap` (`PremiumContext.tsx:177`),
  so web and dev builds without the native module do not crash. Sets AdMob's SSV
  `userId` and returns `{ kind: "ssv" }`.
- **`noopProvider.ts`** — web and any build without an ad SDK.
  `isAvailable()` returns false.
- **`selectRewardedAdProvider.ts`** — picks a provider from `Platform.OS` plus a
  build-flavor env var. Phase 2 registers `tapsellProvider.ts` here and nowhere
  else.

### `src/premium/AiCreditsContext.tsx`

A sibling of `PremiumContext`, not part of it: passes and credits are different
currencies with different lifecycles, and `PremiumContext` is already 476 lines.

Exposes `{ balance, isUnlimited, busy, lastError, refresh, watchAdForCredits }`
and reads `usePremium().isPremium` for `isUnlimited`.

`watchAdForCredits` handles the SSV timing gap: AdMob credits the server, so when
`show()` resolves the client does not yet know the grant landed. It polls
`ai_credit_balances` with backoff for up to ~8 seconds, then surfaces "your credit
is on its way" rather than displaying a stale zero.

### UI

- **`src/components/AiCreditsPanel.tsx`** — sibling of the existing
  `PremiumRequiredPanel`. Shows balance, "Watch an ad → +3", and a secondary
  "Get a pass for unlimited AI". On web it shows the "continue on mobile" empty
  state instead of the ad button.
- **`AiReceiptScreen`** — `ensurePremium` (`AiReceiptScreen.tsx:1233`) becomes
  `ensureAiAccess`. The five existing call sites keep their shape; only the rule
  changes: unlimited, or balance > 0, else present the panel.
- A small balance chip in the AI screen header, shown only when not unlimited.
- A 402 `insufficient_credits` from the proxy re-opens the panel, so any
  client/server balance disagreement resolves in the server's favour.

### Compliance

Ships with the feature, not after — both are store-rejection risks:

- AdMob UMP consent flow for EEA/UK users.
- iOS App Tracking Transparency via `expo-tracking-transparency`.
- An advertising section in `src/i18n/privacyPolicy.ts`.
- Updated App Store and Play data-safety disclosures.

All new user-facing strings need `en`, `fa`, and `es` translations.

## Testing

`vitest.config.ts` includes only `src/**/*.test.ts` — no `.tsx`. Every existing
test covers a pure logic module. This design follows that convention by pushing
the testable rules out of the React layer.

**Unit-tested pure modules:**

- `src/core/aiCreditCost.ts` — proxy action → credit cost (0 for
  `classify-category`, 1 otherwise). The single source of the billing rule.
- `src/core/aiAccess.ts` — pure predicate over
  `{ isPremium, balance, signedIn, emailConfirmed, platform }` returning
  `'allowed' | 'needs_signin' | 'needs_credits' | 'web_no_ads'`. This is what
  `ensureAiAccess` consults, so the branching is testable even though the screen
  is not.
- `src/ads/rewardedAdProvider.ts` and `selectRewardedAdProvider.ts` — outcome
  normalization and the platform/flavor decision table, tested with fake
  providers.

**Not unit-tested,** consistent with `PremiumContext` today:
`AiCreditsContext`, `admobProvider`, `AiCreditsPanel`.

**SQL tests** under `supabase/`, exercising the RPCs directly:

- Spending at zero balance returns `-1` and writes no event.
- Concurrent spends cannot oversell a balance of 1.
- A replayed `(provider, external_id)` grants exactly once.
- A refund after a spend restores the original balance.

**Manual verification before release** (none of this is unit-testable):

- AdMob test ad unit end-to-end, with a real SSV callback reaching the deployed
  function.
- Replaying a captured callback URL credits only once.
- An upstream failure produces a refund.
- A signed-out caller gets 401; a pass holder never sees an ad.

## Rollout

1. Migration, RPCs, and the extended signup trigger. Inert — nothing reads them.
2. `ai-proxy` updated. Behaviour is unchanged for existing users, since everyone
   using AI today is `is_premium` and skips billing. Independently shippable and
   reversible.
3. `ad-reward` deployed with `AD_REWARDS_ENABLED=0`.
4. Client release: AdMob provider, consent flows, credits panel, translations.
   Flipping `AD_REWARDS_ENABLED=1` is the launch.
5. **Phase 2** — `tapsellProvider.ts`, the custom Expo config plugin for the
   Iranian SDK, and the Cafe Bazaar/Myket build. Nothing in steps 1–4 changes.

Existing pass holders are unaffected at every step: they are `isPremium`, so they
never reach the credit path. There is no data migration and no grandfathering
logic.

## Risks

**Unit economics.** If rewarded eCPM in the target markets falls below roughly
$2, ad revenue will not cover upstream model costs at 3 credits per ad. The
mitigation is a config change (`AD_REWARD_CREDITS=2`), not a code change — which
is why those numbers are env vars. Revisit after the first month of real
impression data.

**Iranian SDK integration.** Tapsell and Adivery have no official Expo config
plugin, and neither is proven in this repo. Phase 2 is separated for exactly this
reason. If it turns out to require ejecting to a bare workflow, that is a larger
decision than this design covers — and it would not block anything shipped in
phases 1–4.

**Ad revenue is a growth lever, not a revenue line.** Realistic revenue per user
per month from rewarded ads is small. The stronger argument for this change is
that it removes the paywall in front of Tally's best demo feature, and gives
non-paying users a reason to return daily.
