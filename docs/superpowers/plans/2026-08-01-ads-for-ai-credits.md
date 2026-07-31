# Rewarded Ads for AI Credits — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user without a pass use Tally's AI features by watching rewarded ads, where each completed ad grants 3 server-verified credits and each billable `ai-proxy` call spends one.

**Architecture:** A Postgres credit ledger (`ai_credit_balances` + append-only `ai_credit_events`) is written only through `security definer` RPCs called with the service-role key. The existing `ai-proxy` Edge Function stops rejecting non-premium callers and instead spends a credit, refunding on upstream failure. A new `ad-reward` Edge Function grants credits, verified by AdMob's server-side-verification (SSV) callback. On the client, a `src/ads/` provider seam abstracts the ad SDK, and a new `AiCreditsContext` sits beside the existing `PremiumContext` rather than inside it.

**Tech Stack:** Expo / React Native (TypeScript), Supabase (Postgres + Deno Edge Functions), Vitest, `react-native-google-mobile-ads`.

**Spec:** `docs/superpowers/specs/2026-08-01-ads-for-ai-credits-design.md`

## Scope

This plan covers rollout steps 1–4 of the spec: the ledger, proxy billing, the reward function, and the AdMob client path. **Step 5 (Tapsell/Adivery, the custom Expo config plugin, and the Cafe Bazaar/Myket build) is deliberately out of scope** and gets its own plan once the AdMob path ships. Task 7 builds the provider interface that phase 2 will implement, so phase 2 is an addition, not a refactor.

## Corrections to the spec

Three things the spec got wrong or left underspecified. The plan below is authoritative where they disagree.

1. **AdMob SSV is ECDSA P-256, not RSA-SHA256.** Google's verifier keys are EC public keys and the signature is DER-encoded; Web Crypto's `verify` requires raw `r||s`, so a DER→raw conversion is required (Task 5).
2. **There is no gate overlay in `AiReceiptScreen` to replace.** The comment at `AiReceiptScreen.tsx:2302` records that the paywall was already deferred: `ensurePremium` navigates to the `Plans` screen at point-of-action and no overlay card renders. The credits panel is therefore a **modal presented at point-of-action** (Task 10). The `gateOverlay` / `gateOverlayInner` styles in `buildStyles` are currently unused and stay unused.
3. **`credits_remaining` cannot be a response body field.** The proxy's handlers return upstream JSON verbatim via `rawJsonResponse(text)`; injecting a field would mean re-parsing every provider's payload. It is returned as an `X-Tally-Credits-Remaining` **response header** instead, which also requires `Access-Control-Expose-Headers` in the CORS block (Task 4).

Two smaller refinements, noted so reviewers do not flag them as drift:

- `aiAccess`'s fourth state is named `no_ads_available`, not `web_no_ads` — the condition is "no ad provider," which is broader than "web."
- `resolveAiAccess` takes `adsAvailable: boolean` rather than `platform`, so the rule is testable without mocking `Platform`.

## Global Constraints

- **Credits per ad: 3.** Edge Function env var `AD_REWARD_CREDITS`, default `3`.
- **Signup grant: 5 credits, once per account.** Lives in SQL (a Postgres trigger cannot read Edge Function env vars). Changing it is a migration.
- **Credit cost: 1 per proxy call, except `classify-category` which is free** — the app issues it unprompted when `isGroupTypePickerEnabled()` is off.
- **Credits never expire. There is no daily ad cap.** `AD_REWARDS_ENABLED` (default `0`) is the kill-switch.
- **The credit check fails closed.** `enforceRateLimit` deliberately fails open (`ai-proxy/index.ts:135`); the credit path must not copy that.
- **The ledger is server-owned.** No `insert`/`update`/`delete` RLS policy or column grant for `authenticated` on any new table, matching `20260502000000_lock_profiles_entitlements.sql`.
- **`isPremium` bypasses billing entirely** and its other four gates (cloud sync, split modes, group toggles, account UI) are untouched.
- **Every new user-facing string needs `en`, `fa`, and `es`** in `src/i18n/translations.ts` — the `Translations` type makes a missing locale a compile error.
- **Tests live at `src/**/*.test.ts` and `supabase/functions/**/*.test.ts`** and are pure-logic only. Contexts, providers, and screens are not unit-tested, matching how `PremiumContext` is treated today.
- **Lint after every task:** `npm run lint`.

## File Structure

**Created:**

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260801000000_ai_credits.sql` | Ledger tables, RLS, RPCs, signup-grant trigger |
| `supabase/scripts/test_ai_credits.sql` | Assertion script for the RPCs |
| `supabase/functions/ad-reward/index.ts` | Nonce / claim / AdMob-SSV routes |
| `supabase/functions/ad-reward/admobSsv.ts` | Pure ECDSA SSV verification helpers |
| `supabase/functions/ad-reward/admobSsv.test.ts` | Vitest coverage for the above |
| `src/core/aiCreditCost.ts` | Canonical action → credit cost rule |
| `src/core/aiCreditCost.test.ts` | Rule coverage + drift guard against the Edge Function |
| `src/core/aiAccess.ts` | Pure access predicate |
| `src/core/aiAccess.test.ts` | Predicate coverage |
| `src/ads/rewardedAdProvider.ts` | Provider interface and outcome types |
| `src/ads/noopProvider.ts` | Web / no-SDK provider |
| `src/ads/admobProvider.ts` | AdMob implementation (lazy native import) |
| `src/ads/selectRewardedAdProvider.ts` | Platform/config → provider |
| `src/ads/selectRewardedAdProvider.test.ts` | Selection table coverage |
| `src/premium/AiCreditsContext.tsx` | Balance state, ad flow, SSV poll |
| `src/components/AiCreditsPanel.tsx` | Balance + watch-ad + upsell modal body |

**Modified:**

| Path | Change |
| --- | --- |
| `supabase/functions/ai-proxy/index.ts` | Billing: spend, refund, 402, credits header |
| `supabase/config.toml` | `[functions.ad-reward] verify_jwt = false` |
| `Makefile` | `ad-reward` secrets + deploy targets |
| `vitest.config.ts` | Include `supabase/functions/**/*.test.ts` |
| `src/core/aiProxy.ts` | Typed 402 error, credits-header listener |
| `src/screens/AiReceiptScreen.tsx` | `ensurePremium` → `ensureAiAccess`, panel, balance chip |
| `src/i18n/translations.ts` | `aiCredits` section in three locales |
| `src/i18n/privacyPolicy.ts` | Advertising section in three locales |
| `App.tsx` | Mount `AiCreditsProvider` |
| `app.json` | AdMob plugin + ATT usage string |
| `.env.example` | Ad unit ids |
| `package.json` | `react-native-google-mobile-ads`, `expo-tracking-transparency` |

---

## Task 1: Credit ledger schema and RPCs

The whole feature rests on two properties: a replayed ad callback must grant exactly once, and concurrent spends must not oversell a balance. Both are enforced in SQL, so both are tested in SQL.

**Files:**
- Create: `supabase/migrations/20260801000000_ai_credits.sql`
- Create: `supabase/scripts/test_ai_credits.sql`

**Interfaces:**
- Consumes: `public.tally_handle_new_user_profile()` and `public.profiles` from `20260424000000_initial_schema.sql`.
- Produces:
  - `public.ai_credit_grant(p_user_id uuid, p_delta integer, p_reason text, p_provider text, p_external_id text) returns integer` — new balance; idempotent on `(provider, external_id)`.
  - `public.ai_credit_spend(p_user_id uuid, p_action text) returns integer` — new balance, or `-1` when insufficient.
  - `public.ai_credit_balances (user_id, balance, lifetime_granted, lifetime_spent, updated_at)`.
  - `public.ad_reward_nonces (nonce, user_id, provider, issued_at, expires_at, consumed_at)`.

- [ ] **Step 1: Write the failing SQL test**

Create `supabase/scripts/test_ai_credits.sql`. It runs against a local Supabase (`supabase start`) as a superuser, creates a throwaway auth user, exercises every guarantee, and rolls everything back at the end so it can be re-run.

```sql
-- Assertions for the AI credit ledger (20260801000000_ai_credits.sql).
--
-- Run against a local stack:
--   supabase start
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/scripts/test_ai_credits.sql
--
-- Everything happens inside a transaction that is rolled back, so the
-- script leaves no rows behind and is safe to re-run.

begin;

do $$
declare
  v_user uuid := '00000000-0000-4000-8000-0000000000a1';
  v_balance integer;
  v_events integer;
begin
  -- Inserting into auth.users fires tally_handle_new_user_profile, which
  -- must seed both the profile row and the one-time signup grant.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at)
    values (v_user, '00000000-0000-0000-0000-000000000000', 'authenticated',
            'authenticated', 'credits-test@example.com', '', now(), now(), now());

  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 5, format('signup grant should be 5, got %s', v_balance);

  -- ── Idempotency: a replayed ad callback grants exactly once ──────────
  perform public.ai_credit_grant(v_user, 3, 'ad_reward', 'admob', 'tx-123');
  perform public.ai_credit_grant(v_user, 3, 'ad_reward', 'admob', 'tx-123');

  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 8, format('replayed grant should credit once, got %s', v_balance);

  select count(*) into v_events from public.ai_credit_events
    where user_id = v_user and reason = 'ad_reward';
  assert v_events = 1, format('replayed grant should write one event, got %s', v_events);

  -- A different transaction id from the same provider does grant.
  perform public.ai_credit_grant(v_user, 3, 'ad_reward', 'admob', 'tx-124');
  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 11, format('distinct tx should grant, got %s', v_balance);

  -- ── Spending ─────────────────────────────────────────────────────────
  v_balance := public.ai_credit_spend(v_user, 'parse-receipt');
  assert v_balance = 10, format('spend should return 10, got %s', v_balance);

  select lifetime_spent into v_events from public.ai_credit_balances where user_id = v_user;
  assert v_events = 1, format('lifetime_spent should be 1, got %s', v_events);

  -- ── Refund restores the balance ──────────────────────────────────────
  perform public.ai_credit_grant(v_user, 1, 'refund', null, null);
  select balance into v_balance from public.ai_credit_balances where user_id = v_user;
  assert v_balance = 11, format('refund should restore 11, got %s', v_balance);

  -- ── Spending at zero returns -1 and writes no event ──────────────────
  update public.ai_credit_balances set balance = 0 where user_id = v_user;
  select count(*) into v_events from public.ai_credit_events where user_id = v_user;

  v_balance := public.ai_credit_spend(v_user, 'transcribe');
  assert v_balance = -1, format('spend at zero should return -1, got %s', v_balance);

  assert (select count(*) from public.ai_credit_events where user_id = v_user) = v_events,
    'spend at zero must not write an event';

  -- ── The balance can never go negative ────────────────────────────────
  assert (select balance from public.ai_credit_balances where user_id = v_user) = 0,
    'balance must not go negative';

  raise notice 'ai_credits: all assertions passed';
end $$;

rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
supabase start
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/scripts/test_ai_credits.sql
```
Expected: FAIL with `relation "public.ai_credit_balances" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260801000000_ai_credits.sql`:

```sql
-- AI credit ledger — the currency that rewarded ads buy.
--
-- Two tables and two functions:
--   * ai_credit_balances  current balance per user (the hot read)
--   * ai_credit_events    append-only audit log (the source of truth)
--   * ai_credit_grant()   idempotent credit, keyed on (provider, external_id)
--   * ai_credit_spend()   conditional debit that cannot oversell
--
-- Every write happens through the two `security definer` functions, called
-- from Edge Functions with the service-role key. Clients get SELECT on their
-- own rows and nothing else — same posture as `profiles.is_premium` after
-- 20260502000000_lock_profiles_entitlements.sql. A client that could write
-- here could mint free AI requests, which is the entire threat model.

create table if not exists public.ai_credit_balances (
  user_id          uuid    not null primary key references auth.users (id) on delete cascade,
  balance          integer not null default 0 check (balance >= 0),
  lifetime_granted integer not null default 0,
  lifetime_spent   integer not null default 0,
  updated_at       timestamptz not null default now()
);

