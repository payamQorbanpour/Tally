# General Remote Config — Design

**Date:** 2026-08-04
**Status:** Approved, ready for planning
**Supersedes the delivery mechanism of:** `2026-08-04-ai-remote-config-design.md`
(that design's threat model, cohort semantics, and enforcement posture are kept intact)

## Problem

`2026-08-04-ai-remote-config-design.md` built a remote config system, but scoped every
part of it to AI. Three things now need runtime control and cannot use it:

- **Default language.** `src/i18n/localeDefaults.ts` resolves the first-run locale from
  the device, falling back through a hardcoded `APP_LOCALE_BY_REGION` map
  (`IR`/`AF`/`PK` → `fa`, `ES` → `es`). Adding a region or changing a mapping needs a
  store release.
- **Plan prices.** `src/screens/PlansScreen.tsx` renders `t("plans.nightPrice")` and
  friends — hardcoded strings in `src/i18n/translations.ts`. Nothing in the codebase ever
  queries the store for a real price: grepping `src/premium/` for
  `getProducts|getSkuDetails|localizedPrice` returns **zero matches**. A price change
  means a release, in three languages, coordinated with two stores.
- **Incident response for anything that isn't AI.** There is no maintenance banner, no
  way to disable cloud sync, and no minimum-supported-version gate.

The blocker is structural, not incidental: `get-ai-config` **requires a JWT**
(`src/core/aiConfigClient.ts:31` returns `null` without a token, and `config.toml` sets
`verify_jwt = true`). Default language is decided on first launch and the Plans screen is
browsable while signed out, so both live entirely outside the reach of the existing
endpoint.

## Goals

1. One config mechanism for the whole app, not one per domain.
2. Config that reaches **anonymous** callers, so first-run and logged-out surfaces are
   covered.
3. Writes that fail loudly on a malformed value instead of silently disabling a feature.
4. An audit trail for "who changed this, and when".

## Non-goals

- **No admin UI.** Values change via committed SQL recipes, as today. Chosen explicitly
  during brainstorming; a protected admin surface is a larger project than this one.
- **No percentage rollout.** Cohort remains the only identity targeting axis.
- **No server-side targeting by platform or app version.** See "Why the anonymous request
  takes no parameters" below — this is a deliberate rejection, not an omission.
- **Remote config does not control what a user is charged.** Prices are display strings
  only; App Store Connect and Bazaar own the actual amounts. See the drift risk in
  "Prices" below.
- **Credit cost per action stays hardcoded**, unchanged from the prior design.

## Why generalize rather than build alongside

`docs/superpowers/plans/2026-08-04-ai-remote-config-followups.md` records that **no SQL in
the AI config branch has touched a database, and no Edge Function has served a request.**
The system is merged to `main` but has never run. There are therefore zero rows to migrate
and zero clients depending on the response shape in the field.

This is the cheapest this refactor will ever be. The alternative — a second config table
next to `ai_config` — buys safety that is not needed and permanently costs a "which table
does this key go in?" decision on every future key, two client caches, and two sets of
cohort-precedence footguns.

A third-party service (Firebase Remote Config, PostHog, ConfigCat) was considered and
rejected on two grounds. `fa` is a first-class locale and Bazaar is a shipping billing
target, so a meaningful share of users are in Iran, where Google endpoints are unreliable
or blocked — remote config that silently never loads for an entire market is worse than
none. And it cannot serve the AI case at all, because `ai-proxy` *enforces* from the same
rows with the service-role key, which is the entire threat model.

## Data model

Four tables, all with deny-all RLS and service-role-only reads — the posture
`20260804000000_ai_config.sql` already establishes and which is unchanged here.

### `app_config`

Generalization of `ai_config`.

```sql
create table public.app_config (
  key        text not null references public.app_config_keys (key),
  cohort     text not null default 'everyone'
               check (cohort in ('everyone','premium','alpha','allowlist')),
  value      jsonb not null,
  visibility text not null default 'server'
               check (visibility in ('server','client','public')),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (key, cohort)
);
```

`visibility` replaces `client_visible boolean`, which cannot express the new middle case:

| value | meaning |
|---|---|
| `server` | never leaves the backend — prompts, model ids, rate limits |
| `client` | requires a valid JWT — the AI flags |
| `public` | anon-safe — locale, prices, maintenance, min-version |

### `app_config_keys` — the registry

```sql
create table public.app_config_keys (
  key            text primary key,
  value_type     text not null
                   check (value_type in ('boolean','integer','string','locale_map')),
  max_visibility text not null
                   check (max_visibility in ('server','client','public')),
  description    text not null
);
```

A `before insert or update` trigger on `app_config` rejects any write whose `value` does
not match the key's declared `value_type`, and any whose `visibility` exceeds the key's
`max_visibility`.

This generalizes `ai_config_switch_is_boolean`, which today protects exactly one key
family by hand and would need a new hand-written check per key family forever.

`max_visibility` is a **ceiling declared once per key**, not a per-row value. The mistake
worth engineering against is not a wrong boolean — it is someone marking a system prompt
or a rate limit `public` while firefighting at 2am. A row may be less visible than its
ceiling; never more.

`value_type = 'locale_map'` validates a flat JSON object of string → string.

### `app_config_audit`

Trigger-written on every insert/update/delete:
`(key, cohort, old_value, new_value, changed_at, changed_by)`. Postgres cannot otherwise
answer "who turned AI off, and when". Reverses the prior design's "no audit table"
non-goal, which was reasonable for one domain and is not for a system that now gates
pricing and force-update.

**Populating `changed_by` and `updated_by`.** Every write arrives as the service role, so
`current_user` is the same value for all of them and records nothing useful. The SQL
recipes instead set a session variable the trigger reads:

```sql
set local app.config_actor = 'payam';   -- who is making this change
```

The trigger writes `coalesce(nullif(current_setting('app.config_actor', true), ''), session_user)`,
so a recipe run without the variable still records *something* rather than failing. The
recipes in `supabase/scripts/` carry the `set local` line at the top, and the ops doc
states that omitting it degrades the audit trail rather than blocking the change — an
incident response must never be gated on remembering to fill in a name.

### `app_config_allowlist`

Unchanged; renamed from `ai_config_allowlist`.

### Day-one registry contents

| key | `value_type` | `max_visibility` |
|---|---|---|
| `ai_enabled`, `ai_action_*` | boolean | client |
| `ai_max_image_bytes`, `ai_max_audio_seconds` | integer | client |
| `ai_rate_limit_per_min`, `ai_rate_limit_transcribe_per_min` | integer | **server** |
| model ids, prompts | string | **server** |
| `locale_default` | string | public |
| `locale_region_map` | locale_map | public |
| `plans_price_{night,trip,explorer}` | locale_map | public |
| `plans_price_{night,trip,explorer}_extend` | locale_map | public |
| `maintenance_message` | locale_map | public |
| `sync_enabled` | boolean | public |
| `min_supported_version` | string | public |

Seeding follows the prior migration's rule exactly: every key seeded at its **current
effective behaviour**, so applying the migration changes nothing observable. Provider
params (models, prompts) stay unseeded — absent means "fall back to `Deno.env`", which is
today's behaviour, and seeding them would freeze secret values into the table and break
`supabase secrets set`.

## Server

### One function, `get-app-config`, JWT optional

`config.toml` sets `verify_jwt = false`; authentication is handled inside the function,
which it already does for its own checks today.

| | Anonymous | Authenticated |
|---|---|---|
| Cohorts | none — `everyone` rows only | `allowlist > alpha > premium > everyone` |
| Keys returned | `visibility = 'public'` | `visibility in ('public','client')` |
| `Cache-Control` | `public, max-age=300, s-maxage=300` | `private, no-store` |
| `ttlSeconds` in body | 300 | 900 |

The cohort resolver (`supabase/functions/_shared/aiConfigResolve.ts`, renamed to
`appConfigResolve.ts`) is unchanged apart from `client_visible` → `visibility`. Its
precedence semantics, its per-key allowlist rule, and its "visibility comes from the
*winning* row" property all carry over — that last one is what stops a `server`-only
override being bypassed by a more visible row at a lower-precedence cohort.

**The rename breaks a test that must be updated, not deleted.**
`src/core/aiConfig.test.ts:124-125` reads `supabase/functions/_shared/aiConfigResolve.ts`
by **hardcoded path string** and fails if the client and server copies of
`ACTION_FLAG_KEYS` drift — Deno cannot import from `src/`, so a filesystem read is the
only available check. Renaming the file makes that test fail with `ENOENT`, which is loud
and therefore safe, but the temptation under a red test is to delete it. The path must be
updated instead; the invariant it protects (client and server agreeing on flag key names)
matters more after generalization, not less.

### Why the anonymous request takes no parameters

The instinct is to send `?platform=ios&v=1.2.0` and resolve server-side. Rejected:

1. Every parameter multiplies cache keys, and the entire value of the anonymous payload is
   that it is one identical response for every install.
2. **Client-asserted attributes are spoofable.** A server that branches on a claimed app
   version can be told any version. The branch is worthless as a control and merely
   expensive as a cache key.

Instead the server ships the *data* and the client performs the comparison it is already
qualified to make: `min_supported_version` is sent as a value and compared against the
client's own version; `locale_region_map` is sent whole and consumed by `resolveAppLocale`.
The client already knows its locale, version, and platform. Moving the comparison
client-side costs nothing, because a client that would lie about its version could equally
ignore the server's answer.

### Response shape

The current `{flags, limits}` split-by-JS-type stops working once values include strings
and locale maps. One bag instead, typed at parse time on the client:

```json
{ "config": { "ai_enabled": true,
              "min_supported_version": "1.1.0",
              "plans_price_night": { "en": "$4.99", "fa": "۹۹٬۰۰۰ تومان" } },
  "ttlSeconds": 300 }
```

### `get-ai-config` stays as an alias for one release

A thin delegating function returning the old `{flags, limits, ttlSeconds}` shape.

Evidence says it is unnecessary: the repo has no git tags,
`changelogs/1.2.0.release-checklist.md` has zero checked boxes, all twelve `ai-config`
commits landed after the 1.2.0 release-notes commit, and the followups doc states no Edge
Function has served a request.

It ships anyway because the failure mode is asymmetric. If a released build *did* call
`get-ai-config` and the slug disappeared, those installs would get a 404 →
`fetchAiConfig` returns `null` → they keep bundled defaults permanently, meaning **the AI
kill switch is silently lost for exactly the users an incident would need to reach**. The
fail-open design that makes a stale client safe is what makes this failure invisible.

Delete it once a build is confirmed shipped. Tracked as a follow-up, not left to memory.

### The visibility invariant

*A key may be `public` only if a hostile client lying about its value costs you nothing.*

Prices, locale maps, and maintenance text pass. Rate limits and prompts do not, which is
why they are `server`. AI flags are `client` because AI is behind sign-in anyway.
`max_visibility` is where that judgement is recorded once rather than re-litigated per row.

Enforcement is untouched: `ai-proxy` continues to read rows with the service role and
enforce independently. **The config endpoint is a delivery channel, never an authority.**

### Failure handling

A database read failure returns **503, not 200** — carried over verbatim from
`get-ai-config/index.ts:86-97`, whose reasoning holds unchanged and applies more strongly
now that responses are CDN-cached: a 200 meaning "no restrictions apply" is
indistinguishable from a healthy response, so it would be cached and would permanently
clobber a correctly-cached `false`. The client must be able to distinguish "nothing
restricts you" from "I could not find out".

The cohort-error 503 path (entitlement or `is_alpha` read failure) applies only to the
authenticated mode; anonymous callers have no cohorts to fail to read.

The `AI_KILL_SWITCH` env break-glass stays, checked before any DB read.

### Abuse

Read-only, takes no input, returns a small static payload containing no user data, and is
CDN-cached for five minutes — so the database sees roughly one query per five minutes
regardless of traffic. No rate limiting is added.

## Client

### `RemoteConfigProvider`

Replaces `AiConfigProvider`, inheriting its behaviour wholesale: identity-keyed cache, the
`userIdRef` staleness guard, the `pendingRefetch` drain, and the session-`loading` guard
that prevents the cache being wiped on every cold start. Those four came out of a review
cycle and are not rewritten.

Two changes:

- **It fetches while signed out.** `aiConfigClient.ts:31` currently bails without a token;
  that inverts. The existing identity-keyed cache already handles anonymity (`null` →
  `removeItem(CACHE_USER_KEY)`), and because an identity change drops the cache, an
  authed → anon transition correctly sheds `client`-visibility keys rather than leaking
  them into a signed-out session.
- **`useAiConfig()` keeps its exact current signature** (`config`, `isActionEnabled`,
  `refresh`) as a typed selector over the general config. `AiReceiptScreen` and every
  other consumer is unchanged.

`parseRemoteConfig` keeps `parseAiConfig`'s discipline: never throws, falls back **per
key**, so one malformed value costs only that key rather than silently reverting every
flag.

### Default language — and a defect this exposes

`src/i18n/LocaleContext.tsx:112-118` persists `SETTINGS_KEYS.locale` when
`nativeLayoutDirectionMismatch(l)` is true on first launch — **without the user ever
choosing a language**. The sign-in hydration path at `:136-154` writes it too. Any "has
the user picked a language?" test based on that setting being present therefore reports
**yes** for a first-run Farsi-device user, and a remote default would silently refuse to
apply to precisely the users it targets.

Fix: a `SETTINGS_KEYS.localeUserChosen` marker written **only** inside `setLocale`.
Backfill conservatively — every existing install holding a persisted locale is marked
chosen, so remote config can never retroactively change the language of someone already
using the app. Remote defaults reach genuinely new installs only.

**Remote locale applies at next launch, not immediately.** `crossesAppRtlBoundary`
requires a native reload to move in or out of Farsi, and a background config fetch that
reboots the app mid-session is unacceptable. Resolution happens once, at mount:

1. explicit user choice (`localeUserChosen` + `locale`) — always wins
2. cached remote `locale_default` / `locale_region_map`
3. bundled `resolveAppLocale` with the hardcoded region map

`LocaleProvider` reads the cached config directly from AsyncStorage through a shared
`readCachedRemoteConfig()` helper rather than through React context — it already performs
async work behind a spinner at mount, and this avoids a provider-ordering dependency or a
wait on a second hydration. `RemoteConfigProvider` never blocks first render.

### Prices

`PlansScreen` reads `priceFor(pass, locale)` and falls back to the existing
`t("plans.nightPrice")` strings, which stay exactly where they are as the offline and
first-launch fallback. No new failure mode is introduced.

**Drift risk, accepted deliberately.** This makes remote config a second source of truth
against App Store Connect and Bazaar. If they disagree, a user sees one number and is
charged another — a refund and store-review problem, not merely a bug. Mitigation is
procedural, not technical: the ops document lists each price key beside the SKU
(`EXPO_PUBLIC_NIGHT_OUT_PASS_ID` and siblings) it must match, and changing a store price
without changing the key is called out as the failure to look for.

### Force-update

`min_supported_version` compared against a shared `appVersion()` helper, extracted from
the resolution `src/observability/sentry.ts:43` already performs rather than duplicated.

**This gate must fail open.** Absent config, an unparseable local version, or a malformed
remote semver → never block. A force-update screen that fires wrongly bricks the app for
the entire install base, which is strictly worse than anything it prevents.

### Maintenance and sync

`maintenance_message` (nullable locale map) renders a non-blocking banner.
`sync_enabled: false` stops cloud sync attempts.

## Testing

Pure and fast, matching the existing split (logic separated from I/O, as `aiConfig.ts` and
`aiConfigClient.ts` already are):

- `parseRemoteConfig` per-key fallback — including that one malformed key does not poison
  its neighbours
- semver comparison, including every fail-open path
- locale resolution with and without a remote map, and the `localeUserChosen` precedence
- price selection with a missing locale falling back to the bundled string
- resolver precedence tests — already exist, extended for `visibility`
- registry validation in SQL via `supabase/scripts/test_app_config.sql`, in the shape of
  the existing `test_ai_config.sql`
- a leak test asserting the anonymous response contains no `server` or `client` key

## Inherited verification gate — must be closed by this work

Gate 1 of `2026-08-04-ai-remote-config-followups.md` is still open: **does a JSONB `false`
round-trip to a JS `false` through supabase-js, or arrive as the string `"false"`?**

If it arrives as a string, `configBool` returns its `true` fallback and **every kill switch
silently does nothing**, while all unit tests stay green because they feed JS booleans
directly. It was never run because Docker Desktop would not start on the build machine.

It now gates pricing and force-update as well as AI. It belongs in this plan rather than
being inherited a second time.

## Migration and rollout order

1. Migration: create the four tables, seed the registry, seed values at current effective
   behaviour, drop `ai_config` / `ai_config_allowlist` (no production rows exist).
2. Rename the shared resolver, swap `client_visible` for `visibility`.
3. Deploy `get-app-config`; keep `get-ai-config` as a delegating alias.
4. Client: `RemoteConfigProvider`, `useAiConfig()` selector unchanged.
5. Wire consumers one at a time — locale (with the `localeUserChosen` fix), prices,
   maintenance/force-update.
6. Close the JSONB round-trip gate before any of this is relied upon in production.

## Follow-ups

- Delete the `get-ai-config` alias once a build containing `get-app-config` is confirmed
  shipped.
- `ai_action_classify_category` still has no client-side consumer — carried over unresolved
  from the prior design's "known gap".
- Reading real localized prices from the store SDK (`getProducts` / Poolakey `SkuDetails`)
  would remove the drift risk entirely. Deliberately deferred; revisit if prices ever
  diverge in practice.
