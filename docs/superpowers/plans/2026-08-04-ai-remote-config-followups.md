# AI Remote Config — Outstanding Verification and Follow-ups

**Date:** 2026-08-04
**Branch:** `implement/ai-remote-config` (11 commits, `e9be092..38e582f`)
**Plan:** `docs/superpowers/plans/2026-08-04-ai-remote-config.md`
**Spec:** `docs/superpowers/specs/2026-08-04-ai-remote-config-design.md`

All eight plan tasks are implemented and reviewed. This file records what could **not**
be verified, and what was deliberately left undone.

## Why anything is unverified

Docker Desktop crashed repeatedly during Supabase image pulls on the machine where this
was built (Docker client 23.0.5 on macOS 26). No local Postgres and no local Edge
Runtime were ever available. **No SQL in this branch has touched a database, and no Edge
Function has served a request.** Every server-side claim rests on static review.

Static review was not merely a formality — it caught a cross-user config leak, a
deterministic cache wipe, and a fail-open error path. But it cannot answer the question
below, and that question is load-bearing.

## Verification gates — run these before merge

Ordered by risk. Gate 1 is the one that matters.

### 1. HIGH — Does a JSONB boolean round-trip to a JS boolean?

Everything hinges on this. `configBool` falls back to `true` for any value that is not a
JS boolean:

```ts
// supabase/functions/_shared/aiConfigResolve.ts
const v = resolved.get(key);
return typeof v === "boolean" ? v : fallback;   // fallback is `true` for kill switches
```

If supabase-js hands back JSONB `false` as the **string** `"false"`, `configBool` returns
`true` and **the kill switch silently does nothing** — while every unit test stays green,
because the tests feed JS booleans directly.

This is expected to work (PostgREST serialises `jsonb` to native JSON), but the cost of
being wrong is total silent failure of the headline feature.

```bash
supabase db reset                       # applies 20260804000000_ai_config.sql
psql "$DB_URL" -c "update ai_config set value = 'false'::jsonb
                   where key = 'ai_enabled' and cohort = 'everyone';"
supabase functions serve ai-proxy
# then, with $TOKEN for any signed-in user:
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"transcribe"}' -w '\n%{http_code}\n'
```

Expect `{"error":"ai_disabled"}` and `403`. Anything else — especially a normal response
— means the round-trip assumption is wrong and the branch must not merge.

Clearing this gate also substantially clears gates 4 and 5 below.

### 2. HIGH — A disabled action returns 403 and spends **no** credit

The check ordering is statically verified (the config gate precedes `spendCredit` in
`ai-proxy/index.ts`). What is unverified is the end-to-end behaviour.

```bash
# baseline, for a NON-premium user holding >= 1 credit
psql "$DB_URL" -c "select balance from ai_credit_balances where user_id = '<uid>';"
psql "$DB_URL" -c "update ai_config set value = 'false'::jsonb
                   where key = 'ai_action_parse_receipt' and cohort = 'everyone';"
sleep 31   # the proxy caches config for 30s
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"parse-receipt","imageBase64":"x"}' -w '\n%{http_code}\n'
psql "$DB_URL" -c "select balance from ai_credit_balances where user_id = '<uid>';"
```

Expect `403 action_disabled` and an **unchanged** balance.

Also confirm the break-glass: restart the function with `AI_KILL_SWITCH=1` and verify
every call returns `403 ai_disabled` even with all table rows set to enabled.

### 3. HIGH — Client behaviour on a real device

Two of the three defects the final review found were exactly the kind a real app run
would have surfaced immediately. This gate has demonstrated yield.

- One `get-ai-config` request after sign-in; **none** while signed out.
- Cold start for a returning signed-in user **reads the cache** (this was broken until
  the final fix wave — the session `loading` guard is what makes it work).
- Sign out and back in as a **different** user: a fresh request, and no trace of the
  previous user's cohort config.
- Kill `ai_action_transcribe` only: voice input reports unavailable, receipt scanning
  still works.

### 4. MEDIUM — Migration applies and RLS denies clients

```bash
psql "$DB_URL" -f supabase/scripts/test_ai_config.sql   # expect: ai_config verification passed
```

Run it **before** editing any flags — it asserts the initial seed count of 9.

Then confirm the deny-all posture returns **zero rows** rather than a permission error:

```sql
set local role authenticated;
select count(*) from public.ai_config;   -- expect 0, not an error
```

A hard error here would mean any future client-side query surfaces as a crash.

### 5. MEDIUM-LOW — `get-ai-config` leaks nothing

```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/get-ai-config \
  -H "Authorization: Bearer $TOKEN" | jq
```

The response must contain **no** `ai_rate_limit_*`, no `ai_model` / `ai_receipt_model`,
and no `*_prompt` key. Unauthenticated must be `401`.

## Known gap — a flag with no consumer

`ai_action_classify_category` is seeded, resolved, delivered to the client, and enforced
by the proxy — but **nothing on the client gates on it**. `classifyExpenseCategory`
swallows all errors into a local keyword heuristic, so behaviour stays graceful, but
killing this action still costs one proxy round trip per expense save on every client,
which is the specific waste a client-visible flag exists to prevent.

Three defensible options, none chosen:

1. Gate `classifyExpenseCategory` on `isActionEnabled("classify-category")`. It is
   invoked fire-and-forget from `AddExpenseScreen` and two sites in `AiReceiptScreen`, so
   the gate belongs in the core function, not the call sites.
2. Flip the key to `client_visible = false`. Server-side enforcement still works; the
   client simply never learns about it.
3. Leave it. The action is free (no credit) and failure is already graceful.

Option 1 matches the spec's intent. It was left out because it is a scope decision, not
a defect.

## Accepted, shipping as-is

- **`userIdRef` is assigned during render** (`AiConfigContext.tsx`). Correct as the code
  stands, and the standard latest-value pattern; moving it into an effect would
  reintroduce the staleness bug it fixes. **Must be re-audited if `startTransition`,
  `useDeferredValue`, or Suspense is ever wrapped around session state.** The warning is
  in the file.
- **One redundant fetch** when `refresh()` is called twice for the same unchanged user
  while one is in flight. The `pendingRefetch` drain bounds it to exactly one extra call.
- **Per-user reads are uncached** in `ai-proxy`: the 30s module cache covers `ai_config`
  rows only, so `loadIsAlpha` and `loadAllowlistKeys` run on every call. They are
  parallel, so the cost is ~1 extra round trip, not three. Both are safely cacheable per
  user for 30s if that latency ever matters.
- **`ai_max_image_bytes` is a downscale trigger, not a hard limit.** If
  `expo-image-manipulator` is missing or throws, an oversized payload still uploads.
  Lowering this value makes downscaling engage more often; it does not reject anything.
  The comment now says so.

## Operational note

**A kill switch does not kill through a higher-precedence cohort row.** Resolution is
first-match-wins over `allowlist → alpha → premium → everyone`, so setting
`('ai_enabled','everyone',false)` has no effect on users covered by an `ai_enabled` row at
any more specific cohort.

`supabase/scripts/set-ai-flag.sql` now carries a prominent **KILL EVERYWHERE** recipe for
this. Read it before an incident, not during one.

## Repository hygiene

Three commits authored during this work — `d7c5159`, `26907a3`, `e9be092` — are
post-login-sync changes, not part of this feature. They landed on this branch because it
was the checked-out branch at the time. Consider whether they belong here before merging.
