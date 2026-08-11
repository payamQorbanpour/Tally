# AI provider selection — DB-driven order, right-sized token budget

**Date:** 2026-08-11
**Status:** approved, ready for implementation

## Problem

`parse-description` — the "just type it" path on the AI screen — fails 100% of
the time with "The AI service is temporarily unavailable. Try again shortly."

It was reported as an account-specific bug (working for one Google account,
failing for another). It is not. The two accounts were exercising different
code paths.

### Root cause

The `ai-proxy` Edge Function logs the upstream refusal verbatim:

```
chat_provider_failed upstream_413:{"error":{"message":"Request too large for
model `openai/gpt-oss-120b` in organization `org_01kpv…` service tier
`on_demand` on tokens per minute (TPM): Limit 8000, Requested 8627, please
reduce your message size and try again."}}
```

**Groq counts `max_completion_tokens` — the reservation, not the usage —
against the TPM budget.** `MAX_COMPLETION_TOKENS = 8192` is sent on every
primary-provider call via `tuneReasoning`. The reservation *alone* exceeds the
free tier's 8000 TPM ceiling, so no Groq request can succeed regardless of how
short the input is. The observed 8627 is 8192 reserved + ~435 prompt tokens.

### Why it looked account-specific

`chatWithFallback` gates Gemini behind `hasImages`, and `OPENAI_API_KEY` is not
set on the project. So a text-only request has exactly **one** provider and no
failover, while photo requests fall to Gemini first and never touch Groq.

| action              | provider order | outcome                                |
| ------------------- | -------------- | -------------------------------------- |
| `parse-receipt`     | Gemini → Groq  | works — Gemini answers                 |
| `transcribe`        | ElevenLabs     | works — never touches Groq             |
| `classify-category` | Groq only      | fails silently, falls back to keywords |
| `parse-description` | **Groq only**  | **always fails → 502 → error banner**  |

`ai_proxy_usage` confirms the accounts ran different actions, and the logs show
both accounts' `parse-description` calls failing identically (8628 tokens at
16:11 UTC, 8627 at 16:26 UTC). What "worked" on the other account was receipt
scanning.

## Goals

1. Fix the outage.
2. Make the provider order and every model switchable from the database, with
   no deploy, so the next provider incident is one `UPDATE` away from mitigated.
3. Stay inside Groq's free tier — no billing-tier upgrade assumed.

## Non-goals

- Storing API keys in the database. Keys stay Supabase project secrets.
- Pointing at a vendor that is not already wired in code. Adding a fourth
  provider remains a code change.
- Making Groq a viable receipt provider on the free tier (see "Receipt budget").

## Design

### Provider selection

A new module `supabase/functions/_shared/aiProviders.ts`, dependency-free (no
`Deno.*`, no `npm:` imports) so Vitest can run it under Node — the same
constraint `appConfigResolve.ts`, `admobSsv.ts` and `bazaarApi.ts` follow. It
owns three pure decisions:

```ts
resolveProviderOrder(config, kind)          // "text" | "image" → ProviderName[]
resolveModel(provider, kind, config, env)   // env passed in, not imported
resolveCompletionBudget(action, config)
```

Environment access is passed in as an `(name: string) => string` function
rather than imported, which is what keeps the module Node-testable.

`chatWithFallback` stops hard-coding its attempt list. It walks the resolved
order and asks each provider for its own model. Behaviour on the edges:

- An unknown provider name in the order string is dropped with a
  `console.warn` rather than failing the request.
- An empty, whitespace-only, or fully-unrecognised order falls back to the code
  default for that path.
- A repeated provider name is collapsed to its first occurrence, so
  `groq,gemini,groq` does not retry Groq twice.
- A provider whose API key is not configured is skipped, exactly as today.
- When every attempt fails the last error is rethrown, so the 502's `detail`
  still names a real cause — unchanged from today.

The OpenAI-compatible slot is named `groq` in config strings. It is really
"whatever `AI_BASE_URL` points at"; the name is chosen for readability in SQL
and documented as such in the module.

### Config keys

Four new `app_config` keys, all `server` visibility. All are absent by default,
and absent means "use the code default" — the same philosophy as the existing
`ai_model` / `ai_receipt_model` keys.

| key                        | type    | code default       | purpose                           |
| -------------------------- | ------- | ------------------ | --------------------------------- |
| `ai_provider_order_text`   | string  | `groq,gemini`      | order for text-only calls         |
| `ai_provider_order_image`  | string  | `gemini,groq`      | order for calls carrying photos   |
| `ai_gemini_model`          | string  | env `GEMINI_MODEL` | Gemini's model, switchable too    |
| `ai_max_completion_tokens` | integer | unset              | ceiling clamped over every budget |

Mitigating a Groq outage becomes:

```sql
update public.app_config set value = '"gemini,groq"'
 where key = 'ai_provider_order_text';
```

Existing keys keep their current meaning: `ai_model` and `ai_receipt_model` are
the `groq` provider's text and vision models.

### Token budget

