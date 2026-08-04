# Remote Config for the AI Section — Design

**Date:** 2026-08-04
**Status:** Approved, ready for planning

## Problem

The AI section has no runtime control. Every knob is either compiled into the
app bundle or baked into Edge Function secrets:

- `src/core/featureFlags.ts` reads `EXPO_PUBLIC_*` env vars at build time. One
  flag exists (`isGroupTypePickerEnabled`). Changing it needs a new build and a
  store review.
- Model ids, prompts, and rate limits live as `Deno.env.get` values in
  `supabase/functions/ai-proxy/index.ts`. Changing one needs
  `supabase secrets set` plus a function redeploy.
- Nothing can disable AI. If a provider degrades, costs spike, or a model
  starts returning garbage, the only remedy is shipping a new client.

We need three capabilities, decided during brainstorming:

1. **Kill switch** — turn AI off remotely, per action and in total.
2. **Staged rollout by user cohort** — alpha testers, premium users, or an
   explicit allowlist. Cohort is the only targeting axis in scope; percentage
   rollout, platform, and app-version targeting are explicitly out.
3. **Runtime tuning** — rate limits, request limits, model ids, and prompts
   changeable without a release.

## Non-goals

- **Credit cost per action stays hardcoded.** `src/core/aiCreditCost.ts` is one
  credit per call, `classify-category` free, with `aiCreditCost.test.ts`
  asserting the client and Edge Function copies agree. That invariant is worth
  more than remote tunability of a number that has never changed.
- **No percentage rollout, platform, or app-version targeting.**
- **No admin UI.** Flags change via a SQL script.
- **No audit table.** `updated_at` covers "when"; "who and why" is deferred.
- **Store-review gating is not a goal.** It was considered and dropped.

## Already done — do not rebuild

The other half of the original request, routing model API keys through Supabase
Edge Functions, **is already implemented**:

- `supabase/functions/ai-proxy/index.ts` (610 lines) proxies all four actions:
  `parse-receipt`, `parse-description`, `classify-category`, `transcribe`.
- It verifies the caller's JWT, bills credits, rate-limits per user per minute,
  and forwards to Groq / OpenAI / ElevenLabs with server-held keys.
- Grepping `src/`, `App.tsx`, `index.ts`, `app.config.js`, and `app.json` for
  `AI_API_KEY|OPENAI_API_KEY|STT_API_KEY|AI_BASE_URL` returns **zero matches**.
  No provider key reaches the bundle.
- `src/core/receiptAiEnv.ts` documents the migration as complete.

This design builds on that proxy. It does not change how keys are held.

## Approach

Config lives in a Supabase table, is resolved server-side, and is enforced by
`ai-proxy` independently of the client.

Two alternatives were rejected:

- **Third-party remote config** (Firebase / PostHog / ConfigCat) — better
  dashboards, but adds a vendor and SDK, needs a second identity model mapped
  onto `profiles`, and requires `ai-proxy` to call out to it to enforce
  anything. Tally ships to Bazaar (`supabase/functions/verify-bazaar-purchase`),
  where Google-hosted config is unreliable.
- **Edge Function env vars only** — cheapest, but cohort targeting does not fit
  env vars and every change needs a redeploy.

The chosen approach reuses primitives already in the repo: RLS, Edge Functions,
and the `profiles.is_alpha` / `is_premium` columns that `ai-proxy` already reads
for entitlement.

## Data model

One table, keyed by `(key, cohort)` so a key can hold different values per
cohort:

```sql
create table public.ai_config (
  key            text not null,
  cohort         text not null default 'everyone'
                   check (cohort in ('everyone','premium','alpha','allowlist')),
  value          jsonb not null,
  -- Prompts and provider params must never reach the bundle. An explicit
  -- column rather than a naming convention, so the boundary is auditable
  -- in a single query.
  client_visible boolean not null default false,
  updated_at     timestamptz not null default now(),
  primary key (key, cohort)
);

create table public.ai_config_allowlist (
  key     text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (key, user_id)
);
```

**Resolution precedence:** `allowlist` → `alpha` → `premium` → `everyone`.
First match wins. A key with only an `everyone` row behaves globally.

**RLS:** clients get no direct access to either table. All reads go through the
Edge Functions, using the service-role key. Same posture as
`ai_credit_balances` in `20260801000000_ai_credits.sql` — a client that could
write here could re-enable a killed feature or set its own rate limit.

### Keys