create table if not exists public.ai_credit_events (
  id          bigint generated always as identity primary key,
  user_id     uuid    not null references auth.users (id) on delete cascade,
  delta       integer not null,
  reason      text    not null check (reason in ('signup_grant', 'ad_reward', 'spend', 'refund', 'admin')),
  provider    text,
  external_id text,
  action      text,
  created_at  timestamptz not null default now()
);

-- The idempotency key. `coalesce(provider, '')` rather than a bare column
-- because NULLs compare as distinct in a unique index, which would let a
-- provider-less replay slip through.
create unique index if not exists ai_credit_events_provider_external
  on public.ai_credit_events (coalesce(provider, ''), external_id)
  where external_id is not null;

create index if not exists ai_credit_events_by_user
  on public.ai_credit_events (user_id, created_at desc);

-- Single-use challenge for ad networks with no server-to-server callback.
-- Unused by the AdMob path (which is verified by signature); this is the
-- seam phase 2 fills for Tapsell/Adivery.
create table if not exists public.ad_reward_nonces (
  nonce       text primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null,
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  consumed_at timestamptz
);

create index if not exists ad_reward_nonces_by_expiry
  on public.ad_reward_nonces (expires_at);

-- ── RLS: read-your-own, write-never ──────────────────────────────────────

alter table public.ai_credit_balances enable row level security;
alter table public.ai_credit_events   enable row level security;
alter table public.ad_reward_nonces   enable row level security;

drop policy if exists "ai_credit_balances_select_own" on public.ai_credit_balances;
create policy "ai_credit_balances_select_own" on public.ai_credit_balances
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "ai_credit_events_select_own" on public.ai_credit_events;
create policy "ai_credit_events_select_own" on public.ai_credit_events
  for select to authenticated
  using (auth.uid() = user_id);

-- ad_reward_nonces gets no policy at all: clients never read or write it.

-- Column privileges as a second wall, independent of RLS.
revoke insert, update, delete on public.ai_credit_balances from anon, authenticated;
revoke insert, update, delete on public.ai_credit_events   from anon, authenticated;
revoke all                    on public.ad_reward_nonces   from anon, authenticated;

-- ── ai_credit_grant ──────────────────────────────────────────────────────