`MAX_COMPLETION_TOKENS = 8192` becomes a per-action map, since the reservation
is what Groq bills against TPM:

| action              | budget | worst case vs 8000 TPM        |
| ------------------- | ------ | ----------------------------- |
| `parse-description` | 2048   | ~435 prompt + 2048 = **2483** |
| `classify-category` | 512    | ~200 prompt + 512 = **712**   |
| `parse-receipt`     | 8192   | over — see below              |

`transcribe` has no entry: it goes to ElevenLabs or Whisper, neither of which
takes a completion budget. Any action not in the map takes the
`parse-description` value of 2048, so a future action cannot silently inherit
an 8192 reservation.

`ai_max_completion_tokens`, when set, clamps as a ceiling:
`min(perAction, override)`. A ceiling rather than a replacement, because the
operational need it serves is "we are hitting a rate limit, lower everything
now" — not "raise one action".

The budget applies to Gemini's `maxOutputTokens` as well, so the two providers
stay consistent. Gemini has no TPM problem at these sizes.

#### Receipt budget

The receipt budget deliberately stays at 8192. Images cost thousands of prompt
tokens, so no reservation makes Groq viable for receipts under an 8000 TPM
ceiling — and shrinking it would reinstate the mid-JSON truncation that 8192
was introduced to fix (see the comment on `MAX_COMPLETION_TOKENS`). Gemini
leads that path, so this costs nothing today. An operator who ever needs Groq
receipts can clamp it from SQL.

### Two independent fixes

The Gemini text fallback alone would have survived this outage; the right-sized
budget alone would have prevented it. Both ship, because each covers a failure
the other does not: the budget does nothing if Groq is down for another reason,
and the fallback does nothing if both providers are misconfigured the same way.

## Production schema state

Discovered while investigating, and a prerequisite for the config keys: the
`app_config` table **does not exist in production**. Every `ai-proxy`
invocation logs `ai_config_read_failed` and `ai_config_allowlist_read_failed`
and falls open to env defaults.

`supabase_migrations.schema_migrations` records only four applied migrations —
`20260424000000`, `20260428000000`, `20260428000001`, `20260807000000` — yet
`ai_credit_balances`, `pass_entitlements`, `profiles.is_alpha`,
`profiles.cloud_sync_enabled`, `pass_entitlements.verified_at`, the four pass
policies, the group-guard trigger and `ai_credit_spend` all exist and work. Ten
migrations' worth of schema was applied by hand and never recorded.

All ten unapplied migrations are idempotent by construction — every
`create policy` is preceded by `drop policy if exists`, every `add column` is
`if not exists`, every table is `create table if not exists`, and the single
`create trigger` is preceded by `drop trigger if exists`. So `supabase db push`
is safe: each is a no-op against objects that already exist, and it repairs the
ledger as a side effect.

Net new schema from the push: the four `app_config*` tables get created, and
`20260804000000` briefly creates the `ai_config` tables that `20260804010000`
then drops — a wash.

One new migration, `20260811000000_ai_provider_config.sql`, registers the four
keys in `app_config_keys`. It seeds **no** values into `app_config`: the code
defaults already carry the fix, so the outage is resolved by the deploy alone
and the rows exist purely as an override surface.

## Testing

`aiProviders.ts` is pure, so it gets real Vitest coverage following the
`appConfigResolve.ts` test pattern:

- order parsing — unknown names dropped, empty string falls back, whitespace
  tolerated, duplicates collapsed
- per-provider model resolution, including env fallback when the config key is
  absent
- budget clamping, including the `ai_max_completion_tokens` ceiling and the
  case where the ceiling exceeds the per-action default

What cannot be unit-tested is the fact that caused the outage: that Groq counts
the reservation against TPM. That is only observable against the live API.
Verification is therefore a real `parse-description` from the app after deploy,
confirmed against the `ai-proxy` logs showing no `chat_provider_failed`.

## Sequencing

1. `aiProviders.ts` + tests, `ai-proxy` rewired to use it.
2. `20260811000000_ai_provider_config.sql`.
3. `supabase db push --dry-run`, reviewed, then `supabase db push`.
4. `make ai-proxy` to deploy.
5. Verify a real `parse-description` against the logs.

The function change is backward-compatible with the current (empty) config, so
if the push has to be aborted at step 3 the deploy at step 4 still fixes the
outage.

## Follow-ups, not in scope

- **The 502 detail is discarded.** `toUserFacingAiError`
  (`src/screens/AiReceiptScreen.tsx:1836`) returns the generic string for
  `status >= 500` *before* calling `createAutoErrorReport`, so the upstream
  cause never reaches `feedback_reports`. This investigation needed dashboard
  log access that a maintainer without project credentials would not have.
- **`payamqorbanpour@gmail.com` has no `profiles` row and no
  `ai_credit_balances` row** and is not premium, so every billable action on it
  returns 402. The account predates the signup-grant trigger.
- **Groq free tier is 8000 TPM org-wide**, shared across all users. Right-sized
  budgets keep a single request under the ceiling, but concurrent users will
  still collide. Dev Tier is the capacity answer if usage grows.