| Group | Keys | `client_visible` |
|---|---|---|
| Kill switches | `ai_enabled` (master), `ai_action_parse_receipt`, `ai_action_parse_description`, `ai_action_classify_category`, `ai_action_transcribe` | `true` |
| Request limits | `ai_max_image_bytes`, `ai_max_audio_seconds` | `true` — client pre-validates before upload |
| Provider params | `ai_model`, `ai_receipt_model`, `ai_expense_prompt`, `ai_category_prompt`, `ai_rate_limit_per_min`, `ai_rate_limit_transcribe_per_min` | `false` |

Prompts are `client_visible = false` deliberately: they are product IP, and
exposing them makes prompt injection easier to craft.

## Components

### Server

**`supabase/functions/get-ai-config/index.ts`** (new)
Verifies the JWT, resolves the caller's cohort — reusing the
`tally_has_active_entitlement` RPC for premium and `profiles.is_alpha` for
alpha, exactly as `ai-proxy/index.ts:110` already does — and returns only
`client_visible` keys. The client never receives the rule set or the prompts.

Response shape:

```json
{ "flags": { "ai_enabled": true, "ai_action_transcribe": false },
  "limits": { "ai_max_image_bytes": 4194304, "ai_max_audio_seconds": 120 },
  "ttlSeconds": 900 }
```

**`supabase/functions/_shared/aiConfigResolve.ts`** (new)
Cohort resolution, extracted as a shared module so both `ai-proxy` and
`get-ai-config` resolve identically, and so it is testable without a running
function — the same split already used for `admobSsv.ts` and `bazaarApi.ts`.

It must stay free of `Deno.*` and `npm:` imports: `vitest.config.ts` runs
`supabase/functions/**/*.test.ts` under Node. Database I/O therefore stays in
each function's `index.ts`, where `ai-proxy` holds a 30-second module-scope
cache so the hot path does not hit the database on every call.

**`supabase/functions/ai-proxy/index.ts`** (modified)
A config check is inserted after `requireAuthed` and **before billing**, so a
disabled action never spends a credit:

```
authed → load config (30s cache) → master off? → 403 ai_disabled
                                 → action off? → 403 action_disabled
                                 → bill → rate limit (from config) → upstream
```

Rate limits and prompts are read from config, falling back to today's
`Deno.env.get` values when a key is absent.

### Client

**`src/core/aiConfig.ts`** (new, pure)
The `AiConfig` type, bundled defaults (everything enabled), and
`parseAiConfig(json)`, which validates the server payload and falls back
**per key** on anything malformed. No I/O, so it tests the way `aiAccess.ts`
and `aiCreditCost.ts` already do.

**`src/core/aiConfigClient.ts`** (new)
The fetch, mirroring `aiProxy.ts:69-96`: `getSyncUrl()`, session JWT,
`guardNetworkCall`.

**`src/premium/AiConfigContext.tsx`** (new)
Holds current config, persists it to AsyncStorage, owns refresh. Mirrors
`AiCreditsProvider`, which already has the `AppState` foreground listener this
needs (`AiCreditsContext.tsx:107-111`).

**`src/core/aiAccess.ts`** (modified)
`AiAccessInput` gains `aiEnabled: boolean`; `AiAccessState` gains
`"unavailable"`. The master kill switch flows through the one function that
already decides AI access. Per-action flags are read at each call site via
`useAiConfig().isActionEnabled("transcribe")`, because a single screen-level
state cannot express "voice off, receipt scan on".

**Ordering:** `aiEnabled === false` returns `"unavailable"` *first*, ahead of
the existing sign-in check. Sending a signed-out user to Auth for a feature
that is globally switched off wastes their time and produces a 403 at the end
of it.

**Consequence worth stating:** `get-ai-config` requires a JWT, so a signed-out
user never has server config and always holds bundled defaults, where
`ai_enabled` is `true`. Such a user therefore resolves to `"needs_signin"`, not
`"unavailable"`, even while AI is globally killed. This is acceptable — AI is
gated behind sign-in regardless, and the proxy rejects the call — but it means
the kill switch is not visible in the UI until after sign-in. Making it visible
earlier would require an anonymous config endpoint, which is deliberately out
of scope.

**Cache invalidation on identity change** — handled in `AiConfigContext`, not
in `clearAppStorage.ts`.

The cached config is cohort-specific, so a user who signs out of a premium
account must not keep premium-cohort config. The obvious hook,
`clearAllAppStorage`, is the wrong one: it currently has **no callers** and is
not invoked on sign-out, which goes through `SupabaseSessionContext.tsx:395`
(`client.auth.signOut()`).