create or replace function public.ai_credit_grant(
  p_user_id uuid,
  p_delta integer,
  p_reason text,
  p_provider text,
  p_external_id text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  if p_delta <= 0 then
    raise exception 'ai_credit_grant requires a positive delta, got %', p_delta;
  end if;

  -- Idempotency. A replayed AdMob callback, or a retried claim, must be a
  -- no-op that still reports the current balance.
  if p_external_id is not null and exists (
    select 1 from public.ai_credit_events
     where coalesce(provider, '') = coalesce(p_provider, '')
       and external_id = p_external_id
  ) then
    select coalesce(balance, 0) into new_balance
      from public.ai_credit_balances where user_id = p_user_id;
    return coalesce(new_balance, 0);
  end if;

  insert into public.ai_credit_events (user_id, delta, reason, provider, external_id)
    values (p_user_id, p_delta, p_reason, p_provider, p_external_id);

  insert into public.ai_credit_balances (user_id, balance, lifetime_granted, updated_at)
    values (p_user_id, p_delta, p_delta, now())
  on conflict (user_id) do update
    set balance          = public.ai_credit_balances.balance + p_delta,
        lifetime_granted = public.ai_credit_balances.lifetime_granted + p_delta,
        updated_at       = now()
  returning balance into new_balance;

  return new_balance;
exception
  when unique_violation then
    -- Two copies of the same callback arrived concurrently and this one lost
    -- the race on ai_credit_events_provider_external. The other transaction
    -- granted; report the balance rather than failing the caller.
    select coalesce(balance, 0) into new_balance
      from public.ai_credit_balances where user_id = p_user_id;
    return coalesce(new_balance, 0);
end;
$$;

-- ── ai_credit_spend ──────────────────────────────────────────────────────

create or replace function public.ai_credit_spend(
  p_user_id uuid,
  p_action text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance integer;
begin
  -- `and balance > 0` inside the UPDATE is what makes this safe under
  -- concurrency: the row lock is held for the check and the decrement
  -- together, so two simultaneous calls against a balance of 1 cannot both
  -- succeed. A read-then-write would oversell here.
  update public.ai_credit_balances
     set balance        = balance - 1,
         lifetime_spent = lifetime_spent + 1,
         updated_at     = now()
   where user_id = p_user_id
     and balance > 0
  returning balance into new_balance;

  if new_balance is null then
    return -1;
  end if;

  insert into public.ai_credit_events (user_id, delta, reason, action)
    values (p_user_id, -1, 'spend', p_action);

  return new_balance;
end;
$$;

-- Only the service role (Edge Functions) may call these directly.
revoke all on function public.ai_credit_grant(uuid, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.ai_credit_spend(uuid, text)                      from public, anon, authenticated;
grant execute on function public.ai_credit_grant(uuid, integer, text, text, text) to service_role;
grant execute on function public.ai_credit_spend(uuid, text)                      to service_role;

-- ── Signup grant ─────────────────────────────────────────────────────────
--
-- Extends the existing profile-seeding trigger. Firing on `auth.users` insert
-- means this is once per account: reinstalling the app reuses the same
-- account and grants nothing further. The `external_id` makes it idempotent
-- even if the trigger is ever re-run against an existing row.
--
-- The amount lives here rather than in an Edge Function env var because a
-- Postgres trigger cannot read one. Changing it is a migration.

create or replace function public.tally_handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  perform public.ai_credit_grant(new.id, 5, 'signup_grant', null, 'signup:' || new.id::text);

  return new;
end;
$$;
```

- [ ] **Step 4: Apply the migration and run the test to verify it passes**

Run:
```bash
supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -v ON_ERROR_STOP=1 -f supabase/scripts/test_ai_credits.sql
```
Expected: `NOTICE: ai_credits: all assertions passed`, exit code 0.

- [ ] **Step 5: Verify a client cannot write the ledger**

This is the security property the whole feature depends on, so check it rather than assume it. Run against the local stack with an `authenticated` role:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -c "
  set local role authenticated;
  insert into public.ai_credit_balances (user_id, balance) values (gen_random_uuid(), 999);
"
```
Expected: FAIL with `permission denied for table ai_credit_balances`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260801000000_ai_credits.sql supabase/scripts/test_ai_credits.sql
git commit -m "feat(db): add AI credit ledger with idempotent grant and safe spend"
```

---

## Task 2: The credit cost rule

One tiny module holding the billing rule, plus a test that fails if the Edge Function's copy of the rule drifts from it. The rule exists in two runtimes (Node/RN and Deno) that cannot share imports, so a drift guard replaces the shared import.

**Files:**
- Create: `src/core/aiCreditCost.ts`
- Create: `src/core/aiCreditCost.test.ts`

**Interfaces:**
- Produces:
  - `type AiProxyAction = "parse-receipt" | "parse-description" | "classify-category" | "transcribe"`
  - `const FREE_AI_ACTIONS: readonly AiProxyAction[]`
  - `function aiCreditCost(action: AiProxyAction): 0 | 1`

- [ ] **Step 1: Write the failing test**

Create `src/core/aiCreditCost.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { aiCreditCost, FREE_AI_ACTIONS, type AiProxyAction } from "./aiCreditCost";

describe("aiCreditCost", () => {
  it("charges one credit for the three user-initiated actions", () => {
    expect(aiCreditCost("parse-receipt")).toBe(1);
    expect(aiCreditCost("parse-description")).toBe(1);
    expect(aiCreditCost("transcribe")).toBe(1);
  });

  it("does not charge for classify-category", () => {
    // The app issues this on its own when the group-type picker is off
    // (isGroupTypePickerEnabled), so charging would drain credits the user
    // never chose to spend.
    expect(aiCreditCost("classify-category")).toBe(0);
  });

  it("lists exactly the free actions", () => {
    expect([...FREE_AI_ACTIONS]).toEqual(["classify-category"]);
  });
});

describe("ai-proxy billing rule", () => {
  it("matches the free-action list compiled into the Edge Function", () => {
    // The Edge Function runs on Deno and cannot import from src/, so it keeps
    // its own copy of the rule. This guard fails if the two drift apart.
    const source = readFileSync("supabase/functions/ai-proxy/index.ts", "utf8");
    const match = source.match(/const FREE_ACTIONS = new Set<string>\(\[([^\]]*)\]\)/);
    expect(match, "FREE_ACTIONS not found in ai-proxy/index.ts").toBeTruthy();

    const edgeActions = [...match![1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(edgeActions.sort()).toEqual([...FREE_AI_ACTIONS].sort());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/aiCreditCost.test.ts`
Expected: FAIL with `Failed to resolve import "./aiCreditCost"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/aiCreditCost.ts`:

```ts
/**
 * The billing rule for AI proxy calls — one credit per call, except for
 * actions the app issues on the user's behalf.
 *
 * `ai-proxy` keeps its own copy of `FREE_ACTIONS` because it runs on Deno and
 * cannot import from `src/`. `aiCreditCost.test.ts` reads the function's
 * source and fails if the two ever disagree.
 */

export type AiProxyAction =
  | "parse-receipt"
  | "parse-description"
  | "classify-category"
  | "transcribe";

/**
 * `classify-category` is fired by the app itself when the group-type picker
 * is disabled (see `isGroupTypePickerEnabled` in `featureFlags.ts`). Charging
 * for a call the user never initiated reads as a bug, so it is free.
 */
export const FREE_AI_ACTIONS: readonly AiProxyAction[] = ["classify-category"];

export function aiCreditCost(action: AiProxyAction): 0 | 1 {
  return FREE_AI_ACTIONS.includes(action) ? 0 : 1;
}
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run src/core/aiCreditCost.test.ts`
Expected: the first three tests PASS; the drift guard FAILS with `FREE_ACTIONS not found in ai-proxy/index.ts`, because Task 4 has not run yet.

Leave it failing. Task 4 makes it pass — that is exactly what the guard is for. Do not weaken the test to make it green here.

- [ ] **Step 5: Commit**

```bash
git add src/core/aiCreditCost.ts src/core/aiCreditCost.test.ts
git commit -m "feat(core): add AI credit cost rule with edge-function drift guard"
```

---

## Task 3: The AI access predicate

Pulls the branching out of `AiReceiptScreen` so it is testable even though the screen is not.

**Files:**
- Create: `src/core/aiAccess.ts`
- Create: `src/core/aiAccess.test.ts`

**Interfaces:**
- Produces:
  - `type AiAccessState = "allowed" | "needs_signin" | "needs_credits" | "no_ads_available"`
  - `type AiAccessInput = { signedIn: boolean; emailConfirmed: boolean; isPremium: boolean; balance: number; adsAvailable: boolean }`
  - `function resolveAiAccess(input: AiAccessInput): AiAccessState`

- [ ] **Step 1: Write the failing test**

Create `src/core/aiAccess.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { resolveAiAccess, type AiAccessInput } from "./aiAccess";

const base: AiAccessInput = {
  signedIn: true,
  emailConfirmed: true,
  isPremium: false,
  balance: 0,
  adsAvailable: true,
};

describe("resolveAiAccess", () => {
  it("requires sign-in before anything else", () => {
    expect(resolveAiAccess({ ...base, signedIn: false })).toBe("needs_signin");
    // Even a premium user with credits has to be signed in — the proxy
    // rejects anonymous callers, so letting them through would 401.
    expect(
      resolveAiAccess({ ...base, signedIn: false, isPremium: true, balance: 99 }),
    ).toBe("needs_signin");
  });

  it("treats an unconfirmed email as not signed in", () => {
    expect(resolveAiAccess({ ...base, emailConfirmed: false })).toBe("needs_signin");
  });

  it("allows premium users regardless of balance", () => {
    expect(resolveAiAccess({ ...base, isPremium: true, balance: 0 })).toBe("allowed");
  });

  it("allows a non-premium user holding credits", () => {
    expect(resolveAiAccess({ ...base, balance: 1 })).toBe("allowed");
  });

  it("asks for credits when the balance is empty and ads can be shown", () => {
    expect(resolveAiAccess({ ...base, balance: 0, adsAvailable: true })).toBe("needs_credits");
  });

  it("reports no ads available when the balance is empty and there is no provider", () => {
    // Web: the signup grant is spendable but there is no way to earn more.
    expect(resolveAiAccess({ ...base, balance: 0, adsAvailable: false })).toBe(
      "no_ads_available",
    );
  });

  it("ignores ad availability while the user still has credits", () => {
    expect(resolveAiAccess({ ...base, balance: 2, adsAvailable: false })).toBe("allowed");
  });

  it("treats a negative balance as empty", () => {
    expect(resolveAiAccess({ ...base, balance: -1 })).toBe("needs_credits");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/core/aiAccess.test.ts`
Expected: FAIL with `Failed to resolve import "./aiAccess"`.

- [ ] **Step 3: Write the implementation**

Create `src/core/aiAccess.ts`:

```ts
/**
 * Whether a user may invoke an AI feature, and if not, why.
 *
 * This is the rule `AiReceiptScreen.ensureAiAccess` consults. It lives here as
 * a pure function so the branching is testable without rendering the screen —
 * the same split the codebase already uses for `splitEqual` and `balances`.
 *
 * Note the ordering: sign-in is checked before entitlement, because `ai-proxy`
 * rejects anonymous callers outright. Sending a signed-out premium user to the
 * AI path would just produce a 401.
 */

export type AiAccessState =
  /** Go ahead — premium, or holding at least one credit. */
  | "allowed"
  /** Not signed in, or email not confirmed yet. Send them to Auth. */
  | "needs_signin"
  /** Out of credits, but an ad provider is available. Offer the ad. */
  | "needs_credits"
  /** Out of credits with no ad provider (web). Offer a pass instead. */
  | "no_ads_available";

export type AiAccessInput = {
  signedIn: boolean;
  emailConfirmed: boolean;
  /** Active pass, `profiles.is_premium`, or `is_alpha`. Grants unlimited AI. */
  isPremium: boolean;
  balance: number;
  /** True when a rewarded-ad provider can actually show an ad here. */
  adsAvailable: boolean;
};

export function resolveAiAccess(input: AiAccessInput): AiAccessState {
  if (!input.signedIn || !input.emailConfirmed) return "needs_signin";
  if (input.isPremium) return "allowed";
  if (input.balance > 0) return "allowed";
  return input.adsAvailable ? "needs_credits" : "no_ads_available";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/core/aiAccess.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/core/aiAccess.ts src/core/aiAccess.test.ts
git commit -m "feat(core): add pure AI access predicate"
```

---

## Task 4: Bill AI proxy calls against the ledger

The proxy stops being a premium wall and becomes a meter. This is independently shippable: every user with AI access today is `is_premium`, so they skip billing entirely and see no behaviour change.

**Files:**
- Modify: `supabase/functions/ai-proxy/index.ts` (header comment, `CORS_HEADERS`, `requireAuthed`, entry point)

**Interfaces:**
- Consumes: `public.ai_credit_spend`, `public.ai_credit_grant` from Task 1; the `FREE_AI_ACTIONS` rule from Task 2.
- Produces:
  - 402 `{ error: "insufficient_credits", balance: 0 }` for a spent-out non-premium caller.
  - `X-Tally-Credits-Remaining` response header on billed successes.
  - `const FREE_ACTIONS = new Set<string>([...])` — the symbol Task 2's drift guard greps for. Do not rename it without updating that test.

- [ ] **Step 1: Update the CORS block to expose the credits header**

In `supabase/functions/ai-proxy/index.ts`, replace the `CORS_HEADERS` constant:

```ts
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  // Without this the web build cannot read the credits header off the
  // response — cross-origin reads see only the CORS-safelisted headers.
  "Access-Control-Expose-Headers": "X-Tally-Credits-Remaining",
  "Access-Control-Max-Age": "86400",
};
```

- [ ] **Step 2: Make `requireAuthed` report entitlement instead of enforcing it**

Replace the premium rejection in `requireAuthed` (currently `ai-proxy/index.ts:103-107`):

```ts
  const isPremium = Boolean(profile?.is_premium);
  if (!isPremium) {
    return jsonResponse(402, { error: "premium_required" });
  }
  return { userId: data.user.id, isPremium, admin };
```

with:

```ts
  // Entitlement is reported, not enforced, here. Non-premium callers are no
  // longer rejected outright — they pay per call from the credit ledger. The
  // billing decision lives in the entry point so it can see the action.
  const isPremium = Boolean(profile?.is_premium);
  return { userId: data.user.id, isPremium, admin };
```

- [ ] **Step 3: Add the billing helpers**

Insert immediately after the `enforceRateLimit` function (after `ai-proxy/index.ts:150`):

```ts
// ────────────────────────── Credit billing ──────────────────────────
//
// Non-premium callers pay one credit per call. The canonical copy of this
// rule is `src/core/aiCreditCost.ts`; that module's test greps this file and
// fails if the two lists drift, since Deno cannot import from `src/`.

const FREE_ACTIONS = new Set<string>(["classify-category"]);

/**
 * Spend one credit. Returns the remaining balance, or a Response to return
 * to the caller when the spend cannot proceed.
 *
 * Unlike `enforceRateLimit`, this **fails closed**. That function may fail
 * open because the premium gate used to bound the bill; once non-paying users
 * reach the proxy that reasoning no longer holds, and an unavailable ledger
 * must stop the request rather than hand out free model calls.
 */
async function spendCredit(
  admin: SupabaseClient,
  userId: string,
  action: string,
): Promise<number | Response> {
  const { data, error } = await admin.rpc("ai_credit_spend", {
    p_user_id: userId,
    p_action: action,
  });
  if (error) {
    console.error("credit_spend_unavailable", error.message);
    return jsonResponse(503, { error: "credits_unavailable" });
  }
  const balance = typeof data === "number" ? data : Number(data ?? -1);
  if (balance < 0) {
    return jsonResponse(402, { error: "insufficient_credits", balance: 0 });
  }
  return balance;
}

/**
 * Give a spent credit back when the upstream model call failed. Best-effort:
 * a failed refund is logged, never surfaced, because the user is already
 * getting an error and a second one would not help them.
 */
async function refundCredit(
  admin: SupabaseClient,
  userId: string,
  action: string,
): Promise<void> {
  const { error } = await admin.rpc("ai_credit_grant", {
    p_user_id: userId,
    p_delta: 1,
    p_reason: "refund",
    p_provider: null,
    p_external_id: null,
  });
  if (error) console.error("credit_refund_failed", userId, action, error.message);
}

/** Copy a response, adding the caller's remaining balance as a header. */
function withCreditsHeader(res: Response, remaining: number): Response {
  const headers = new Headers(res.headers);
  headers.set("X-Tally-Credits-Remaining", String(remaining));
  return new Response(res.body, { status: res.status, headers });
}
```

- [ ] **Step 4: Wire billing into the entry point**

Replace the block from `const limited = await enforceRateLimit(...)` to the end of the `Deno.serve` handler (`ai-proxy/index.ts:463-480`):

```ts
  const limited = await enforceRateLimit(auth.admin, auth.userId, action);
  if (limited) return limited;

  // Premium (active pass / is_premium / is_alpha) means unlimited AI, and
  // `classify-category` is never billed. Everyone else pays a credit.
  const billable = !auth.isPremium && !FREE_ACTIONS.has(action);
  let remaining: number | null = null;
  if (billable) {
    const spent = await spendCredit(auth.admin, auth.userId, action);
    if (spent instanceof Response) return spent;
    remaining = spent;
  }

  const runAction = async (): Promise<Response> => {
    switch (action) {
      case "parse-receipt":
        return await handleParseReceipt(body);
      case "parse-description":
        return await handleParseDescription(body);
      case "classify-category":
        return await handleClassifyCategory(body);
      case "transcribe":
        return await handleTranscribe(body);
    }
    return jsonResponse(400, { error: "unknown_action" });
  };

  try {
    const res = await runAction();
    // A provider outage must not cost the user an ad. Handlers signal
    // failure either by throwing or by returning a non-2xx Response, so
    // both paths refund.
    if (billable && !res.ok) {
      await refundCredit(auth.admin, auth.userId, action);
      return res;
    }
    return remaining === null ? res : withCreditsHeader(res, remaining);
  } catch (e) {
    if (billable) await refundCredit(auth.admin, auth.userId, action);
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(502, { error: "upstream_failed", detail: msg.slice(0, 400) });
  }
});
```

- [ ] **Step 5: Update the function's header comment**

The comment block at the top of the file still describes a premium wall. Replace bullet 3 (`ai-proxy/index.ts:6`):

```
//   3. enforces the premium gate (server-side — the client copy is just a hint)
```

with:

```
//   3. bills the call: premium callers are unlimited, everyone else spends one
//      credit from the ledger (refunded if the upstream call fails)
```

and add to the optional-tuning block after the rate-limit vars (`ai-proxy/index.ts:28`):

```
//
// Credit billing (see 20260801000000_ai_credits.sql):
//   Non-premium callers spend one credit per call except `classify-category`.
//   Out of credits → 402 `insufficient_credits`. Ledger unreachable → 503.
```

- [ ] **Step 6: Verify the drift guard from Task 2 now passes**

Run: `npx vitest run src/core/aiCreditCost.test.ts`
Expected: PASS, all 4 tests — the guard now finds `FREE_ACTIONS` and matches it against `FREE_AI_ACTIONS`.

- [ ] **Step 7: Deploy and verify against the local stack**

Run:
```bash
supabase functions serve ai-proxy --no-verify-jwt=false
```

With a signed-in non-premium test user's JWT, call `classify-category` and confirm no credit is spent, then call `parse-description` twice from a balance of 1 and confirm the second returns 402:

```bash
curl -s -D- -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TEST_JWT" -H 'Content-Type: application/json' \
  -d '{"action":"parse-description","prompt":"lunch 20"}' | head -20
```
Expected on the first call: `200` with `X-Tally-Credits-Remaining: 0`. On the second: `402` with `{"error":"insufficient_credits","balance":0}`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/ai-proxy/index.ts
git commit -m "feat(ai-proxy): bill non-premium calls against the credit ledger"
```

---

## Task 5: AdMob SSV signature verification

The security boundary of the whole feature. `ad-reward`'s SSV route is unauthenticated — the signature is its *only* authentication — so this logic gets real tests before anything calls it.

Google signs with **ECDSA on P-256**, and the signature arrives base64url-encoded in **DER**, while Web Crypto's `verify` wants raw `r||s`. The DER→raw conversion is where this goes wrong quietly, so it is tested directly.

**Files:**
- Create: `supabase/functions/ad-reward/admobSsv.ts`
- Create: `supabase/functions/ad-reward/admobSsv.test.ts`
- Modify: `vitest.config.ts`

**Interfaces:**
- Produces:
  - `function extractSignedContent(rawQuery: string): string | null`
  - `function base64UrlToBytes(input: string): Uint8Array`
  - `function derToRawEcdsaSignature(der: Uint8Array): Uint8Array`
  - `function pemToSpki(pem: string): Uint8Array`
  - `async function verifyAdMobSignature(opts: { rawQuery: string; signatureB64Url: string; publicKeyPem: string }): Promise<boolean>`

This module must import nothing — no Deno globals, no npm specifiers — so Vitest can run it under Node. It uses only `globalThis.crypto.subtle`, `atob`, and `TextEncoder`, all present in both runtimes.

- [ ] **Step 1: Extend the Vitest include path**

Replace `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Edge Function helpers are plain TypeScript with no Deno imports, so
    // they run under Node here. Anything importing `npm:` or `Deno.*` must
    // stay out of a `.test.ts`-adjacent module.
    include: ["src/**/*.test.ts", "supabase/functions/**/*.test.ts"],
  },
});
```

- [ ] **Step 2: Write the failing test**

Create `supabase/functions/ad-reward/admobSsv.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  derToRawEcdsaSignature,
  extractSignedContent,
  verifyAdMobSignature,
} from "./admobSsv";

/** DER-encode a raw 64-byte (r||s) ECDSA signature, the way Google sends it. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const encodeInt = (bytes: Uint8Array): number[] => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    const trimmed = [...bytes.slice(i)];
    // DER integers are signed: a leading bit of 1 needs a 0x00 pad.
    if (trimmed[0]! & 0x80) trimmed.unshift(0x00);
    return [0x02, trimmed.length, ...trimmed];
  };
  const r = encodeInt(raw.slice(0, 32));
  const s = encodeInt(raw.slice(32));
  const body = [...r, ...s];
  return new Uint8Array([0x30, body.length, ...body]);
}

function spkiToPem(spki: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

describe("extractSignedContent", () => {
  it("returns everything before &signature=", () => {
    // Google signs the query string up to (but excluding) the signature and
    // key_id parameters, which are always last and in that order.
    const q =
      "ad_network=5450213213286189855&ad_unit=1234&reward_amount=3" +
      "&reward_item=credits&timestamp=1700000000000&transaction_id=abc" +
      "&user_id=u-1&signature=SIG&key_id=3335741209";
    expect(extractSignedContent(q)).toBe(
      "ad_network=5450213213286189855&ad_unit=1234&reward_amount=3" +
        "&reward_item=credits&timestamp=1700000000000&transaction_id=abc&user_id=u-1",
    );
  });

  it("tolerates a leading question mark", () => {
    expect(extractSignedContent("?a=1&signature=x&key_id=y")).toBe("a=1");
  });

  it("returns null when there is no signature parameter", () => {
    expect(extractSignedContent("a=1&b=2")).toBeNull();
  });

  it("returns null when signature is the first parameter", () => {
    // Nothing was signed — treat as malformed rather than verifying "".
    expect(extractSignedContent("signature=x&key_id=y")).toBeNull();
  });
});

describe("base64UrlToBytes", () => {
  it("decodes base64url with - and _ and no padding", () => {
    // 0xFB 0xFF 0xBE => "-_--" in base64url, "+/++" in standard base64.
    expect([...base64UrlToBytes("-_--")]).toEqual([0xfb, 0xff, 0xbe]);
  });

  it("decodes a value needing padding", () => {
    expect([...base64UrlToBytes("QQ")]).toEqual([0x41]);
  });
});

describe("derToRawEcdsaSignature", () => {
  it("unwraps a plain 32-byte r and s", () => {
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw.length).toBe(64);
    expect([...raw.slice(0, 32)]).toEqual([...r]);
    expect([...raw.slice(32)]).toEqual([...s]);
  });

  it("strips the 0x00 pad DER adds to a high-bit integer", () => {
    const r = new Uint8Array(32).fill(0x80); // high bit set → DER pads it
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([
      0x30, 0x45, 0x02, 0x21, 0x00, ...r, 0x02, 0x20, ...s,
    ]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw.length).toBe(64);
    expect([...raw.slice(0, 32)]).toEqual([...r]);
  });

  it("left-pads an integer shorter than 32 bytes", () => {
    const rShort = new Uint8Array(30).fill(0x33);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([
      0x30, 0x42, 0x02, 0x1e, ...rShort, 0x02, 0x20, ...s,
    ]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw.length).toBe(64);
    expect([...raw.slice(0, 2)]).toEqual([0, 0]);
    expect([...raw.slice(2, 32)]).toEqual([...rShort]);
  });

  it("rejects a non-sequence", () => {
    expect(() => derToRawEcdsaSignature(new Uint8Array([0x31, 0x00]))).toThrow();
  });
});

describe("verifyAdMobSignature", () => {
  it("accepts a signature over the signed content and rejects a tampered one", async () => {
    // Generate our own P-256 key, sign the way Google does (ECDSA/SHA-256,
    // DER-wrapped), and push it through the real verification path. This
    // exercises every step end-to-end without needing a live Google key.
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pem = spkiToPem(await crypto.subtle.exportKey("spki", pair.publicKey));

    const signed = "reward_amount=3&transaction_id=abc&user_id=u-1";
    const rawQuery = `${signed}&signature=PLACEHOLDER&key_id=1`;

    const rawSig = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(signed),
      ),
    );
    const der = rawToDer(rawSig);
    const sigB64Url = btoa(String.fromCharCode(...der))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await expect(
      verifyAdMobSignature({ rawQuery, signatureB64Url: sigB64Url, publicKeyPem: pem }),
    ).resolves.toBe(true);

    // Same signature, different content — a forged reward amount.
    const tampered = rawQuery.replace("reward_amount=3", "reward_amount=300");
    await expect(
      verifyAdMobSignature({
        rawQuery: tampered,
        signatureB64Url: sigB64Url,
        publicKeyPem: pem,
      }),
    ).resolves.toBe(false);
  });

  it("returns false rather than throwing on a malformed signature", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pem = spkiToPem(await crypto.subtle.exportKey("spki", pair.publicKey));
    await expect(
      verifyAdMobSignature({
        rawQuery: "a=1&signature=notbase64!!&key_id=1",
        signatureB64Url: "notbase64!!",
        publicKeyPem: pem,
      }),
    ).resolves.toBe(false);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run supabase/functions/ad-reward/admobSsv.test.ts`
Expected: FAIL with `Failed to resolve import "./admobSsv"`.

- [ ] **Step 4: Write the implementation**

Create `supabase/functions/ad-reward/admobSsv.ts`:

```ts
/**
 * AdMob server-side verification (SSV) signature checking.
 *
 * AdMob calls our reward endpoint over plain HTTP GET with no credentials —
 * the ECDSA signature is the only thing distinguishing a real callback from
 * anyone who guessed the URL. Getting this wrong means anyone can mint
 * credits, so every failure path here returns false rather than throwing past
 * the caller.
 *
 * Google signs with ECDSA on P-256 / SHA-256 and sends the signature
 * base64url-encoded in DER. Web Crypto's `verify` wants the raw `r||s` pair,
 * hence `derToRawEcdsaSignature`.
 *
 * Deliberately dependency-free (no `Deno.*`, no `npm:` imports) so Vitest can
 * run it under Node. Keep it that way.
 */

/**
 * The bytes Google signed: the query string up to, but excluding, the
 * `signature` parameter. Google documents `signature` and `key_id` as always
 * being the final two parameters, in that order.
 *
 * Returns null when the query is malformed — no signature, or nothing before
 * it — so the caller rejects rather than verifying an empty string.
 */
export function extractSignedContent(rawQuery: string): string | null {
  const query = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const marker = "&signature=";
  const idx = query.indexOf(marker);
  if (idx <= 0) return null;
  return query.slice(0, idx);
}

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * DER `SEQUENCE { INTEGER r, INTEGER s }` → raw 64-byte `r||s`.
 *
 * DER integers are signed and minimally encoded, so `r` may carry a leading
 * 0x00 pad (when its high bit is set) or be shorter than 32 bytes (when it
 * has leading zero bytes). Both are normalized to a fixed 32-byte field.
 */
export function derToRawEcdsaSignature(der: Uint8Array): Uint8Array {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("der_not_sequence");

  // Sequence length: short form only. A P-256 signature is ~70 bytes, well
  // under the 128-byte threshold where DER switches to long form.
  const seqLen = der[offset++]!;
  if (seqLen + 2 !== der.length) throw new Error("der_bad_length");

  const readInt = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new Error("der_not_integer");
    const len = der[offset++]!;
    const bytes = der.slice(offset, offset + len);
    offset += len;

    const field = new Uint8Array(32);
    if (bytes.length > 32) {
      // Leading 0x00 sign pad — drop it.
      field.set(bytes.slice(bytes.length - 32));
    } else {
      // Shorter than the field — right-align it.
      field.set(bytes, 32 - bytes.length);
    }
    return field;
  };

  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/** Strip PEM armour and decode the SubjectPublicKeyInfo DER. */
export function pemToSpki(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return base64UrlToBytes(body);
}

export async function verifyAdMobSignature(opts: {
  rawQuery: string;
  signatureB64Url: string;
  publicKeyPem: string;
}): Promise<boolean> {
  try {
    const content = extractSignedContent(opts.rawQuery);
    if (!content) return false;

    const key = await crypto.subtle.importKey(
      "spki",
      pemToSpki(opts.publicKeyPem),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const raw = derToRawEcdsaSignature(base64UrlToBytes(opts.signatureB64Url));

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      raw,
      new TextEncoder().encode(content),
    );
  } catch {
    // Malformed input is an unverified callback, not a server error.
    return false;
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/ad-reward/admobSsv.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 6: Confirm the whole suite still runs**

Run: `npm test`
Expected: PASS — the widened `include` picks up the new file without disturbing the existing `src/` tests.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts supabase/functions/ad-reward/admobSsv.ts \
        supabase/functions/ad-reward/admobSsv.test.ts
git commit -m "feat(ad-reward): add tested AdMob SSV signature verification"
```

---

## Task 6: The `ad-reward` Edge Function

**Files:**
- Create: `supabase/functions/ad-reward/index.ts`
- Modify: `supabase/config.toml`
- Modify: `Makefile`

**Interfaces:**
- Consumes: `verifyAdMobSignature` (Task 5), `ai_credit_grant` (Task 1).
- Produces (client-facing):
  - `POST {SYNC_URL}/functions/v1/ad-reward/nonce` → `{ nonce: string }`, requires a Bearer JWT.
  - `POST {SYNC_URL}/functions/v1/ad-reward/claim` body `{ nonce, provider }` → `{ balance: number }`, requires a Bearer JWT.
  - `GET {SYNC_URL}/functions/v1/ad-reward/admob-ssv?...` → `200 OK` for AdMob, no auth.

- [ ] **Step 1: Register the function as JWT-exempt**

Append to `supabase/config.toml`:

```toml
# AdMob's SSV callback arrives with no JWT — its only credential is the ECDSA
# signature, which `admobSsv.ts` checks. The /nonce and /claim routes verify
# the caller's JWT by hand inside the function.
[functions.ad-reward]
verify_jwt = false
```

- [ ] **Step 2: Write the function**

Create `supabase/functions/ad-reward/index.ts`:

```ts
// Grants AI credits for completed rewarded ads.
//
// Routes:
//   POST /ad-reward/nonce       authed — issue a single-use challenge
//   POST /ad-reward/claim       authed — redeem a challenge for credits
//   GET  /ad-reward/admob-ssv   unauthed — AdMob's signed callback
//
// Deployed with `verify_jwt = false` (see config.toml) because AdMob presents
// no JWT. The two POST routes therefore verify the Bearer token themselves;
// the SSV route's only credential is its ECDSA signature.
//
// Project secrets:
//   AD_REWARD_CREDITS    3   credits granted per completed ad
//   AD_REWARDS_ENABLED   0   kill-switch; "1" to enable grants
//
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { verifyAdMobSignature } from "./admobSsv.ts";

type Json = Record<string, unknown>;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

const NONCE_TTL_MS = 5 * 60 * 1000;
const ADMOB_KEYS_URL = "https://gstatic.com/admob/reward/verifier-keys.json";

function jsonResponse(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rewardsEnabled(): boolean {
  const v = env("AD_REWARDS_ENABLED").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function adminClient(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/** Verify the caller's Bearer token; returns the user id or a Response. */
async function requireUser(req: Request): Promise<string | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  if (!url || !anon) return jsonResponse(500, { error: "server_misconfigured" });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return jsonResponse(401, { error: "unauthorized" });
  return data.user.id;
}

// ────────────────────────── AdMob verifier keys ──────────────────────────
//
// Google rotates these. Cached in module scope so a warm instance does not
// refetch per callback, and refetched on a key_id miss so rotation heals
// itself without a redeploy.

type VerifierKey = { keyId: number; pem: string };
let keyCache: Map<string, string> | null = null;

async function fetchVerifierKeys(): Promise<Map<string, string>> {
  const res = await fetch(ADMOB_KEYS_URL);
  if (!res.ok) throw new Error(`verifier_keys_http_${res.status}`);
  const body = (await res.json()) as { keys?: VerifierKey[] };
  const map = new Map<string, string>();
  for (const k of body.keys ?? []) map.set(String(k.keyId), k.pem);
  return map;
}

async function publicKeyFor(keyId: string): Promise<string | null> {
  if (keyCache?.has(keyId)) return keyCache.get(keyId)!;
  keyCache = await fetchVerifierKeys();
  return keyCache.get(keyId) ?? null;
}

// ────────────────────────── Routes ──────────────────────────

async function handleNonce(req: Request): Promise<Response> {
  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const provider = typeof body.provider === "string" ? body.provider : "";
  if (!provider) return jsonResponse(400, { error: "provider_required" });

  const admin = adminClient();
  if (!admin) return jsonResponse(500, { error: "server_misconfigured" });

  const nonce = crypto.randomUUID();
  const { error } = await admin.from("ad_reward_nonces").insert({
    nonce,
    user_id: user,
    provider,
    expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
  });
  if (error) return jsonResponse(500, { error: "nonce_failed" });

  return jsonResponse(200, { nonce });
}

async function handleClaim(req: Request): Promise<Response> {
  if (!rewardsEnabled()) return jsonResponse(503, { error: "rewards_disabled" });

  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  if (!nonce) return jsonResponse(400, { error: "nonce_required" });

  const admin = adminClient();
  if (!admin) return jsonResponse(500, { error: "server_misconfigured" });

  // Consume the nonce with a conditional update, so two concurrent claims of
  // the same nonce cannot both find it unconsumed.
  const { data: consumed, error: consumeError } = await admin
    .from("ad_reward_nonces")
    .update({ consumed_at: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("user_id", user)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("nonce, provider")
    .maybeSingle();

  if (consumeError) return jsonResponse(500, { error: "claim_failed" });
  if (!consumed) return jsonResponse(400, { error: "nonce_invalid" });

  const { data, error } = await admin.rpc("ai_credit_grant", {
    p_user_id: user,
    p_delta: envInt("AD_REWARD_CREDITS", 3),
    p_reason: "ad_reward",
    p_provider: (consumed as { provider: string }).provider,
    p_external_id: nonce,
  });
  if (error) return jsonResponse(500, { error: "grant_failed" });

  return jsonResponse(200, { balance: typeof data === "number" ? data : Number(data ?? 0) });
}

async function handleAdMobSsv(req: Request): Promise<Response> {
  // AdMob retries non-2xx responses. Return 200 for anything we have decided
  // about — including a rejected signature — and reserve non-2xx for our own
  // transient failures, so Google retries only what a retry could fix.
  if (!rewardsEnabled()) return new Response("disabled", { status: 200 });

  const url = new URL(req.url);
  const params = url.searchParams;
  const signature = params.get("signature") ?? "";
  const keyId = params.get("key_id") ?? "";
  const userId = params.get("user_id") ?? "";
  const transactionId = params.get("transaction_id") ?? "";

  if (!signature || !keyId || !userId || !transactionId) {
    console.warn("ssv_missing_params");
    return new Response("bad request", { status: 200 });
  }

  let pem: string | null;
  try {
    pem = await publicKeyFor(keyId);
  } catch (e) {
    // Google's key server is unreachable — this one IS worth retrying.
    console.error("ssv_keys_unavailable", e instanceof Error ? e.message : String(e));
    return new Response("key server unavailable", { status: 503 });
  }
  if (!pem) {
    console.warn("ssv_unknown_key_id", keyId);
    return new Response("unknown key", { status: 200 });
  }

  const ok = await verifyAdMobSignature({
    rawQuery: url.search,
    signatureB64Url: signature,
    publicKeyPem: pem,
  });
  if (!ok) {
    // The only authentication this route has. Never fail open.
    console.warn("ssv_bad_signature", transactionId);
    return new Response("invalid signature", { status: 200 });
  }

  const admin = adminClient();
  if (!admin) return new Response("misconfigured", { status: 503 });

  // `transaction_id` as the idempotency key: AdMob may deliver the same
  // callback more than once, and the ledger's unique index makes the repeat
  // a no-op.
  const { error } = await admin.rpc("ai_credit_grant", {
    p_user_id: userId,
    p_delta: envInt("AD_REWARD_CREDITS", 3),
    p_reason: "ad_reward",
    p_provider: "admob",
    p_external_id: transactionId,
  });
  if (error) {
    console.error("ssv_grant_failed", transactionId, error.message);
    return new Response("grant failed", { status: 503 });
  }

  return new Response("ok", { status: 200 });
}

// ────────────────────────── Entry point ──────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const path = new URL(req.url).pathname.replace(/\/+$/, "");

  if (req.method === "GET" && path.endsWith("/admob-ssv")) {
    return await handleAdMobSsv(req);
  }
  if (req.method === "POST" && path.endsWith("/nonce")) {
    return await handleNonce(req);
  }
  if (req.method === "POST" && path.endsWith("/claim")) {
    return await handleClaim(req);
  }

  return jsonResponse(404, { error: "not_found" });
});
```

- [ ] **Step 3: Add Makefile targets**

In `Makefile`, add after the `AI_PROXY_SECRETS` block (line 37):

```make
AD_REWARD_SECRETS = \
	AD_REWARD_CREDITS:AD_REWARD_CREDITS \
	AD_REWARDS_ENABLED:AD_REWARDS_ENABLED
```

Add `ad-reward ad-reward-secrets ad-reward-deploy \` to the `.PHONY` list (line 49), add these two lines to the `help` recipe's `printf` list after the delete-account line:

```
	  '  ad-reward-secrets  Push ad-reward config from $(ENV_FILE) to Supabase secrets' \
	  '  ad-reward-deploy   Deploy the ad-reward Edge Function' \
	  '  ad-reward          secrets + deploy' \
	  '' \
```

and add the targets before the aggregates section:

```make
# ── ad-reward ──────────────────────────────────────────────────────────

ad-reward: ad-reward-secrets ad-reward-deploy

ad-reward-secrets:
	@$(MAKE) --no-print-directory _push-secrets PAIRS="$(AD_REWARD_SECRETS)" LABEL=ad-reward

ad-reward-deploy:
	@echo "→ deploying ad-reward"
	@$(SUPABASE) functions deploy ad-reward
```

Finally extend the aggregates (lines 104–106):

```make
secrets-all: ai-proxy-secrets apple-secrets ad-reward-secrets

deploy-all: secrets-all ai-proxy-deploy apple-deploy delete-account-deploy ad-reward-deploy
```

- [ ] **Step 4: Verify the kill-switch and the unsigned-callback rejection**

Run locally:
```bash
supabase functions serve ad-reward
```

With `AD_REWARDS_ENABLED` unset, an unsigned callback must not grant:
```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  'http://127.0.0.1:54321/functions/v1/ad-reward/admob-ssv?user_id=u&transaction_id=t&signature=x&key_id=1'
```
Expected: `200` (AdMob is told not to retry) and **no** row in `ai_credit_events`. Confirm:
```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -c "select count(*) from public.ai_credit_events where reason = 'ad_reward';"
```
Expected: `0`.

Then set `AD_REWARDS_ENABLED=1` in the local function env and repeat. Expected: still `200`, still `0` rows — the signature is invalid, so the grant must not happen. This is the single most important check in the plan: if a row appears here, the endpoint mints free credits for anyone who can type a URL.

- [ ] **Step 5: Verify the nonce round-trip**

With `AD_REWARDS_ENABLED=1` and a test user's JWT:
```bash
NONCE=$(curl -s -X POST http://127.0.0.1:54321/functions/v1/ad-reward/nonce \
  -H "Authorization: Bearer $TEST_JWT" -H 'Content-Type: application/json' \
  -d '{"provider":"tapsell"}' | jq -r .nonce)

curl -s -X POST http://127.0.0.1:54321/functions/v1/ad-reward/claim \
  -H "Authorization: Bearer $TEST_JWT" -H 'Content-Type: application/json' \
  -d "{\"nonce\":\"$NONCE\",\"provider\":\"tapsell\"}"

curl -s -X POST http://127.0.0.1:54321/functions/v1/ad-reward/claim \
  -H "Authorization: Bearer $TEST_JWT" -H 'Content-Type: application/json' \
  -d "{\"nonce\":\"$NONCE\",\"provider\":\"tapsell\"}"
```
Expected: the first claim returns `{"balance":N}` with N up 3; the second returns `400 {"error":"nonce_invalid"}` and the balance is unchanged.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ad-reward/index.ts supabase/config.toml Makefile
git commit -m "feat(ad-reward): add credit-granting edge function with AdMob SSV"
```

---

## Task 7: The rewarded-ad provider seam

Interface, the no-op implementation, and selection. No native dependency yet — this task is pure TypeScript and fully testable. Task 8 plugs AdMob in behind it, and phase 2 adds the Iranian network here and nowhere else.

**Files:**
- Create: `src/ads/rewardedAdProvider.ts`
- Create: `src/ads/noopProvider.ts`
- Create: `src/ads/selectRewardedAdProvider.ts`
- Create: `src/ads/selectRewardedAdProvider.test.ts`

**Interfaces:**
- Produces:
  - `type RewardOutcome = { kind: "ssv" } | { kind: "nonce"; nonce: string } | { kind: "dismissed" } | { kind: "failed"; reason: string }`
  - `type RewardedAdProvider = { id: RewardedAdProviderId; isAvailable(): boolean; show(opts: { userId: string }): Promise<RewardOutcome> }`
  - `type RewardedAdProviderId = "admob" | "tapsell" | "none"`
  - `const noopProvider: RewardedAdProvider`
  - `function selectRewardedAdProvider(env: ProviderEnv): RewardedAdProvider`
  - `type ProviderEnv = { platform: "ios" | "android" | "web"; admobUnitId: string | null; admobProvider: RewardedAdProvider }`

- [ ] **Step 1: Write the failing test**

Create `src/ads/selectRewardedAdProvider.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";
import { selectRewardedAdProvider } from "./selectRewardedAdProvider";

const fakeAdmob: RewardedAdProvider = {
  id: "admob",
  isAvailable: () => true,
  show: async () => ({ kind: "ssv" }),
};

describe("selectRewardedAdProvider", () => {
  it("picks AdMob on iOS when a unit id is configured", () => {
    const p = selectRewardedAdProvider({
      platform: "ios",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("admob");
  });

  it("picks AdMob on Android when a unit id is configured", () => {
    const p = selectRewardedAdProvider({
      platform: "android",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("admob");
  });

  it("falls back to the no-op provider on web", () => {
    // No rewarded-ad SDK runs in a browser, so web users spend their signup
    // grant and are then pointed at the mobile app or a pass.
    const p = selectRewardedAdProvider({
      platform: "web",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("none");
    expect(p.isAvailable()).toBe(false);
  });

  it("falls back to the no-op provider when no unit id is configured", () => {
    // Dev builds and any release where the env var was not set.
    const p = selectRewardedAdProvider({
      platform: "ios",
      admobUnitId: null,
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("none");
  });

  it("falls back when the AdMob provider reports itself unavailable", () => {
    // The native module is missing — Expo Go, or a build without the plugin.
    const p = selectRewardedAdProvider({
      platform: "android",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: { ...fakeAdmob, isAvailable: () => false },
    });
    expect(p.id).toBe("none");
  });
});

describe("noopProvider", () => {
  it("is never available", () => {
    expect(noopProvider.isAvailable()).toBe(false);
  });

  it("reports failure rather than throwing when shown", async () => {
    await expect(noopProvider.show({ userId: "u-1" })).resolves.toEqual({
      kind: "failed",
      reason: "no_provider",
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/ads/selectRewardedAdProvider.test.ts`
Expected: FAIL with `Failed to resolve import "./noopProvider"`.

- [ ] **Step 3: Write the interface**

Create `src/ads/rewardedAdProvider.ts`:

```ts
/**
 * The seam every rewarded-ad network implements.
 *
 * Two networks are planned — AdMob globally, and an Iranian network
 * (Tapsell/Adivery) for markets AdMob does not serve — and they verify
 * rewards differently. That difference is captured in `RewardOutcome` rather
 * than leaking into the calling code: AdMob credits the server directly via
 * its SSV callback, while a network without one hands back a nonce the client
 * redeems.
 *
 * Types only; no imports, so this stays testable without a native module.
 */

export type RewardedAdProviderId = "admob" | "tapsell" | "none";

export type RewardOutcome =
  /** The network will credit the server out-of-band. Poll for the balance. */
  | { kind: "ssv" }
  /** No server callback — redeem this nonce against `ad-reward/claim`. */
  | { kind: "nonce"; nonce: string }
  /** The user closed the ad before earning the reward. Not an error. */
  | { kind: "dismissed" }
  /** No fill, network error, SDK failure. */
  | { kind: "failed"; reason: string };

export type RewardedAdProvider = {
  id: RewardedAdProviderId;
  /** False when the SDK is absent or unconfigured — never throws. */
  isAvailable(): boolean;
  /**
   * Load and present a rewarded ad, resolving once the user has earned the
   * reward, dismissed the ad, or the attempt failed. Never rejects.
   *
   * `userId` is the Supabase user id, forwarded to AdMob as its SSV
   * `userId` so the callback can identify who to credit.
   */
  show(opts: { userId: string }): Promise<RewardOutcome>;
};
```

- [ ] **Step 4: Write the no-op provider**

Create `src/ads/noopProvider.ts`:

```ts
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Stands in wherever no ad SDK can run: the web build, Expo Go, and any
 * release built without an ad unit id configured.
 *
 * `isAvailable()` returning false is what drives `resolveAiAccess` to
 * `no_ads_available`, which shows the "continue on mobile" copy instead of a
 * watch-ad button.
 */
export const noopProvider: RewardedAdProvider = {
  id: "none",
  isAvailable: () => false,
  show: async () => ({ kind: "failed", reason: "no_provider" }),
};
```

- [ ] **Step 5: Write the selector**

Create `src/ads/selectRewardedAdProvider.ts`:

```ts
import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Everything the choice depends on, passed in rather than read from globals
 * so the decision table is testable without mocking `Platform` or the env.
 */
export type ProviderEnv = {
  platform: "ios" | "android" | "web";
  /** Resolved ad unit id for this platform, or null when unconfigured. */
  admobUnitId: string | null;
  admobProvider: RewardedAdProvider;
};

/**
 * Pick the rewarded-ad provider for this build.
 *
 * Phase 2 (Tapsell/Adivery) adds a branch here and changes nothing else —
 * that is the point of routing every consumer through this function.
 */
export function selectRewardedAdProvider(env: ProviderEnv): RewardedAdProvider {
  if (env.platform === "web") return noopProvider;
  if (!env.admobUnitId) return noopProvider;
  if (!env.admobProvider.isAvailable()) return noopProvider;
  return env.admobProvider;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/ads/selectRewardedAdProvider.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add src/ads/
git commit -m "feat(ads): add rewarded-ad provider interface and selection"
```

---

## Task 8: The AdMob provider

**Files:**
- Create: `src/ads/admobProvider.ts`
- Modify: `package.json`
- Modify: `app.json`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `RewardedAdProvider`, `RewardOutcome` (Task 7).
- Produces:
  - `const admobProvider: RewardedAdProvider`
  - `function getAdmobRewardedUnitId(): string | null`
  - `function getConfiguredRewardedAdProvider(): RewardedAdProvider` — the single entry point `AiCreditsContext` uses.

- [ ] **Step 1: Install the dependency**

Run:
```bash
npx expo install react-native-google-mobile-ads
```

- [ ] **Step 2: Configure the plugin**

In `app.json`, add to the `expo.plugins` array. The app ids come from the AdMob console and are **not** secret — they ship in the binary either way, which is why they live in `app.json` rather than `.env`:

```json
[
  "react-native-google-mobile-ads",
  {
    "androidAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX",
    "iosAppId": "ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX"
  }
]
```

Replace both placeholders with the real app ids before building. A wrong or missing app id crashes the app on launch on Android — that is the SDK's documented behaviour, not a bug to debug.

- [ ] **Step 3: Document the ad unit ids**

Append to `.env.example`:

```bash
# ── Rewarded ads (AI credits) ───────────────────────────────────────────
# Rewarded ad unit ids from the AdMob console, per platform. Leave unset to
# disable ads entirely — `selectRewardedAdProvider` then returns the no-op
# provider and the app shows the "get a pass" empty state instead.
#
# Google's public test unit ids (safe in development, never in a release):
#   iOS      ca-app-pub-3940256099942544/1712485313
#   Android  ca-app-pub-3940256099942544/5224354917
EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS=
EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID=
```

- [ ] **Step 4: Write the provider**

Create `src/ads/admobProvider.ts`:

```ts
import { Platform } from "react-native";
import type { RewardedAdProvider, RewardOutcome } from "./rewardedAdProvider";
import { selectRewardedAdProvider } from "./selectRewardedAdProvider";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

/** Rewarded ad unit id for this platform, or null when unconfigured. */
export function getAdmobRewardedUnitId(): string | null {
  if (Platform.OS === "ios") {
    return trim(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS) ?? null;
  }
  if (Platform.OS === "android") {
    return trim(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID) ?? null;
  }
  return null;
}

/**
 * Cached result of probing for the native module. `require` is used rather
 * than a static import so that web builds, Expo Go, and any build without the
 * config plugin fail to find it and fall back gracefully — the same lazy
 * pattern `PremiumContext` uses for `expo-iap`.
 */
let nativeModule: typeof import("react-native-google-mobile-ads") | null = null;
let nativeProbed = false;

function loadNative(): typeof import("react-native-google-mobile-ads") | null {
  if (nativeProbed) return nativeModule;
  nativeProbed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require("react-native-google-mobile-ads");
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

export const admobProvider: RewardedAdProvider = {
  id: "admob",

  isAvailable(): boolean {
    if (Platform.OS === "web") return false;
    if (!getAdmobRewardedUnitId()) return false;
    return loadNative() !== null;
  },

  show({ userId }): Promise<RewardOutcome> {
    return new Promise((resolve) => {
      const mod = loadNative();
      const unitId = getAdmobRewardedUnitId();
      if (!mod || !unitId) {
        resolve({ kind: "failed", reason: "no_provider" });
        return;
      }

      // Resolve exactly once: the SDK can fire both `earned` and `closed`,
      // and a load error can arrive after either.
      let settled = false;
      const settle = (outcome: RewardOutcome) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(outcome);
      };

      const { RewardedAd, RewardedAdEventType, AdEventType } = mod;

      const ad = RewardedAd.createForAdRequest(unitId, {
        // Carried through to our SSV callback as `user_id`, which is how the
        // server knows whose ledger to credit. Without it the callback is
        // unattributable and the reward is lost.
        serverSideVerificationOptions: { userId },
        requestNonPersonalizedAdsOnly: false,
      });

      const unsubscribers: Array<() => void> = [];
      const cleanup = () => {
        for (const off of unsubscribers) {
          try {
            off();
          } catch {
            // Listener already torn down.
          }
        }
      };

      unsubscribers.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          try {
            ad.show();
          } catch (e) {
            settle({ kind: "failed", reason: e instanceof Error ? e.message : "show_failed" });
          }
        }),
      );

      unsubscribers.push(
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          // The credit is granted by AdMob's server calling our SSV endpoint,
          // not here. The caller polls the ledger for it.
          settle({ kind: "ssv" });
        }),
      );

      unsubscribers.push(
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          // Only reached when EARNED_REWARD did not already settle.
          settle({ kind: "dismissed" });
        }),
      );

      unsubscribers.push(
        ad.addAdEventListener(AdEventType.ERROR, (error: unknown) => {
          const reason = error instanceof Error ? error.message : "ad_error";
          settle({ kind: "failed", reason });
        }),
      );

      try {
        ad.load();
      } catch (e) {
        settle({ kind: "failed", reason: e instanceof Error ? e.message : "load_failed" });
      }
    });
  },
};

/** The provider this build should use. Single entry point for consumers. */
export function getConfiguredRewardedAdProvider(): RewardedAdProvider {
  const platform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  return selectRewardedAdProvider({
    platform,
    admobUnitId: getAdmobRewardedUnitId(),
    admobProvider,
  });
}
```

- [ ] **Step 5: Verify the fallback path still works without the native module**

Run: `npm test`
Expected: PASS. The suite must not import `admobProvider` (it requires React Native), so this only confirms nothing regressed. Then confirm the web build starts:

Run: `npm run web`
Expected: the app loads and the AI screen renders. `getConfiguredRewardedAdProvider()` returns the no-op provider on web, so nothing tries to load the native module.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add package.json package-lock.json app.json .env.example src/ads/admobProvider.ts
git commit -m "feat(ads): add AdMob rewarded provider behind the provider seam"
```

---

## Task 9: The credits context

**Files:**
- Create: `src/premium/AiCreditsContext.tsx`
- Modify: `src/core/aiProxy.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `getConfiguredRewardedAdProvider` (Task 8), `ad-reward` routes (Task 6), `createTallySupabaseClient`, `useSupabaseSession`, `usePremium`.
- Produces:
  - `function AiCreditsProvider({ children }: { children: ReactNode })`
  - `function useAiCredits(): AiCreditsValue`
  - `type AiCreditsValue = { balance: number; isUnlimited: boolean; adsAvailable: boolean; busy: boolean; lastError: string | null; refresh: () => Promise<void>; watchAdForCredits: () => Promise<WatchAdResult> }`
  - `type WatchAdResult = "granted" | "pending" | "dismissed" | "failed" | "unavailable"`
  - From `aiProxy.ts`: `class AiProxyInsufficientCreditsError extends Error`, `function setAiCreditsListener(fn: ((remaining: number) => void) | null): void`

- [ ] **Step 1: Teach `aiProxy` about credits**

In `src/core/aiProxy.ts`, add above `callAiProxy`:

```ts
/**
 * Thrown when the proxy refuses a call because the user is out of credits.
 * Callers catch this specifically to open the credits panel rather than
 * showing a generic error.
 */
export class AiProxyInsufficientCreditsError extends Error {
  constructor() {
    super("AI_PROXY_INSUFFICIENT_CREDITS");
    this.name = "AiProxyInsufficientCreditsError";
  }
}

/**
 * Notified with the caller's remaining balance after every billed call.
 * `AiCreditsContext` registers here so the balance stays in sync with the
 * server without every call site having to thread it back.
 */
let creditsListener: ((remaining: number) => void) | null = null;

export function setAiCreditsListener(fn: ((remaining: number) => void) | null): void {
  creditsListener = fn;
}
```

Then replace the error branch at the end of `callAiProxy` (`aiProxy.ts:45-49`):

```ts
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 402 && body.includes("insufficient_credits")) {
      throw new AiProxyInsufficientCreditsError();
    }
    throw new Error(`AI proxy HTTP ${res.status}: ${body.slice(0, 400)}`);
  }

  // Billed calls report the remaining balance in a header — the body is the
  // upstream provider's JSON, passed through verbatim, so there is nowhere in
  // it to put this.
  const remaining = res.headers.get("X-Tally-Credits-Remaining");
  if (remaining !== null && creditsListener) {
    const n = Number.parseInt(remaining, 10);
    if (Number.isFinite(n)) creditsListener(n);
  }

  return res;
```

- [ ] **Step 2: Write the provider**

Create `src/premium/AiCreditsContext.tsx`:

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getConfiguredRewardedAdProvider } from "../ads/admobProvider";
import { setAiCreditsListener } from "../core/aiProxy";
import { getSyncUrl } from "../sync/config";
import { usePremium } from "./PremiumContext";

/**
 * AI credits — the currency rewarded ads buy.
 *
 * Deliberately a sibling of `PremiumContext` rather than part of it: passes
 * and credits are different currencies with different lifecycles, and
 * `PremiumContext` is already large enough. This provider reads `isPremium`
 * from it for `isUnlimited` and owns nothing else about entitlement.
 *
 * The balance is server-owned (`ai_credit_balances`, select-only for
 * clients), so every value here is a cache of what the server said.
 */

export type WatchAdResult =
  /** Credits landed and `balance` is updated. */
  | "granted"
  /** The ad was watched but the server callback has not arrived yet. */
  | "pending"
  /** The user closed the ad early. Nothing was earned; not an error. */
  | "dismissed"
  /** No fill, or the SDK errored. */
  | "failed"
  /** No ad provider on this platform/build. */
  | "unavailable";

type AiCreditsValue = {
  balance: number;
  /** Premium users never spend credits and never see an ad. */
  isUnlimited: boolean;
  adsAvailable: boolean;
  busy: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  watchAdForCredits: () => Promise<WatchAdResult>;
};

const AiCreditsContext = createContext<AiCreditsValue | null>(null);

/** How long to wait for AdMob's SSV callback before giving up on the poll. */
const SSV_POLL_TIMEOUT_MS = 8_000;
const SSV_POLL_INTERVAL_MS = 800;

async function fetchBalance(): Promise<number | null> {
  const client = createTallySupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("ai_credit_balances")
    .select("balance")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { balance?: number };
  return typeof row.balance === "number" ? row.balance : 0;
}

export function AiCreditsProvider({ children }: { children: ReactNode }) {
  const { session } = useSupabaseSession();
  const { isPremium } = usePremium();

  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const provider = useMemo(() => getConfiguredRewardedAdProvider(), []);
  const adsAvailable = provider.isAvailable();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setBalance(0);
      return;
    }
    const next = await fetchBalance();
    if (next !== null && mounted.current) setBalance(next);
  }, [session?.user]);

  // Keep the balance in step with what the proxy reports on billed calls, so
  // spending a credit updates the chip without a round-trip.
  useEffect(() => {
    setAiCreditsListener((remaining) => {
      if (mounted.current) setBalance(remaining);
    });
    return () => setAiCreditsListener(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Credits can be granted out-of-band (an SSV callback that landed after the
  // app was backgrounded), so re-read on foreground — the same trigger
  // `PremiumContext` uses to re-check entitlement.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") void refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  /**
   * Poll until the balance rises above `previous` or the timeout elapses.
   * AdMob credits our server, not the client, so when `show()` resolves the
   * grant may still be in flight.
   */
  const pollForGrant = useCallback(async (previous: number): Promise<boolean> => {
    const deadline = Date.now() + SSV_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, SSV_POLL_INTERVAL_MS));
      const next = await fetchBalance();
      if (next !== null && next > previous) {
        if (mounted.current) setBalance(next);
        return true;
      }
    }
    return false;
  }, []);

  /** Redeem a nonce for networks with no server callback (phase 2). */
  const claimNonce = useCallback(
    async (nonce: string, providerId: string): Promise<boolean> => {
      const urlBase = getSyncUrl();
      const token = session?.access_token;
      if (!urlBase || !token) return false;
      try {
        const res = await fetch(
          `${urlBase.replace(/\/$/, "")}/functions/v1/ad-reward/claim`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ nonce, provider: providerId }),
          },
        );
        if (!res.ok) return false;
        const body = (await res.json()) as { balance?: number };
        if (typeof body.balance === "number" && mounted.current) setBalance(body.balance);
        return true;
      } catch {
        return false;
      }
    },
    [session?.access_token],
  );

  const watchAdForCredits = useCallback(async (): Promise<WatchAdResult> => {
    const userId = session?.user?.id;
    if (!userId) return "unavailable";
    if (!provider.isAvailable()) return "unavailable";

    setBusy(true);
    setLastError(null);
    const before = balance;
    try {
      const outcome = await provider.show({ userId });
      switch (outcome.kind) {
        case "ssv":
          return (await pollForGrant(before)) ? "granted" : "pending";
        case "nonce":
          return (await claimNonce(outcome.nonce, provider.id)) ? "granted" : "failed";
        case "dismissed":
          return "dismissed";
        case "failed":
          setLastError(outcome.reason);
          return "failed";
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      return "failed";
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [balance, claimNonce, pollForGrant, provider, session?.user?.id]);

  const value = useMemo<AiCreditsValue>(
    () => ({
      balance,
      isUnlimited: isPremium,
      adsAvailable,
      busy,
      lastError,
      refresh,
      watchAdForCredits,
    }),
    [balance, isPremium, adsAvailable, busy, lastError, refresh, watchAdForCredits],
  );

  return <AiCreditsContext.Provider value={value}>{children}</AiCreditsContext.Provider>;
}

export function useAiCredits(): AiCreditsValue {
  const v = useContext(AiCreditsContext);
  if (!v) throw new Error("useAiCredits requires AiCreditsProvider");
  return v;
}
```

- [ ] **Step 3: Mount the provider**

In `App.tsx`, add the import beside the existing premium import (line 44):

```tsx
import { AiCreditsProvider } from "./src/premium/AiCreditsContext";
```

Then wrap inside `PremiumProvider` — it reads `usePremium()`, so it must be a descendant — and inside `SupabaseSessionProvider`. Replace lines 486–496 of the tree:

```tsx
          <PremiumProvider>
            <AiCreditsProvider>
              <DatabaseProvider>
                <DbErrorCapture>
                  <ThemeProvider>
                    <LocaleProvider>
                      <AuthSQLiteBinding />
                      <PremiumPassBinding />
                      <ThemedApp />
                    </LocaleProvider>
                  </ThemeProvider>
                </DbErrorCapture>
              </DatabaseProvider>
            </AiCreditsProvider>
          </PremiumProvider>
```

- [ ] **Step 4: Verify the app boots on every platform**

Run: `npm run web`
Expected: the app loads, no provider error in the console. `useAiCredits()` resolves and `adsAvailable` is false.

Run: `npm run ios` (or `npm run android`)
Expected: the app loads. With no ad unit id configured, `adsAvailable` is false and nothing tries to load the native SDK.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/premium/AiCreditsContext.tsx src/core/aiProxy.ts App.tsx
git commit -m "feat(premium): add AI credits context and proxy credit signalling"
```

---

## Task 10: The credits panel and screen integration

Where the user actually meets this feature. The AI screen currently defers its paywall to point-of-action and navigates to `Plans` (`AiReceiptScreen.tsx:2302`); this keeps that shape and adds a modal for the credit case.

**Files:**
- Create: `src/components/AiCreditsPanel.tsx`
- Modify: `src/screens/AiReceiptScreen.tsx`
- Modify: `src/i18n/translations.ts`

**Interfaces:**
- Consumes: `useAiCredits` (Task 9), `resolveAiAccess` (Task 3), `AiProxyInsufficientCreditsError` (Task 9).
- Produces: `function AiCreditsPanel({ visible, onClose }: { visible: boolean; onClose: () => void })`

- [ ] **Step 1: Add the translation keys**

In `src/i18n/translations.ts`, add to the `Translations` type immediately after the `premium` block:

```ts
  aiCredits: {
    /** Balance chip on the AI screen, e.g. "3 credits". Uses {{count}}. */
    chip: string;
    title: string;
    /** Body when the user can watch an ad. Uses {{count}}. */
    body: string;
    watchCta: string;
    watchBusy: string;
    /** Shown while an SSV callback is still in flight. */
    pending: string;
    dismissed: string;
    failed: string;
    /** Web / no ad provider: earning is unavailable here. */
    noAdsTitle: string;
    noAdsBody: string;
    passCta: string;
    close: string;
  };
```

Add to the **English** locale object after its `premium` block:

```ts
  aiCredits: {
    chip: "{{count}} credits",
    title: "Out of AI credits",
    body: "Watch a short ad to get {{count}} more AI requests.",
    watchCta: "Watch an ad",
    watchBusy: "Loading ad…",
    pending: "Your credits are on the way — this can take a few seconds.",
    dismissed: "No credits earned — the ad was closed early.",
    failed: "Couldn't load an ad right now. Try again in a moment.",
    noAdsTitle: "Out of AI credits",
    noAdsBody: "Earn more credits in the Tally mobile app, or get a pass for unlimited AI.",
    passCta: "Get unlimited AI",
    close: "Not now",
  },
```

Add to the **Farsi** locale object after its `premium` block:

```ts
  aiCredits: {
    chip: "{{count}} اعتبار",
    title: "اعتبار هوش مصنوعی تمام شد",
    body: "یک تبلیغ کوتاه ببینید و {{count}} درخواست دیگر بگیرید.",
    watchCta: "دیدن تبلیغ",
    watchBusy: "در حال بارگذاری تبلیغ…",
    pending: "اعتبار شما در راه است — ممکن است چند ثانیه طول بکشد.",
    dismissed: "اعتباری اضافه نشد — تبلیغ زودتر بسته شد.",
    failed: "الان نشد تبلیغی بارگذاری کنیم. کمی بعد دوباره امتحان کنید.",
    noAdsTitle: "اعتبار هوش مصنوعی تمام شد",
    noAdsBody:
      "برای گرفتن اعتبار بیشتر از اپلیکیشن موبایل Tally استفاده کنید، یا برای هوش مصنوعی نامحدود پاس بخرید.",
    passCta: "هوش مصنوعی نامحدود",
    close: "بعداً",
  },
```

Add to the **Spanish** locale object after its `premium` block:

```ts
  aiCredits: {
    chip: "{{count}} créditos",
    title: "Sin créditos de IA",
    body: "Mira un anuncio corto y consigue {{count}} solicitudes más.",
    watchCta: "Ver un anuncio",
    watchBusy: "Cargando anuncio…",
    pending: "Tus créditos están en camino: puede tardar unos segundos.",
    dismissed: "No se ganaron créditos: el anuncio se cerró antes de tiempo.",
    failed: "No se pudo cargar un anuncio ahora. Inténtalo en un momento.",
    noAdsTitle: "Sin créditos de IA",
    noAdsBody:
      "Consigue más créditos en la app móvil de Tally, o adquiere un pase para IA ilimitada.",
    passCta: "IA ilimitada",
    close: "Ahora no",
  },
```

Have a native speaker review the Farsi and Spanish copy before release. The `Translations` type guarantees every key is present in every locale; it cannot tell you whether the wording reads naturally.

- [ ] **Step 2: Write the panel**

Create `src/components/AiCreditsPanel.tsx`:

```tsx
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import type { RootStackParamList } from "../navigation/types";
import { useAiCredits } from "../premium/AiCreditsContext";
import { useTheme } from "../theme/ThemeContext";
import { AppButton } from "../ui/AppButton";

/**
 * Shown when a non-premium user runs out of AI credits.
 *
 * Two shapes, driven by whether an ad provider exists: watch-an-ad on mobile,
 * and a pass upsell on web (no rewarded-ad SDK runs in a browser, so web
 * users spend their signup grant and cannot earn more).
 */
export function AiCreditsPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { adsAvailable, busy, watchAdForCredits } = useAiCredits();
  const [notice, setNotice] = useState<string | null>(null);

  const styles = buildStyles(colors);

  const onWatch = async () => {
    setNotice(null);
    const result = await watchAdForCredits();
    switch (result) {
      case "granted":
        onClose();
        return;
      case "pending":
        setNotice(t("aiCredits.pending"));
        return;
      case "dismissed":
        setNotice(t("aiCredits.dismissed"));
        return;
      case "failed":
      case "unavailable":
        setNotice(t("aiCredits.failed"));
        return;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {adsAvailable ? t("aiCredits.title") : t("aiCredits.noAdsTitle")}
          </Text>
          <Text style={styles.body}>
            {adsAvailable
              ? t("aiCredits.body").replace("{{count}}", "3")
              : t("aiCredits.noAdsBody")}
          </Text>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {adsAvailable ? (
            <AppButton
              variant="primary"
              label={busy ? t("aiCredits.watchBusy") : t("aiCredits.watchCta")}
              onPress={() => void onWatch()}
              disabled={busy}
              accessibilityLabel={t("aiCredits.watchCta")}
            />
          ) : null}

          {busy ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}

          <AppButton
            variant="secondary"
            label={t("aiCredits.passCta")}
            onPress={() => {
              onClose();
              navigation.navigate("Plans");
            }}
            accessibilityLabel={t("aiCredits.passCta")}
          />

          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.close}>{t("aiCredits.close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function buildStyles(colors: { bg: string; text: string; muted: string; primary: string }) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    card: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.bg,
      borderRadius: 20,
      padding: 20,
      gap: 12,
    },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    body: { fontSize: 15, color: colors.muted, lineHeight: 21 },
    notice: { fontSize: 14, color: colors.primary },
    spinner: { marginVertical: 4 },
    close: { fontSize: 15, color: colors.muted, textAlign: "center", paddingVertical: 8 },
  });
}
```

If `useTheme()`'s `colors` object or `AppButton`'s `variant` values differ from what is used above, match the existing usage in `PremiumRequiredPanel.tsx` and the AI screen rather than changing those modules.

- [ ] **Step 3: Replace `ensurePremium` in the AI screen**

In `src/screens/AiReceiptScreen.tsx`, add the imports beside the existing premium import (line 68):

```tsx
import { useAiCredits } from "../premium/AiCreditsContext";
import { AiCreditsPanel } from "../components/AiCreditsPanel";
import { resolveAiAccess } from "../core/aiAccess";
import { AiProxyInsufficientCreditsError } from "../core/aiProxy";
```

Add beside `const premium = usePremium();` (line 1160):

```tsx
  const credits = useAiCredits();
  const [creditsPanelVisible, setCreditsPanelVisible] = useState(false);
```

Replace `ensurePremium` and `premiumGated` (lines 1233–1253):

```tsx
  const aiAccess = resolveAiAccess({
    signedIn: Boolean(authUser?.email),
    emailConfirmed: Boolean(authUser?.email_confirmed_at),
    isPremium: premium.isPremium,
    balance: credits.balance,
    adsAvailable: credits.adsAvailable,
  });

  /**
   * Gate an AI action at the point of value. Sign-in and pass problems go to
   * their existing screens; a spent-out balance opens the credits panel in
   * place, so the user does not lose the receipt they were about to scan.
   */
  const ensureAiAccess = useCallback(() => {
    if (aiAccess === "allowed") return true;
    if (aiAccess === "needs_signin") {
      navigation.navigate(authUser?.email ? "Plans" : "Auth");
      return false;
    }
    setCreditsPanelVisible(true);
    return false;
  }, [aiAccess, authUser?.email, navigation]);

  const aiGated = aiAccess !== "allowed";
```

Then rename every remaining reference:
- `ensurePremium` → `ensureAiAccess` at lines 1363, 1414, 1417, 1463, 1571, 1626, 3042, 3097 (the `useCallback` dependency arrays included).
- `premiumGated` → `aiGated` at lines 3035 and 3093.
- The three inline checks at lines 1325, 1481, and 1555 that read `if (!authUser.email_confirmed_at || !premium.isPremium)` become `if (aiAccess !== "allowed")`, with `aiAccess` replacing `premium.isPremium` in their dependency arrays.

- [ ] **Step 4: Handle a server-side credit refusal**

The client balance can disagree with the server — another device spent the last credit, or a refund has not landed. Wherever `runParse`, `runDescribe`, and the voice flow catch errors from `callAiProxy`, add this branch first:

```tsx
      if (e instanceof AiProxyInsufficientCreditsError) {
        // The server is authoritative; resync and let the user top up.
        void credits.refresh();
        setCreditsPanelVisible(true);
        return;
      }
```

- [ ] **Step 5: Render the panel and the balance chip**

Inside the AI screen's root `KeyboardAvoidingView`, as the last child:

```tsx
      <AiCreditsPanel
        visible={creditsPanelVisible}
        onClose={() => setCreditsPanelVisible(false)}
      />
```

And in the hero row beside the title, so a user can see a run coming rather than hitting a wall mid-task:

```tsx
      {!credits.isUnlimited ? (
        <Text style={styles.creditsChip}>
          {t("aiCredits.chip").replace("{{count}}", String(credits.balance))}
        </Text>
      ) : null}
```

Add to `buildStyles`, beside the other hero styles:

```ts
    creditsChip: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: colors.card,
      overflow: "hidden",
    },
```

- [ ] **Step 6: Verify the flow end-to-end**

With a non-premium test account against the local stack, a configured Google **test** ad unit id, and `AD_REWARDS_ENABLED=1`:

1. Fresh account → the chip reads 5 credits.
2. Scan a receipt → the chip drops to 4 and `ai_credit_events` has one `spend`.
3. Set the balance to 0 in SQL, then tap Analyze → the credits panel opens rather than navigating to Plans.
4. Watch the test ad to completion → the panel closes and the chip reads 3.
5. Open the ad and close it early → the panel stays open with the "closed early" notice and the balance is unchanged.
6. Sign out and tap Analyze → navigates to Auth, no panel.
7. Hold a pass → no chip, no panel, and `ai_credit_events` records no spend.

- [ ] **Step 7: Lint, test, and commit**

```bash
npm run lint
npm test
git add src/components/AiCreditsPanel.tsx src/screens/AiReceiptScreen.tsx src/i18n/translations.ts
git commit -m "feat(ai): gate AI on credits with a watch-ad panel"
```

---

## Task 11: Consent and tracking permission

Both are store-rejection risks, not polish. AdMob requires a UMP consent flow for EEA/UK users, and iOS requires an ATT prompt before any tracking identifier is used.

**Files:**
- Modify: `package.json`
- Modify: `app.json`
- Modify: `src/premium/AiCreditsContext.tsx`

- [ ] **Step 1: Install the tracking-transparency module**

Run:
```bash
npx expo install expo-tracking-transparency
```

- [ ] **Step 2: Declare the usage string**

In `app.json`, add to `expo.plugins`:

```json
[
  "expo-tracking-transparency",
  {
    "userTrackingPermission": "Tally uses this to show ads that earn you free AI credits. Your expense data is never shared with advertisers."
  }
]
```

The second sentence is load-bearing: reviewers reject vague usage strings, and it happens to be true — nothing from the expense database reaches the ad SDK.

- [ ] **Step 3: Request consent before the first ad**

In `src/premium/AiCreditsContext.tsx`, add above `watchAdForCredits`:

```tsx
  /**
   * Gather consent before the first ad of the session.
   *
   * Two separate requirements: Apple's ATT prompt governs the tracking
   * identifier on iOS, and Google's UMP form governs GDPR consent in the
   * EEA/UK. Both are requested lazily — at the moment the user asks for an
   * ad — rather than on launch, so someone who never uses AI is never
   * prompted. Failures are non-fatal: without consent the SDK serves
   * non-personalised ads, which still pay.
   */
  const ensureConsent = useCallback(async (): Promise<void> => {
    try {
      const att = await import("expo-tracking-transparency");
      const { status } = await att.getTrackingPermissionsAsync();
      if (status === "undetermined") {
        await att.requestTrackingPermissionsAsync();
      }
    } catch {
      // Module absent (web) or the prompt failed — carry on unpersonalised.
    }

    try {
      const mod = await import("react-native-google-mobile-ads");
      const info = await mod.AdsConsent.requestInfoUpdate();
      if (
        info.isConsentFormAvailable &&
        info.status === mod.AdsConsentStatus.REQUIRED
      ) {
        await mod.AdsConsent.showForm();
      }
    } catch {
      // Not in the EEA/UK, or no native module. Neither is an error.
    }
  }, []);
```

Then call it at the top of `watchAdForCredits`, after the availability checks and before `setBusy(true)`:

```tsx
    await ensureConsent();
```

and add `ensureConsent` to that callback's dependency array.

- [ ] **Step 4: Verify on a device**

Build and run on a physical iOS device (the ATT prompt does not appear in the simulator):

Run: `npm run ios`

1. Tap "Watch an ad" on a fresh install → the ATT prompt appears exactly once.
2. Decline it → the ad still loads and still grants credits.
3. Tap "Watch an ad" again → no second prompt.

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add package.json package-lock.json app.json src/premium/AiCreditsContext.tsx
git commit -m "feat(ads): request ATT and UMP consent before the first ad"
```

---

## Task 12: Privacy policy and store disclosures

Shipping an ad SDK without updating these is a compliance failure and a likely store rejection.

**Files:**
- Modify: `src/i18n/privacyPolicy.ts`
- Create: `changelogs/` entry (match the existing file naming in that directory)

- [ ] **Step 1: Add the advertising section to the privacy policy**

Read `src/i18n/privacyPolicy.ts` and follow its existing structure — it holds parallel `en` / `fa` / `es` bodies. Add a section covering, in each locale:

- Tally shows rewarded ads, supplied by Google AdMob, that users choose to watch in exchange for AI credits.
- AdMob may collect a device advertising identifier and coarse usage data to select and measure ads. Link to `https://policies.google.com/technologies/ads`.
- **No expense, group, receipt, or contact data is shared with advertisers.** This is the sentence that matters most to users, and it is true — the ad SDK receives only the Supabase user id, and only as an SSV reward identifier.
- Users can decline tracking via the iOS prompt or their Android ad settings, and ads still work.
- Holding a pass removes ads entirely.

- [ ] **Step 2: Verify all three locales still compile**

Run: `npm run lint`
Expected: PASS. `privacyPolicy.ts` is typed per-locale, so a missing translation is a compile error rather than a runtime blank.

- [ ] **Step 3: Update the store data-safety disclosures**

Not a code change; do it in the consoles before submitting, and record it in the changelog entry so it is not forgotten at release time:

- **App Store Connect → App Privacy:** declare "Identifiers → Device ID" collected for "Third-Party Advertising", linked to the user. Confirm the ATT usage string matches `app.json`.
- **Play Console → Data safety:** declare the advertising ID under "Device or other IDs", purpose "Advertising or marketing". Complete the Advertising ID declaration.

- [ ] **Step 4: Write the changelog entry**

Follow the existing convention in `changelogs/`. Cover: rewarded ads now grant AI credits; new accounts start with 5; passes mean unlimited AI with no ads; and the store-console tasks from Step 3 as a release checklist.

- [ ] **Step 5: Commit**

```bash
npm run lint
git add src/i18n/privacyPolicy.ts changelogs/
git commit -m "docs: disclose rewarded ads in privacy policy and changelog"
```

---

## Launch checklist

After Task 12, the code is complete but ads are still off. To go live:

1. `make ad-reward` and `make ai-proxy` to push secrets and deploy both functions.
2. Apply the migration to production (`supabase db push`).
3. In the AdMob console, set the rewarded ad unit's SSV callback URL to
   `https://<project>.supabase.co/functions/v1/ad-reward/admob-ssv`.
4. Verify with AdMob's "Send test SSV" button, then confirm exactly one `ad_reward` row appears in `ai_credit_events`.
5. Replace the test ad unit ids in `.env` with production ones and rebuild.
6. Set `AD_REWARDS_ENABLED=1`. **This is the launch.**
7. Watch `ai_credit_events` for the first day: `ad_reward` rows should roughly track impressions in the AdMob dashboard. A large gap means SSV callbacks are failing and users are watching ads for nothing.

## Self-review notes

**Spec coverage.** Every section of the spec maps to a task: entitlement model → Tasks 3, 4; server data model → Task 1; `ai-proxy` changes → Task 4; `ad-reward` → Tasks 5, 6; configuration → Tasks 6, 8; client architecture `src/ads/` → Tasks 7, 8; `AiCreditsContext` → Task 9; UI → Task 10; compliance → Tasks 11, 12; testing → distributed across each task; rollout → the launch checklist. Spec rollout step 5 is out of scope by design and stated as such.

**Known gaps, stated rather than hidden.** Three things this plan does not do:

- `handleClaim`'s nonce path is written and tested by curl in Task 6, but nothing calls it until phase 2 adds a nonce-returning provider. It ships unused on purpose — building it alongside its sibling route is cheaper than returning to this function later.
- `ad_reward_nonces` accumulates expired rows. Like `ai_proxy_usage` before it (see that migration's closing comment), pruning is left to a `pg_cron` job configured in the dashboard rather than to application code.
- No automated test covers a real AdMob callback end-to-end; Task 5 proves the verification logic against a locally generated key, and Task 6 step 4 proves the endpoint rejects unsigned callbacks. The genuine article is covered by the manual "Send test SSV" check in the launch checklist.