Instead the provider watches the session user id and, whenever it changes —
sign-in, sign-out, or account switch — drops the cached config, reverts to
bundled defaults, and refetches. This keys invalidation to the thing that
actually determines cohort. `clearAllAppStorage` already calls
`AsyncStorage.clear()`, so it covers the cache too if it ever gains callers.

**`src/core/featureFlags.ts`** (unchanged)
Build-time flags stay where they are. Build-time and remote flags have
different failure modes, and `isGroupTypePickerEnabled` has a compile-time
consumer in `CreateGroupScreen.tsx:597`.

## Data flow

```
app start → read AsyncStorage cache → render immediately (cached, else bundled defaults)
          → fetch get-ai-config in background → update state + rewrite cache

refresh on: sign-in / sign-out  (cohort can change)
            foreground when older than the 15-minute TTL
            a 403 ai_disabled / action_disabled from ai-proxy
```

First render never blocks — the UI always has some config, per the fail-open
decision below.

The 403-triggered refresh matters: a stale client showing a killed button gets
one clean 403, refetches config, and corrects its own UI. It self-heals instead
of repeating the bad call.

## Error handling

Three failure points, three deliberately different answers.

**Client fetch fails** → keep the cache, or bundled defaults if there is none.
Log through `src/observability`. Show the user nothing; AI behaves per
last-known config.

**Proxy cannot read `ai_config`** → use the last-known-good module cache; if
there is none, fall back to the existing `Deno.env.get` values. Failing closed
here would let a transient database blip take AI down for every user.

**The gap that creates, and its answer** → if AI is being killed *because* of a
cost runaway and the database is also unhealthy, a fail-open proxy keeps
spending. So the master switch gets an env-var backstop, `AI_KILL_SWITCH=1`,
checked before any database read. It needs a redeploy, which makes it the
deliberate break-glass; the table is the everyday control.

**Client-side posture is fail-open to bundled defaults.** This is safe only
because the proxy enforces independently: a stale or tampered client is never a
bypass, it just shows a button and receives a clean 403.

**New error codes.** `ai_disabled` and `action_disabled` become client error
classes beside `AiProxyInsufficientCreditsError`. `classifyProxyFailure`
already extracts the `error` field, so they slot into `aiProxy.ts:97-104`.
User-facing copy goes through `src/i18n` — "AI is temporarily unavailable",
distinct from the out-of-credits path, which opens the credits panel.

## Testing

- **`src/core/aiConfig.test.ts`** — cohort precedence; a malformed payload falls
  back per key rather than discarding the whole config; unknown keys ignored.
- **`src/core/aiAccess.test.ts`** — extended for `aiEnabled: false` →
  `"unavailable"`, pinning that it wins over `"needs_signin"` when both apply.
- **`supabase/functions/_shared/aiConfigResolve.test.ts`** — cohort resolution,
  matching the existing `admobSsv.test.ts` / `bazaarApi.test.ts` pattern. It
  lives in `_shared/` rather than under `ai-proxy/` because both `ai-proxy` and
  `get-ai-config` resolve cohorts, and a shared module is the only way the two
  cannot disagree about a given caller's config.
- **`supabase/scripts/test_ai_config.sql`** — RLS denial for clients, and
  precedence resolution in SQL. Matches `test_ai_credits.sql`.
- **Drift test** — `aiCreditCost.test.ts` already reads the Edge Function source
  to assert both `FREE_ACTIONS` lists agree. The action-key list is the same
  duplication and gets the same treatment: the client `AiProxyAction` union and
  the server config keys must not drift.
- **Billing-order test** — a disabled action returns 403 and spends no credit.
  This is the regression most worth pinning; getting the check order wrong
  charges users for calls that never ran.

## Authoring and rollout

Flags change with `supabase/scripts/set-ai-flag.sql`, following
`grant-reviewer-ai-access.sql`. Run from the Supabase SQL editor.

The seed migration sets every key to its current effective behaviour — all
actions enabled, limits equal to today's env defaults. Applying it changes
nothing observable, so it can land ahead of the client work.

Suggested order:

1. Migration + seed (no-op).
2. `get-ai-config` function.
3. `ai-proxy` enforcement, plus the `AI_KILL_SWITCH` backstop.
4. Client config module, context, and gating.

After step 3 the kill switch is fully functional server-side, even though no
client reads config yet. That is the ordering worth having: the safety
mechanism works before the feature that depends on it ships.
