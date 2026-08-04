# General Remote Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the AI-only `ai_config` system with a general `app_config` system that also serves anonymous callers, so AI flags, default language, plan price display, and incident switches can all change without a store release.

**Architecture:** One Postgres table (`app_config`) holds `(key, cohort) → jsonb`, guarded by a registry table that declares each key's type and maximum visibility, plus an audit table. One Edge Function (`get-app-config`) resolves per caller — anonymous callers get only `public` keys from a CDN-cacheable response, authenticated callers additionally get `client` keys. `ai-proxy` continues to enforce independently with the service role. The client holds one `RemoteConfigProvider` with an AsyncStorage cache; typed selectors read from it.

**Tech Stack:** Supabase (Postgres 15, Deno Edge Functions, supabase-js 2.49.1), React Native / Expo, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-04-remote-config-design.md`

## Global Constraints

- **Seeds must be no-ops.** Every seeded value equals current effective behaviour, so applying the migration changes nothing observable. Numeric defaults: `ai_rate_limit_per_min = 20`, `ai_rate_limit_transcribe_per_min = 10`, `ai_max_image_bytes = 4000000` (base64 characters — do **not** round to 4194304), `ai_max_audio_seconds = 120`.
- **Provider params are never seeded.** `ai_model`, `ai_receipt_model`, `ai_expense_prompt`, `ai_category_prompt` stay absent so they fall back to `Deno.env`. Seeding them would freeze secret values into the table and break `supabase secrets set`.
- **Deny-all RLS on every config table.** RLS enabled, zero policies, `revoke all ... from anon, authenticated`. Only the service role reads these rows.
- **The config endpoint is a delivery channel, never an authority.** `ai-proxy` keeps its own independent enforcement. No task may make the proxy trust a client-supplied config value.
- **Edge Function code under test must be Deno-free.** `vitest.config.ts:9` includes `supabase/functions/**/*.test.ts` and runs under Node. Anything importing `npm:` or touching `Deno.*` must stay out of modules imported by a `.test.ts`. Pure logic goes in `_shared/`, I/O stays in `index.ts`.
- **Fail open on the client, fail closed on the server.** Client-side: absent or malformed config falls back to bundled defaults per key. Server-side: a DB read failure returns 503, never a 200.
- **Visibility invariant:** a key may be `public` only if a hostile client lying about its value costs nothing. Rate limits and prompts are `server`. AI flags are `client`. Locale, prices, maintenance, min-version are `public`.
- **Commit after every task.** Conventional Commits, scope `config`.

## File Structure

**Created:**
- `supabase/migrations/20260804010000_app_config.sql` — schema, triggers, seed, drops `ai_config`
- `supabase/scripts/test_app_config.sql` — verification assertions
- `supabase/scripts/set-app-config.sql` — operator recipes (replaces `set-ai-flag.sql`)
- `supabase/functions/_shared/appConfigResolve.ts` + `.test.ts` — renamed resolver, adds visibility
- `supabase/functions/_shared/appConfigResponse.ts` + `.test.ts` — pure response shaping
- `supabase/functions/get-app-config/index.ts` — the endpoint
- `src/core/remoteConfig.ts` + `.test.ts` — pure parse + typed accessors
- `src/core/remoteConfigClient.ts` — fetch + AsyncStorage cache accessor
- `src/core/appVersion.ts` + `.test.ts` — version read + semver comparison
- `src/core/planPrices.ts` + `.test.ts` — price selection
- `src/premium/RemoteConfigContext.tsx` — the provider
- `src/components/MaintenanceBanner.tsx`, `src/screens/ForceUpdateScreen.tsx`
- `docs/ops/remote-config.md` — operator runbook

**Modified:**
- `supabase/functions/ai-proxy/index.ts` — import path, table names, `visibility` column
- `supabase/functions/get-ai-config/index.ts` — becomes a delegating alias
- `supabase/config.toml` — add `get-app-config` with `verify_jwt = false`
- `src/core/aiConfig.ts` — `aiConfigFrom(RemoteConfig)` replaces `parseAiConfig`
- `src/core/aiConfig.test.ts:71-131` — migration path, seed regex, resolver path
- `src/i18n/localeDefaults.ts` + `.test.ts` — accept a remote region map and fallback
- `src/i18n/LocaleContext.tsx:81-88,104-129,161-201` — `localeUserChosen`, remote-aware resolution
- `src/data/tallyRepo.ts:1554+` — new `SETTINGS_KEYS.localeUserChosen`
- `src/db/tallyMigrations.ts` — backfill `locale_user_chosen`
- `src/screens/PlansScreen.tsx:154-185` — remote prices with translation fallback
- `src/observability/sentry.ts:42-45` — use the shared `currentAppVersion()`
- `src/i18n/translations.ts` — `forceUpdate` keys in all three locales
- `App.tsx:50,503` — `AiConfigProvider` → `RemoteConfigProvider`, plus gate and banner

**Deleted:**
- `supabase/functions/_shared/aiConfigResolve.ts` and its test (renamed)
- `supabase/scripts/set-ai-flag.sql` (renamed)
- `src/core/aiConfigClient.ts`, `src/premium/AiConfigContext.tsx` (superseded)

## Slice points

If this needs to ship in stages: Tasks 1–6 are the platform and leave behaviour identical. Tasks 7, 8, 9 are independent consumers and can land in any order or be deferred. Task 10 must precede any production reliance.

---

### Task 1: Migration — schema, guardrails, audit, seed

**Files:**
- Create: `supabase/migrations/20260804010000_app_config.sql`
- Create: `supabase/scripts/test_app_config.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `app_config_keys`, `app_config`, `app_config_allowlist`, `app_config_audit`; trigger functions `public.tally_app_config_validate()` and `public.tally_app_config_audit()`; the session-variable contract `app.config_actor`.

- [ ] **Step 1: Write the failing verification script**

Create `supabase/scripts/test_app_config.sql`:

```sql
-- Verification for 20260804010000_app_config.sql. Run in the SQL editor.
-- Mirrors test_ai_config.sql: assertions that raise on failure.
--
-- Run this once, right after applying the migration and BEFORE any operator
-- edits values with set-app-config.sql. The seeded counts below are exact, so
-- a legitimate later edit will make this raise even though nothing is wrong.

do $$
declare
  n integer;
  ok boolean;
begin
  -- 1. Registry and value seeds landed.
  select count(*) into n from public.app_config_keys;
  if n <> 21 then
    raise exception 'expected 21 registry keys, found %', n;
  end if;

  select count(*) into n from public.app_config where cohort = 'everyone';
  if n <> 10 then
    raise exception 'expected 10 seeded everyone rows, found %', n;
  end if;

  -- 2. Nothing sensitive is reachable by a client.
  select count(*) into n
    from public.app_config_keys
   where (key like 'ai_rate_limit%' or key like '%_prompt' or key like '%model')
     and max_visibility <> 'server';
  if n <> 0 then
    raise exception 'rate limits, prompts and models must be server-only (found %)', n;
  end if;

  select count(*) into n
    from public.app_config c join public.app_config_keys k using (key)
   where case c.visibility     when 'server' then 0 when 'client' then 1 else 2 end
       > case k.max_visibility when 'server' then 0 when 'client' then 1 else 2 end;
  if n <> 0 then
    raise exception 'row visibility exceeds key ceiling in % rows', n;
  end if;

  -- 3. The validation trigger actually rejects a wrong type. This is the whole
  --    point of the registry, so assert it rather than assume it.
  ok := false;
  begin
    update public.app_config set value = '"false"'::jsonb
     where key = 'ai_enabled' and cohort = 'everyone';
  exception when others then
    ok := true;
  end;
  if not ok then
    raise exception 'validation trigger accepted a JSON string for a boolean key';
  end if;

  -- 4. The audit trigger records changes, attributed to app.config_actor.
  set local app.config_actor = 'test_app_config.sql';
  update public.app_config set value = 'true'::jsonb
   where key = 'ai_enabled' and cohort = 'everyone';
  select count(*) into n
    from public.app_config_audit
   where key = 'ai_enabled' and changed_by = 'test_app_config.sql';
  if n < 1 then
    raise exception 'audit trigger wrote no row';
  end if;

  -- 5. RLS on with zero policies, i.e. deny-all for anon/authenticated.
  select count(*) into n
    from pg_policies
   where schemaname = 'public'
     and tablename in ('app_config','app_config_keys','app_config_allowlist','app_config_audit');
  if n <> 0 then
    raise exception 'expected no RLS policies (deny-all), found %', n;
  end if;

  select count(*) into n
    from pg_class
   where relname in ('app_config','app_config_keys','app_config_allowlist','app_config_audit')
     and relrowsecurity;
  if n <> 4 then
    raise exception 'expected RLS enabled on all four tables, found %', n;
  end if;

  -- 6. The AI-only tables are gone.
  select count(*) into n from pg_class where relname in ('ai_config','ai_config_allowlist');
  if n <> 0 then
    raise exception 'ai_config tables still present (%)', n;
  end if;

  raise notice 'app_config verification passed';
end $$;

-- 7. Manual check — as an authenticated (non-service-role) client this must
--    return zero rows, not an error. A hard error would mean any future
--    client-side query surfaces as a crash:
--      set local role authenticated;
--      select count(*) from public.app_config;  -- expect 0
```

- [ ] **Step 2: Run it to verify it fails**

```bash
supabase start
psql "$DB_URL" -f supabase/scripts/test_app_config.sql
```

Expected: `ERROR: relation "public.app_config_keys" does not exist`.

If `supabase start` fails, **stop and fix Docker before continuing.** Docker Desktop crashed repeatedly during the previous feature (`docs/superpowers/plans/2026-08-04-ai-remote-config-followups.md`), which is why that work shipped unverified. This plan cannot be verified without a local database, and shipping unverified a second time is not acceptable.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/20260804010000_app_config.sql`:

```sql
-- General remote config. Generalizes 20260804000000_ai_config.sql from the AI
-- section to the whole app, and extends it to serve ANONYMOUS callers.
--
-- Three things the AI-only version could not do, and why each needed a change:
--
--  * Serve signed-out clients. Default language is decided on first launch and
--    the Plans screen is browsable before sign-in, so `visibility` gains a
--    'public' level that requires no JWT.
--  * Fail loudly on a bad write. `ai_config` hand-wrote one check constraint
--    for one key family (`ai_config_switch_is_boolean`). `app_config_keys`
--    declares every key's type once and a trigger enforces it.
--  * Say who changed what. `app_config_audit` records it.
--
-- Clients never read these tables. `get-app-config` returns only the keys a
-- caller's visibility allows, and `ai-proxy` enforces from the same rows with
-- the service-role key. A client that could write here could re-enable a
-- killed feature or raise its own rate limit, which is the whole threat
-- model — same posture as ai_credit_balances in 20260801000000_ai_credits.sql.

-- ─────────────────────── Registry (the guardrail) ───────────────────────
-- Declares every legal key once. `max_visibility` is a CEILING, not a value:
-- a row may be less visible than its key allows, never more. The mistake
-- worth engineering against is not a wrong boolean — it is marking a system
-- prompt or a rate limit 'public' while firefighting.

create table if not exists public.app_config_keys (
  key            text primary key,
  value_type     text not null
                   check (value_type in ('boolean','integer','string','locale_map')),
  max_visibility text not null
                   check (max_visibility in ('server','client','public')),
  description    text not null
);

create table if not exists public.app_config (
  key        text not null references public.app_config_keys (key) on delete restrict,
  cohort     text not null default 'everyone'
               check (cohort in ('everyone','premium','alpha','allowlist')),
  value      jsonb not null,
  visibility text not null default 'server'
               check (visibility in ('server','client','public')),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (key, cohort)
);

create table if not exists public.app_config_allowlist (
  key     text not null references public.app_config_keys (key) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (key, user_id)
);

create index if not exists app_config_allowlist_user_idx
  on public.app_config_allowlist (user_id);

create table if not exists public.app_config_audit (
  id         bigint generated always as identity primary key,
  key        text        not null,
  cohort     text        not null,
  op         text        not null,
  old_value  jsonb,
  new_value  jsonb,
  changed_at timestamptz not null default now(),
  changed_by text        not null
);

create index if not exists app_config_audit_key_idx
  on public.app_config_audit (key, changed_at desc);

-- ─────────────────────────── Validation ───────────────────────────
-- Every write arrives as the service role, so `current_user` is identical for
-- all of them and records nothing useful. Operators set a session variable:
--     set local app.config_actor = 'payam';
-- Missing it degrades the audit trail to `session_user` rather than failing —
-- an incident response must never be gated on remembering to fill in a name.

create or replace function public.tally_app_config_validate()
returns trigger
language plpgsql
as $$
declare
  spec     public.app_config_keys%rowtype;
  rank_row integer;
  rank_max integer;
begin
  select * into spec from public.app_config_keys where key = new.key;
  if not found then
    raise exception 'unknown config key "%" — add it to app_config_keys first', new.key;
  end if;

  if spec.value_type = 'boolean' then
    if jsonb_typeof(new.value) <> 'boolean' then
      raise exception 'key "%" expects a JSON boolean, got %', new.key, jsonb_typeof(new.value);
    end if;

  elsif spec.value_type = 'integer' then
    if jsonb_typeof(new.value) <> 'number'
       or new.value::numeric <> trunc(new.value::numeric) then
      raise exception 'key "%" expects a JSON integer, got %', new.key, new.value;
    end if;

  elsif spec.value_type = 'string' then
    if jsonb_typeof(new.value) <> 'string' then
      raise exception 'key "%" expects a JSON string, got %', new.key, jsonb_typeof(new.value);
    end if;

  elsif spec.value_type = 'locale_map' then
    if jsonb_typeof(new.value) <> 'object' then
      raise exception 'key "%" expects an object of locale -> string, got %',
        new.key, jsonb_typeof(new.value);
    end if;
    if exists (
      select 1 from jsonb_each(new.value) e where jsonb_typeof(e.value) <> 'string'
    ) then
      raise exception 'key "%" expects every locale value to be a string', new.key;
    end if;
  end if;

  rank_row := case new.visibility      when 'server' then 0 when 'client' then 1 else 2 end;
  rank_max := case spec.max_visibility when 'server' then 0 when 'client' then 1 else 2 end;
  if rank_row > rank_max then
    raise exception 'key "%" may not be more visible than % (got %)',
      new.key, spec.max_visibility, new.visibility;
  end if;

  new.updated_at := now();
  new.updated_by := coalesce(nullif(current_setting('app.config_actor', true), ''), session_user);
  return new;
end $$;

create trigger app_config_validate
  before insert or update on public.app_config
  for each row execute function public.tally_app_config_validate();

-- ─────────────────────────── Audit ───────────────────────────
-- NEW is unassigned in a row-level DELETE trigger, so the branches are
-- explicit rather than coalesce(new.key, old.key) — referencing NEW on a
-- DELETE raises "record new is not assigned yet".

create or replace function public.tally_app_config_audit()
returns trigger
language plpgsql
as $$
declare
  actor text := coalesce(nullif(current_setting('app.config_actor', true), ''), session_user);
begin
  if tg_op = 'DELETE' then
    insert into public.app_config_audit (key, cohort, op, old_value, new_value, changed_by)
    values (old.key, old.cohort, tg_op, old.value, null, actor);
  elsif tg_op = 'UPDATE' then
    insert into public.app_config_audit (key, cohort, op, old_value, new_value, changed_by)
    values (new.key, new.cohort, tg_op, old.value, new.value, actor);
  else
    insert into public.app_config_audit (key, cohort, op, old_value, new_value, changed_by)
    values (new.key, new.cohort, tg_op, null, new.value, actor);
  end if;
  return null;
end $$;

create trigger app_config_audit_trg
  after insert or update or delete on public.app_config
  for each row execute function public.tally_app_config_audit();

-- ─────────────────────────── Lockdown ───────────────────────────
-- RLS with zero policies denies every anon/authenticated request. The
-- service-role key bypasses RLS, which is how the Edge Functions read.

alter table public.app_config           enable row level security;
alter table public.app_config_keys      enable row level security;
alter table public.app_config_allowlist enable row level security;
alter table public.app_config_audit     enable row level security;

revoke all on public.app_config           from anon, authenticated;
revoke all on public.app_config_keys      from anon, authenticated;
revoke all on public.app_config_allowlist from anon, authenticated;
revoke all on public.app_config_audit     from anon, authenticated;

-- ─────────────────────── Registry seed (21 keys) ───────────────────────

insert into public.app_config_keys (key, value_type, max_visibility, description) values
  ('ai_enabled',                       'boolean',    'client',
   'Master AI switch. False makes every action unavailable; it does not hide the AI screen.'),
  ('ai_action_parse_receipt',          'boolean',    'client', 'Receipt scanning.'),
  ('ai_action_parse_description',      'boolean',    'client', 'Natural-language expense entry.'),
  ('ai_action_classify_category',      'boolean',    'client', 'Category classification (free, no credit).'),
  ('ai_action_transcribe',             'boolean',    'client', 'Voice transcription.'),
  ('ai_max_image_bytes',               'integer',    'client',
   'Base64 CHARACTER count at which receipts are downscaled before upload. A trigger, not a hard reject.'),
  ('ai_max_audio_seconds',             'integer',    'client', 'Voice recording length cap.'),
  ('ai_rate_limit_per_min',            'integer',    'server', 'Per-user proxy calls per minute.'),
  ('ai_rate_limit_transcribe_per_min', 'integer',    'server', 'Per-user transcribe calls per minute.'),
  ('ai_model',                         'string',     'server', 'Override for AI_MODEL. Unset = use the env value.'),
  ('ai_receipt_model',                 'string',     'server', 'Override for AI_RECEIPT_MODEL.'),
  ('ai_expense_prompt',                'string',     'server', 'Override for AI_EXPENSE_PROMPT.'),
  ('ai_category_prompt',               'string',     'server', 'Override for AI_CATEGORY_PROMPT.'),
  ('locale_default',                   'string',     'public',
   'App locale for a first-run device whose language and region both miss. One of en/fa/es.'),
  ('locale_region_map',                'locale_map', 'public',
   'Region code -> app locale, e.g. {"IR":"fa"}. Consulted only when no preferred device language ships with the app.'),
  ('plans_price_night',                'locale_map', 'public', 'Displayed Night Out price per locale.'),
  ('plans_price_trip',                 'locale_map', 'public', 'Displayed Trip price per locale.'),
  ('plans_price_explorer',             'locale_map', 'public', 'Displayed Explorer price per locale.'),
  ('maintenance_message',              'locale_map', 'public',
   'Non-blocking banner text per locale. Absent or empty = no banner.'),
  ('sync_enabled',                     'boolean',    'public', 'False stops cloud sync attempts app-wide.'),
  ('min_supported_version',            'string',     'public',
   'Semver floor. Clients below this show the force-update screen. Malformed or absent = never block.')
on conflict (key) do nothing;

-- ─────────────────────── Value seed (10 rows) ───────────────────────
-- Every key at its CURRENT effective behaviour, so applying this migration
-- changes nothing observable.
--
-- NOT seeded, deliberately:
--  * ai_model / ai_receipt_model / *_prompt — absent means "fall back to the
--    Deno.env value", which is today's behaviour. Seeding would freeze secret
--    values into the table and break `supabase secrets set`.
--  * plans_price_* — absent means PlansScreen keeps its bundled translation
--    strings, which is today's behaviour.
--  * maintenance_message — absent means no banner.
--  * min_supported_version — absent means never block.
--  * locale_default / locale_region_map — absent means the bundled
--    APP_LOCALE_BY_REGION map in src/i18n/localeDefaults.ts is used.
--
-- 4000000 is base64 CHARACTERS, matching downscaleReceiptImage.ts:37. Do NOT
-- "round up" to 4 MiB (4194304) — that silently changes the downscale
-- threshold and breaks the no-op property.

insert into public.app_config (key, cohort, value, visibility) values
  ('ai_enabled',                       'everyone', 'true'::jsonb,    'client'),
  ('ai_action_parse_receipt',          'everyone', 'true'::jsonb,    'client'),
  ('ai_action_parse_description',      'everyone', 'true'::jsonb,    'client'),
  ('ai_action_classify_category',      'everyone', 'true'::jsonb,    'client'),
  ('ai_action_transcribe',             'everyone', 'true'::jsonb,    'client'),
  ('ai_max_image_bytes',               'everyone', '4000000'::jsonb, 'client'),
  ('ai_max_audio_seconds',             'everyone', '120'::jsonb,     'client'),
  ('ai_rate_limit_per_min',            'everyone', '20'::jsonb,      'server'),
  ('ai_rate_limit_transcribe_per_min', 'everyone', '10'::jsonb,      'server'),
  ('sync_enabled',                     'everyone', 'true'::jsonb,    'public')
on conflict (key, cohort) do nothing;

-- ─────────────────── Retire the AI-only tables ───────────────────
-- Safe to drop rather than migrate: per
-- docs/superpowers/plans/2026-08-04-ai-remote-config-followups.md, no SQL in
-- that branch ever touched a database and no Edge Function ever served a
-- request, so there are no production rows.

drop table if exists public.ai_config_allowlist;
drop table if exists public.ai_config;
```

- [ ] **Step 4: Run the verification**

```bash
supabase db reset
psql "$DB_URL" -f supabase/scripts/test_app_config.sql
```

Expected: `NOTICE: app_config verification passed`.

- [ ] **Step 5: Verify deny-all returns zero rows rather than an error**

```bash
psql "$DB_URL" -c "set local role authenticated; select count(*) from public.app_config;"
```

Expected: `0`. A permission **error** here would mean any future client-side query surfaces as a crash rather than an empty result.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260804010000_app_config.sql supabase/scripts/test_app_config.sql
git commit -m "feat(config): add app_config tables, registry guardrails, and audit trail"
```

---

### Task 2: Shared resolver — rename and add visibility

**Files:**
- Create: `supabase/functions/_shared/appConfigResolve.ts` + `.test.ts` (from `aiConfigResolve.*`)
- Delete: `supabase/functions/_shared/aiConfigResolve.ts`, `aiConfigResolve.test.ts`
- Modify: `supabase/functions/ai-proxy/index.ts:41-47,114,133`
- Modify: `supabase/functions/get-ai-config/index.ts:17-21,82-84,132`
- Modify: `src/core/aiConfig.test.ts:71-131`

**Interfaces:**
- Consumes: table `app_config` (Task 1).
- Produces:
  - `type Visibility = "server" | "client" | "public"`
  - `type ConfigRow = { key: string; cohort: Cohort; value: unknown; visibility: Visibility }`
  - `resolveConfig(rows: ConfigRow[], caller: CallerCohorts): Map<string, unknown>` — unchanged
  - `resolveForAudience(rows: ConfigRow[], caller: CallerCohorts, audience: "client" | "public"): Record<string, unknown>`
  - `ANON_CALLER: CallerCohorts`
  - `configBool`, `configInt`, `configStr`, `ACTION_FLAG_KEYS` — unchanged

- [ ] **Step 1: Write the failing tests**

Copy `aiConfigResolve.test.ts` to `appConfigResolve.test.ts`, change its import to `./appConfigResolve`, replace every `client_visible: true` with `visibility: "client"` and every `client_visible: false` with `visibility: "server"`, and append:

```ts
describe("resolveForAudience", () => {
  const rows: ConfigRow[] = [
    { key: "ai_enabled", cohort: "everyone", value: true, visibility: "client" },
    { key: "ai_rate_limit_per_min", cohort: "everyone", value: 20, visibility: "server" },
    { key: "sync_enabled", cohort: "everyone", value: true, visibility: "public" },
  ];

  it("gives an anonymous caller only public keys", () => {
    expect(resolveForAudience(rows, ANON_CALLER, "public")).toEqual({ sync_enabled: true });
  });

  it("gives a signed-in caller public and client keys, never server ones", () => {
    const out = resolveForAudience(rows, ANON_CALLER, "client");
    expect(out).toEqual({ sync_enabled: true, ai_enabled: true });
    expect(out).not.toHaveProperty("ai_rate_limit_per_min");
  });

  it("takes visibility from the WINNING row, so a server override cannot be bypassed", () => {
    // A premium user matches the premium row; its 'server' visibility must win
    // over the more visible 'everyone' row it outranks. Otherwise a targeted
    // server-only override would leak to the client.
    const overridden: ConfigRow[] = [
      { key: "ai_enabled", cohort: "everyone", value: true, visibility: "client" },
      { key: "ai_enabled", cohort: "premium", value: false, visibility: "server" },
    ];
    const premium = { premium: true, alpha: false, allowlistKeys: new Set<string>() };
    expect(resolveForAudience(overridden, premium, "client")).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run supabase/functions/_shared/appConfigResolve.test.ts
```

Expected: FAIL — `Cannot find module './appConfigResolve'`.

- [ ] **Step 3: Create the resolver**

```bash
git mv supabase/functions/_shared/aiConfigResolve.ts supabase/functions/_shared/appConfigResolve.ts
git rm supabase/functions/_shared/aiConfigResolve.test.ts
```

In `appConfigResolve.ts`, change the header comment's first line to ``Cohort resolution for `app_config` rows.``, replace the `ConfigRow` type, delete `resolveClientConfig`, and append:

```ts
export type Visibility = "server" | "client" | "public";

export type ConfigRow = {
  key: string;
  cohort: Cohort;
  value: unknown;
  visibility: Visibility;
};

/**
 * A caller with no identity. Only `everyone` rows can match, which is exactly
 * the anonymous case — there is no cohort to resolve without a user id.
 */
export const ANON_CALLER: CallerCohorts = {
  premium: false,
  alpha: false,
  allowlistKeys: new Set<string>(),
};

const VISIBILITY_RANK: Readonly<Record<Visibility, number>> = {
  server: 0,
  client: 1,
  public: 2,
};

/**
 * The subset of resolved config a given audience may see.
 *
 * Visibility is taken from the WINNING row, not from any row — so a
 * server-only override at a high-precedence cohort cannot be bypassed by a
 * more visible row at a lower-precedence one.
 */
export function resolveForAudience(
  rows: ConfigRow[],
  caller: CallerCohorts,
  audience: "client" | "public",
): Record<string, unknown> {
  const floor = VISIBILITY_RANK[audience];
  const out: Record<string, unknown> = {};
  for (const [key, row] of winningRows(rows, caller)) {
    if (VISIBILITY_RANK[row.visibility] >= floor) out[key] = row.value;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run supabase/functions/_shared/appConfigResolve.test.ts
```

Expected: PASS.

- [ ] **Step 5: Update the three importers**

`supabase/functions/ai-proxy/index.ts`: import path → `../_shared/appConfigResolve.ts`; `:114` `.from("ai_config")` → `.from("app_config")` selecting `key, cohort, value, visibility`; `:133` `.from("ai_config_allowlist")` → `.from("app_config_allowlist")`.

`supabase/functions/get-ai-config/index.ts`: same import and table changes, and `resolveClientConfig(rows, caller)` → `resolveForAudience(rows, caller, "client")`. (Task 3 reduces this file to an alias; this step only keeps it compiling.)

`src/core/aiConfig.test.ts:124-125`: path string → `supabase/functions/_shared/appConfigResolve.ts`, label → `_shared/appConfigResolve.ts`.

`src/core/aiConfig.test.ts:71-91`: the seed-key test reads the old migration and its boolean `client_visible` column. Update both:

```ts
    const migrationSource = readFileSync(
      "supabase/migrations/20260804010000_app_config.sql",
      "utf8",
    );
    // Every seeded value row looks like:
    //   ('key', 'cohort', <value>::jsonb, '<visibility>')
    const rowMatches = [
      ...migrationSource.matchAll(
        /\(\s*'([a-z_]+)'\s*,\s*'[a-z]+'\s*,\s*[^,]+::jsonb\s*,\s*'(server|client|public)'\s*\)/g,
      ),
    ];
    expect(rowMatches.length, "no seed rows matched in the migration file").toBeGreaterThan(0);

    const clientVisibleSeedKeys = rowMatches
      .filter(([, , visibility]) => visibility === "client")
      .map(([, key]) => key);
```

- [ ] **Step 6: Run the whole suite**

```bash
npx vitest run
```

Expected: PASS. If the seed-key test fails with "migration seeds X as client_visible, but src/core/aiConfig.ts does not read it", the migration and client parser genuinely disagree — fix the mismatch, do not relax the test.

- [ ] **Step 7: Commit**

```bash
git add -A supabase/functions src/core/aiConfig.test.ts
git commit -m "refactor(config): rename shared resolver and replace client_visible with visibility"
```

---

### Task 3: `get-app-config` Edge Function

**Files:**
- Create: `supabase/functions/_shared/appConfigResponse.ts` + `.test.ts`
- Create: `supabase/functions/get-app-config/index.ts`
- Modify: `supabase/functions/get-ai-config/index.ts` (becomes an alias)
- Modify: `supabase/config.toml`

**Interfaces:**
- Consumes: `resolveForAudience`, `ANON_CALLER`, `ConfigRow` (Task 2).
- Produces: `GET|POST /functions/v1/get-app-config` → `{ config: Record<string, unknown>, ttlSeconds: number }`; helpers `TTL_SECONDS`, `cacheHeaders(audience)`, `splitLegacyShape(config)`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/appConfigResponse.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { cacheHeaders, splitLegacyShape, TTL_SECONDS } from "./appConfigResponse";

describe("cacheHeaders", () => {
  it("lets a CDN cache the anonymous payload", () => {
    // The anonymous response is identical for every install, which is the
    // entire reason it takes no request parameters.
    expect(cacheHeaders("public")["Cache-Control"]).toBe("public, max-age=300, s-maxage=300");
  });

  it("never stores a per-user payload", () => {
    expect(cacheHeaders("client")["Cache-Control"]).toBe("private, no-store");
  });
});

describe("TTL_SECONDS", () => {
  it("refreshes anonymous config faster than per-user config", () => {
    // Public keys carry the incident switches, so they must land sooner.
    expect(TTL_SECONDS.public).toBe(300);
    expect(TTL_SECONDS.client).toBe(900);
  });
});

describe("splitLegacyShape", () => {
  it("reproduces the old {flags, limits} split for get-ai-config callers", () => {
    expect(splitLegacyShape({ ai_enabled: true, ai_max_image_bytes: 4000000 })).toEqual({
      flags: { ai_enabled: true },
      limits: { ai_max_image_bytes: 4000000 },
    });
  });

  it("drops values that are neither boolean nor number", () => {
    // The old client had no way to parse anything else; shipping one would be
    // a shape the installed build cannot read.
    expect(splitLegacyShape({ a: "x", b: null, c: true })).toEqual({
      flags: { c: true },
      limits: {},
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run supabase/functions/_shared/appConfigResponse.test.ts
```

Expected: FAIL — `Cannot find module './appConfigResponse'`.

- [ ] **Step 3: Write the helpers**

Create `supabase/functions/_shared/appConfigResponse.ts`:

```ts
/**
 * Response shaping for `get-app-config`. Dependency-free (no `Deno.*`, no
 * `npm:` imports) so Vitest can run it under Node — the same constraint
 * `appConfigResolve.ts` follows. All I/O lives in the calling `index.ts`.
 */

export type Audience = "client" | "public";

/**
 * How long a client may keep a payload. Public config refreshes five times
 * faster because it carries the incident switches (maintenance, sync,
 * min-version) where minutes matter.
 */
export const TTL_SECONDS: Readonly<Record<Audience, number>> = {
  public: 300,
  client: 900,
};

export function cacheHeaders(audience: Audience): Record<string, string> {
  // The anonymous payload is byte-identical for every caller, so a CDN can
  // serve it and the database sees ~one query per max-age regardless of
  // traffic. The authenticated payload is per-user and must never be stored.
  return audience === "public"
    ? { "Cache-Control": "public, max-age=300, s-maxage=300" }
    : { "Cache-Control": "private, no-store" };
}

/**
 * The pre-generalization `{flags, limits}` shape, split by JS type.
 *
 * Only used by the `get-ai-config` alias. Anything that is neither a boolean
 * nor a number is dropped rather than shipped, because the installed clients
 * that call that endpoint have no way to parse it.
 */
export function splitLegacyShape(config: Record<string, unknown>): {
  flags: Record<string, boolean>;
  limits: Record<string, number>;
} {
  const flags: Record<string, boolean> = {};
  const limits: Record<string, number> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "boolean") flags[key] = value;
    else if (typeof value === "number") limits[key] = value;
  }
  return { flags, limits };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run supabase/functions/_shared/appConfigResponse.test.ts
```

Expected: PASS.

- [ ] **Step 5: Write the endpoint**

Create `supabase/functions/get-app-config/index.ts`:

```ts
// Returns the caller's resolved config.
//
// JWT is OPTIONAL (verify_jwt = false in config.toml; auth is checked by hand
// below). Anonymous callers get `public` keys only, from a payload identical
// for every install and therefore CDN-cacheable. Authenticated callers
// additionally get `client` keys, resolved against their cohort.
//
// The request takes NO parameters, deliberately. Sending platform or app
// version would multiply cache keys, and client-asserted attributes are
// spoofable — a server that branches on a claimed version can be told any
// version. Instead the server ships the data (`min_supported_version`,
// `locale_region_map`) and the client performs the comparison it is already
// qualified to make.
//
// `server`-visibility keys — prompts, model ids, rate limits — cannot reach
// here at all: `resolveForAudience` filters them out before serialization.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the platform.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  ANON_CALLER,
  resolveForAudience,
  type CallerCohorts,
  type ConfigRow,
} from "../_shared/appConfigResolve.ts";
import { cacheHeaders, TTL_SECONDS } from "../_shared/appConfigResponse.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

const CONFIG_SELECT = "key, cohort, value, visibility";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  const admin = createClient(url, serviceKey);
  const auth = req.headers.get("Authorization");

  // ── Anonymous ─────────────────────────────────────────────────────────
  if (!auth?.startsWith("Bearer ")) {
    const rows = await admin.from("app_config").select(CONFIG_SELECT);
    if (rows.error) {
      // 503, never a 200. A 200 saying "no restrictions apply" is
      // indistinguishable from a healthy response, so it would be CDN-cached
      // and would permanently clobber a correctly-cached `false`. The client
      // must be able to tell "nothing restricts you" from "I could not find
      // out".
      console.warn("app_config_read_failed", rows.error.message);
      return jsonResponse(503, { error: "config_unavailable" });
    }
    const config = resolveForAudience((rows.data ?? []) as ConfigRow[], ANON_CALLER, "public");
    return jsonResponse(200, { config, ttlSeconds: TTL_SECONDS.public }, cacheHeaders("public"));
  }

  // ── Authenticated ─────────────────────────────────────────────────────
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(401, { error: "unauthorized" });
  const userId = userData.user.id;

  const [entitlement, profile, allowlist, rows] = await Promise.all([
    admin.rpc("tally_has_active_entitlement", { p_user_id: userId }),
    admin.from("profiles").select("is_alpha").eq("id", userId).maybeSingle(),
    admin.from("app_config_allowlist").select("key").eq("user_id", userId),
    admin.from("app_config").select(CONFIG_SELECT),
  ]);

  if (rows.error) {
    console.warn("app_config_read_failed", rows.error.message);
    return jsonResponse(503, { error: "config_unavailable" });
  }

  if (entitlement.error) console.warn("entitlement_check_failed", entitlement.error.message);
  if (profile.error) console.warn("app_config_alpha_read_failed", profile.error.message);
  if (allowlist.error) console.warn("app_config_allowlist_read_failed", allowlist.error.message);

  // Entitlement and alpha status pick the caller's cohort. An error reading
  // either means we cannot tell which cohort this caller is in, so resolving
  // anyway would silently fall through to `everyone` — exactly the
  // client/server disagreement the shared resolver exists to prevent. Fail
  // closed rather than serve a wrong-cohort answer.
  //
  // The allowlist is different: it is purely additive, so failing to read it
  // only means "not specially targeted". Warn and continue.
  if (entitlement.error || profile.error) {
    return jsonResponse(503, { error: "config_unavailable" });
  }

  const caller: CallerCohorts = {
    premium: entitlement.data === true,
    alpha: profile.data?.is_alpha === true,
    allowlistKeys: new Set((allowlist.data ?? []).map((r: { key: string }) => r.key)),
  };

  const config = resolveForAudience((rows.data ?? []) as ConfigRow[], caller, "client");
  return jsonResponse(200, { config, ttlSeconds: TTL_SECONDS.client }, cacheHeaders("client"));
});
```

- [ ] **Step 6: Reduce `get-ai-config` to a delegating alias**

Keep its existing auth check, its `AI_KILL_SWITCH` break-glass, and its cohort resolution. Replace only the flags/limits construction at `:136-145` with `splitLegacyShape(...)`, and prepend:

```ts
// DEPRECATED — delegating alias for `get-app-config`, kept for one release.
//
// Evidence says no released build calls this: the repo has no git tags,
// changelogs/1.2.0.release-checklist.md has zero checked boxes, and
// docs/superpowers/plans/2026-08-04-ai-remote-config-followups.md records that
// no Edge Function has ever served a request.
//
// It ships anyway because the failure mode is asymmetric. If a released build
// DID call this and the slug disappeared, those installs get a 404 ->
// fetchAiConfig returns null -> they keep bundled defaults permanently, which
// means the AI kill switch is silently lost for exactly the users an incident
// needs to reach. The fail-open design that makes a stale client safe is what
// makes this failure invisible.
//
// DELETE once a build containing get-app-config is confirmed shipped.
```

Its success response becomes:

```ts
  const config = resolveForAudience((rows.data ?? []) as ConfigRow[], caller, "client");
  return jsonResponse(200, { ...splitLegacyShape(config), ttlSeconds: 900 });
```

- [ ] **Step 7: Register the function**

Append to `supabase/config.toml`:

```toml
# Returns the caller's resolved config. JWT is OPTIONAL and checked by hand
# inside the function: anonymous callers get `public` keys only (first-run
# locale, plan prices, incident switches), signed-in callers additionally get
# `client` keys resolved against their cohort. Same posture as ad-reward,
# which also verifies by hand.
[functions.get-app-config]
verify_jwt = false
```

- [ ] **Step 8: Verify both endpoints against the local stack**

```bash
supabase functions serve get-app-config &
curl -s http://127.0.0.1:54321/functions/v1/get-app-config | jq
```

Expected: `200` with `sync_enabled` present and **no** `ai_` key at all.

```bash
curl -s http://127.0.0.1:54321/functions/v1/get-app-config \
  -H "Authorization: Bearer $TOKEN" | jq
```

Expected: `200` containing `ai_enabled` and `sync_enabled`, and **no** `ai_rate_limit_per_min`, `ai_model`, `ai_receipt_model`, or any `*_prompt` key. A leak here is a spec violation, not a cosmetic bug.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions supabase/config.toml
git commit -m "feat(config): serve resolved config to anonymous and signed-in callers"
```

---

### Task 4: Client config parsing and typed accessors

**Files:**
- Create: `src/core/remoteConfig.ts` + `.test.ts`
- Modify: `src/core/aiConfig.ts`, `src/core/aiConfig.test.ts`

**Interfaces:**
- Consumes: the `{ config, ttlSeconds }` response (Task 3).
- Produces:
  - `type RemoteConfig = Readonly<Record<string, unknown>>`
  - `EMPTY_REMOTE_CONFIG: RemoteConfig`
  - `parseRemoteConfig(input: unknown): RemoteConfig`
  - `configBool(c, key, fallback: boolean): boolean`
  - `configInt(c, key, fallback: number): number`
  - `configString(c, key, fallback: string): string`
  - `configLocaleMap(c, key): Record<string, string> | null`
  - `aiConfigFrom(c: RemoteConfig): AiConfig` — replaces `parseAiConfig`

- [ ] **Step 1: Write the failing test**

Create `src/core/remoteConfig.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  configBool,
  configInt,
  configLocaleMap,
  configString,
  EMPTY_REMOTE_CONFIG,
  parseRemoteConfig,
} from "./remoteConfig";

describe("parseRemoteConfig", () => {
  it("reads a well-formed payload", () => {
    const c = parseRemoteConfig({ config: { ai_enabled: false, sync_enabled: true } });
    expect(configBool(c, "ai_enabled", true)).toBe(false);
    expect(configBool(c, "sync_enabled", false)).toBe(true);
  });

  it("returns empty for junk input rather than throwing", () => {
    expect(parseRemoteConfig(null)).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig("nope")).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig({})).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig({ config: 5 })).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig({ config: [] })).toEqual(EMPTY_REMOTE_CONFIG);
  });
});

describe("typed accessors fall back PER KEY", () => {
  it("does not let one malformed value poison its neighbours", () => {
    // The point of this test: a single server-side typo must cost exactly one
    // key, not silently revert every flag.
    const c = parseRemoteConfig({
      config: { ai_enabled: false, ai_action_transcribe: "yes", ai_max_image_bytes: -1 },
    });
    expect(configBool(c, "ai_enabled", true)).toBe(false); // good key honoured
    expect(configBool(c, "ai_action_transcribe", true)).toBe(true); // bad key defaulted
    expect(configInt(c, "ai_max_image_bytes", 4_000_000)).toBe(4_000_000);
  });

  it("rejects non-integers and non-positive integers", () => {
    const c = parseRemoteConfig({ config: { a: 1.5, b: 0, d: 7 } });
    expect(configInt(c, "a", 99)).toBe(99);
    expect(configInt(c, "b", 99)).toBe(99);
    expect(configInt(c, "d", 99)).toBe(7);
  });

  it("treats a blank string as absent", () => {
    const c = parseRemoteConfig({ config: { a: "   ", b: "x" } });
    expect(configString(c, "a", "fallback")).toBe("fallback");
    expect(configString(c, "b", "fallback")).toBe("x");
  });

  it("returns null for an absent or malformed locale map", () => {
    const c = parseRemoteConfig({
      config: { good: { en: "$5" }, bad: { en: 5 }, worse: "nope", empty: {} },
    });
    expect(configLocaleMap(c, "good")).toEqual({ en: "$5" });
    expect(configLocaleMap(c, "bad")).toBeNull();
    expect(configLocaleMap(c, "worse")).toBeNull();
    expect(configLocaleMap(c, "empty")).toBeNull();
    expect(configLocaleMap(c, "missing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/core/remoteConfig.test.ts
```

Expected: FAIL — `Cannot find module './remoteConfig'`.

- [ ] **Step 3: Write the module**

Create `src/core/remoteConfig.ts`:

```ts
/**
 * The client's view of remote config: an untyped bag of resolved values plus
 * typed accessors that apply a fallback per key.
 *
 * Pure — no I/O — so the parsing rules are testable in isolation, the same
 * split `aiAccess.ts` and `aiCreditCost.ts` already use. The fetch lives in
 * `remoteConfigClient.ts`.
 *
 * Fallback happens at READ time, not parse time. That is what makes one
 * malformed value cost exactly one key: there is no eager shaping step that
 * could discard a whole payload because of a single bad entry.
 *
 * Everything fails open. `ai-proxy` enforces the same flags server-side, so a
 * stale or empty client config is never a bypass — it shows a button and gets
 * a clean 403 back.
 */

export type RemoteConfig = Readonly<Record<string, unknown>>;

export const EMPTY_REMOTE_CONFIG: RemoteConfig = Object.freeze({});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse a `get-app-config` response. Never throws. */
export function parseRemoteConfig(input: unknown): RemoteConfig {
  if (!isRecord(input) || !isRecord(input.config)) return EMPTY_REMOTE_CONFIG;
  return Object.freeze({ ...input.config });
}

export function configBool(c: RemoteConfig, key: string, fallback: boolean): boolean {
  const v = c[key];
  return typeof v === "boolean" ? v : fallback;
}

export function configInt(c: RemoteConfig, key: string, fallback: number): number {
  const v = c[key];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback;
}

export function configString(c: RemoteConfig, key: string, fallback: string): string {
  const v = c[key];
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

/**
 * A `{ locale: text }` map, or null when absent or malformed.
 *
 * An empty object counts as absent: a map with no locales cannot answer any
 * lookup, so callers should take their bundled fallback rather than hold an
 * object that always misses.
 */
export function configLocaleMap(c: RemoteConfig, key: string): Record<string, string> | null {
  const v = c[key];
  if (!isRecord(v)) return null;
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(v)) {
    if (typeof text !== "string") return null;
    out[locale] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/core/remoteConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Rewrite `aiConfig.ts` as a selector**

Keep `AiConfig`, `DEFAULT_AI_CONFIG`, `ACTION_FLAG_KEYS`, and `isActionEnabled` exactly as they are, including every comment. Delete `parseAiConfig`, `isRecord`, `boolAt`, and `intAt`, and add:

```ts
import { configBool, configInt, type RemoteConfig } from "./remoteConfig";

/** Project the general config bag onto the AI-specific shape. */
export function aiConfigFrom(c: RemoteConfig): AiConfig {
  const actions = {} as Record<AiProxyAction, boolean>;
  for (const action of Object.keys(ACTION_FLAG_KEYS) as AiProxyAction[]) {
    actions[action] = configBool(c, ACTION_FLAG_KEYS[action], DEFAULT_AI_CONFIG.actions[action]);
  }
  return {
    aiEnabled: configBool(c, "ai_enabled", DEFAULT_AI_CONFIG.aiEnabled),
    actions,
    maxImageBytes: configInt(c, "ai_max_image_bytes", DEFAULT_AI_CONFIG.maxImageBytes),
    maxAudioSeconds: configInt(c, "ai_max_audio_seconds", DEFAULT_AI_CONFIG.maxAudioSeconds),
  };
}
```

- [ ] **Step 6: Update `aiConfig.test.ts`**

Replace each `parseAiConfig({ flags: {...}, limits: {...} })` with `aiConfigFrom(parseRemoteConfig({ config: {...} }))`, merging the two objects into one. For example:

```ts
    const masterOff = aiConfigFrom(parseRemoteConfig({ config: { ai_enabled: false } }));
```

Delete the `returns defaults for junk input` case — junk handling now lives in `remoteConfig.test.ts`, and asserting it twice leaves two places to update. Keep `client-visible seed keys` and `action flag keys` as they are, apart from the paths already fixed in Task 2.

- [ ] **Step 7: Run the whole suite**

```bash
npx vitest run && npx tsc --noEmit
```

Expected: PASS, no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/core
git commit -m "feat(config): add client config parser with per-key typed fallback"
```

---

### Task 5: Client fetch and cache accessor

**Files:**
- Create: `src/core/remoteConfigClient.ts`
- Delete: `src/core/aiConfigClient.ts`

**Interfaces:**
- Consumes: `parseRemoteConfig`, `EMPTY_REMOTE_CONFIG` (Task 4); the endpoint (Task 3).
- Produces: `REMOTE_CONFIG_CACHE_KEY`, `REMOTE_CONFIG_USER_KEY`, `fetchRemoteConfig(): Promise<RemoteConfig | null>`, `readCachedRemoteConfig(): Promise<RemoteConfig>`.

- [ ] **Step 1: Write the module**

No unit test here: the file is pure I/O against Supabase, `fetch`, and AsyncStorage, none of which this codebase mocks — its predecessor `aiConfigClient.ts` had no test either. Its logic lives in Task 4, which is tested. Behaviour is verified on device in Task 6.

Create `src/core/remoteConfigClient.ts`:

```ts
/**
 * Fetches the caller's resolved config from the `get-app-config` Edge
 * Function, and exposes the on-disk cache to callers that need it before React
 * context is available.
 *
 * Mirrors the transport in `aiProxy.ts` — same base URL, same session JWT,
 * same network guard — so config and proxy calls behave identically offline
 * and under the app's network rules.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";
import { guardNetworkCall } from "./networkGuard";
import { EMPTY_REMOTE_CONFIG, parseRemoteConfig, type RemoteConfig } from "./remoteConfig";

export const REMOTE_CONFIG_CACHE_KEY = "@tally:remote_config";
export const REMOTE_CONFIG_USER_KEY = "@tally:remote_config_user";

/**
 * The caller's config, or `null` when it could not be fetched — not
 * configured, offline, or a server error.
 *
 * `null` means "keep what you have", never "disable everything". The caller
 * holds a cache or the bundled defaults, and the server enforces regardless,
 * so failing open here cannot become a bypass.
 *
 * Unlike the AI-only predecessor, this does NOT require a session. A
 * signed-out caller gets the `public` keys, which is the whole point — first
 * launch and the logged-out Plans screen both need config.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  const urlBase = getSyncUrl();
  if (!urlBase) return null;

  let token: string | undefined;
  const supabase = createTallySupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }

  const url = `${urlBase.replace(/\/$/, "")}/functions/v1/get-app-config`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await guardNetworkCall(() => fetch(url, { method: "POST", headers }));
    if (!res.ok) return null;
    return parseRemoteConfig(await res.json());
  } catch {
    // Offline, DNS failure, guard rejection. The caller keeps its cache.
    return null;
  }
}

/**
 * The last cached config, or empty.
 *
 * Exported because `LocaleProvider` needs it at mount, before
 * `RemoteConfigProvider` has hydrated — reading the same key directly avoids a
 * provider-ordering dependency. Both go through this one function so the cache
 * key is never duplicated.
 */
export async function readCachedRemoteConfig(): Promise<RemoteConfig> {
  try {
    const raw = await AsyncStorage.getItem(REMOTE_CONFIG_CACHE_KEY);
    return raw ? parseRemoteConfig({ config: JSON.parse(raw) }) : EMPTY_REMOTE_CONFIG;
  } catch {
    // Unreadable or corrupt cache — bundled defaults apply.
    return EMPTY_REMOTE_CONFIG;
  }
}
```

- [ ] **Step 2: Delete the predecessor**

```bash
git rm src/core/aiConfigClient.ts
```

- [ ] **Step 3: Check what broke**

```bash
npx tsc --noEmit
```

Expected: errors **only** in `src/premium/AiConfigContext.tsx`, which imports the deleted module. Task 6 replaces that file. Any other error means something else depended on `aiConfigClient` — investigate before continuing.

- [ ] **Step 4: Commit**

```bash
git add -A src/core
git commit -m "feat(config): fetch config with an optional session, and expose the cache"
```

---

### Task 6: `RemoteConfigProvider`

**Files:**
- Create: `src/premium/RemoteConfigContext.tsx`
- Delete: `src/premium/AiConfigContext.tsx`
- Modify: `App.tsx:50,503`

**Interfaces:**
- Consumes: `fetchRemoteConfig`, `readCachedRemoteConfig` (Task 5); `aiConfigFrom`, `isActionEnabled` (Task 4).
- Produces:
  - `RemoteConfigProvider({ children }: { children: ReactNode })`
  - `useRemoteConfig(): { config: RemoteConfig; refresh: () => void }`
  - `useAiConfig(): { config: AiConfig; isActionEnabled: (a: AiProxyAction) => boolean; refresh: () => void }` — **signature unchanged**, so `AiReceiptScreen` and every other consumer keeps working untouched.

- [ ] **Step 1: Create the provider**

Copy `src/premium/AiConfigContext.tsx` to `src/premium/RemoteConfigContext.tsx` and make exactly these changes. **Do not rewrite the identity, staleness, or cache logic.** The `userIdRef` render-time assignment, the `pendingRefetch` drain, and the session `loading` guard each fix a specific defect found in review; their explanatory comments must be carried over verbatim, including the `startTransition` / `useDeferredValue` / Suspense warning.

1. Rename the component to `RemoteConfigProvider` and the context to `RemoteConfigContext`.
2. State becomes `useState<RemoteConfig>(EMPTY_REMOTE_CONFIG)`; `DEFAULT_AI_CONFIG` is no longer referenced in this file. The two places that reset to defaults now reset to `EMPTY_REMOTE_CONFIG`.
3. Cache keys become `REMOTE_CONFIG_CACHE_KEY` / `REMOTE_CONFIG_USER_KEY`, imported from `remoteConfigClient.ts`.
4. `fetchAiConfig()` → `fetchRemoteConfig()`. The cache read `setConfig(parseAiConfig(JSON.parse(raw)))` becomes `setConfig(await readCachedRemoteConfig())`, dropping the local `getItem` and its try/catch — `readCachedRemoteConfig` already handles both.
5. **Remove the signed-out guard.** The identity effect currently ends with `if (!cancelled && userId) refresh();`. Drop the `userId` condition:

```tsx
      // Anonymous callers get the `public` keys — first-run locale, plan
      // prices, and the incident switches. The AI-only predecessor skipped the
      // fetch when signed out; that gap is exactly what this replaces.
      if (!cancelled) refresh();
```

6. Replace the exported hook with these two:

```tsx
export function useRemoteConfig(): RemoteConfigValue {
  const v = useContext(RemoteConfigContext);
  if (!v) throw new Error("useRemoteConfig requires RemoteConfigProvider");
  return v;
}

/**
 * The AI-shaped view of remote config. Signature is unchanged from the
 * previous `AiConfigContext`, so its consumers need no edits.
 */
export function useAiConfig(): {
  config: AiConfig;
  isActionEnabled: (action: AiProxyAction) => boolean;
  refresh: () => void;
} {
  const { config, refresh } = useRemoteConfig();
  const ai = useMemo(() => aiConfigFrom(config), [config]);
  return useMemo(
    () => ({ config: ai, isActionEnabled: (a: AiProxyAction) => isActionEnabled(ai, a), refresh }),
    [ai, refresh],
  );
}
```

- [ ] **Step 2: Swap the provider in `App.tsx`**

Change the import at `:50` to `import { RemoteConfigProvider } from "./src/premium/RemoteConfigContext";`, and the element at `:503` from `<AiConfigProvider>` to `<RemoteConfigProvider>` with its matching closing tag. **The position in the tree is unchanged** — above `DatabaseProvider` and `LocaleProvider`, which is what lets Task 7 read the cache without a provider-ordering dependency.

```bash
git rm src/premium/AiConfigContext.tsx
```

- [ ] **Step 3: Verify it compiles and the suite passes**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src App.tsx
```

Expected: clean. Any remaining reference to `AiConfigProvider` or `parseAiConfig` is a missed call site.

- [ ] **Step 4: Verify on a device — this gate has demonstrated yield**

Two of the three defects found in the previous feature's final review were ones a real app run surfaces immediately. Confirm each:

- Exactly **one** `get-app-config` request on cold start while **signed out**, and it succeeds.
- Sign in: a **second** request fires, and its response contains the `ai_*` keys the anonymous one did not.
- Cold start as a returning signed-in user **reads the cache** — no flash of default state before the network resolves.
- Sign out and back in as a **different** user: a fresh request, and no trace of the previous user's cohort config in AsyncStorage.
- Set `('ai_action_transcribe','everyone',false,'client')`; after the TTL, voice input reports unavailable while receipt scanning still works.

- [ ] **Step 5: Commit**

```bash
git add -A src App.tsx
git commit -m "feat(config): replace AiConfigProvider with a general RemoteConfigProvider"
```

---

### Task 7: Remote default language, and the explicit-choice fix

**Files:**
- Modify: `src/i18n/localeDefaults.ts`, `src/i18n/localeDefaults.test.ts`
- Modify: `src/data/tallyRepo.ts:1554+`
- Modify: `src/db/tallyMigrations.ts`
- Modify: `src/i18n/LocaleContext.tsx:81-88,104-129,161-201`

**Interfaces:**
- Consumes: `readCachedRemoteConfig` (Task 5); `configString`, `configLocaleMap` (Task 4).
- Produces: `SETTINGS_KEYS.localeUserChosen`; `type LocaleOverrides = { regionMap?: Record<string,string>; fallback?: string }`; `resolveAppLocale(locales, overrides?: LocaleOverrides): AppLocale`.

- [ ] **Step 1: Write the failing test**

Append to `src/i18n/localeDefaults.test.ts`:

```ts
describe("resolveAppLocale with remote overrides", () => {
  const en = [{ languageCode: "en", languageTag: "en-US", regionCode: "US" }];
  const enInTurkey = [{ languageCode: "en", languageTag: "en-TR", regionCode: "TR" }];
  const farsiPhone = [{ languageCode: "fa", languageTag: "fa-IR", regionCode: "IR" }];

  it("uses a remote region map to reach a region the bundle does not know", () => {
    expect(resolveAppLocale(enInTurkey)).toBe("en"); // bundled: TR is unmapped
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "fa" } })).toBe("fa");
  });

  it("uses a remote fallback when neither language nor region matches", () => {
    expect(resolveAppLocale(en, { fallback: "es" })).toBe("es");
  });

  it("never lets a remote value override an explicit device language", () => {
    // A Farsi phone stays Farsi no matter what the server says. Language is
    // the strongest preference a user expresses without opening settings.
    expect(resolveAppLocale(farsiPhone, { regionMap: { IR: "es" }, fallback: "en" })).toBe("fa");
  });

  it("ignores remote values that are not locales we ship", () => {
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "de" } })).toBe("en");
    expect(resolveAppLocale(en, { fallback: "de" })).toBe("en");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/i18n/localeDefaults.test.ts
```

Expected: FAIL — `resolveAppLocale` accepts one argument.

- [ ] **Step 3: Extend `resolveAppLocale`**

In `src/i18n/localeDefaults.ts`, add above `resolveAppLocale` and replace its body:

```ts
const SHIPPED_LOCALES: readonly string[] = ["en", "fa", "es"];

function asAppLocale(v: string | undefined | null): AppLocale | null {
  const s = v?.trim().toLowerCase();
  return s && SHIPPED_LOCALES.includes(s) ? (s as AppLocale) : null;
}

export type LocaleOverrides = {
  /** Remote `locale_region_map`. Replaces the bundled map when present. */
  regionMap?: Record<string, string>;
  /** Remote `locale_default`. Replaces "en" as the last resort. */
  fallback?: string;
};

/**
 * Initial app language for a first-run device, from the OS's ordered list of
 * preferred locales. An explicit Farsi/Spanish phone language always wins;
 * only when none of the preferred languages is one we ship does region decide.
 * So an English phone in Iran gets Farsi, but a Farsi phone in Spain stays
 * Farsi.
 *
 * Remote overrides can extend the region map and change the last-resort
 * default, but can never outrank the device's own language — that is the
 * strongest preference a user expresses without opening a settings screen, and
 * a server should not overrule it.
 *
 * Unknown locale codes in remote values are ignored rather than trusted; the
 * shipped set is what the bundle can actually render.
 */
export function resolveAppLocale(
  locales: readonly DeviceLocale[],
  overrides?: LocaleOverrides,
): AppLocale {
  for (const loc of locales) {
    const byLanguage = appLocaleForLanguage(loc.languageCode ?? loc.languageTag);
    if (byLanguage) return byLanguage;
  }

  const regionMap = overrides?.regionMap ?? APP_LOCALE_BY_REGION;
  for (const loc of locales) {
    const region = regionOf(loc);
    const byRegion = region ? asAppLocale(regionMap[region]) : null;
    if (byRegion) return byRegion;
  }

  return asAppLocale(overrides?.fallback) ?? "en";
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/i18n/localeDefaults.test.ts
```

Expected: PASS, including the four pre-existing cases.

- [ ] **Step 5: Add the explicit-choice marker**

In `src/data/tallyRepo.ts`, inside `SETTINGS_KEYS` immediately after `locale`:

```ts
  /**
   * `"1"` = the user picked a language themselves, in Account settings.
   *
   * `locale` alone cannot answer this. LocaleContext writes it during the
   * first-run RTL bootstrap and again when sign-in hydrates cloud prefs —
   * neither of which is a user choice. Without this marker a first-run
   * Farsi-device user looks like they chose Farsi, and a remote default would
   * silently skip exactly the users it targets.
   */
  localeUserChosen: "locale_user_chosen",
```

- [ ] **Step 6: Consume remote config in `LocaleProvider`**

In `src/i18n/LocaleContext.tsx`, change `deviceDefaultLocale` at `:81-88`:

```tsx
function deviceDefaultLocale(overrides?: LocaleOverrides): AppLocale {
  try {
    return resolveAppLocale(Localization.getLocales(), overrides);
  } catch {
    /* getLocales can throw on web fallbacks — ship the safe default */
    return "en";
  }
}
```

In the mount effect at `:104-129`, replace the locale resolution with:

```tsx
        const raw = await getSetting(db, SETTINGS_KEYS.locale);
        const chosen = (await getSetting(db, SETTINGS_KEYS.localeUserChosen))?.trim() === "1";
        const v = raw?.trim() ?? null;

        // An explicit choice always wins. Otherwise consult the cached remote
        // config: `locale_region_map` and `locale_default` let us add a region
        // or change the first-run default without a store release.
        //
        // CACHED, not fetched. This runs behind the hydration spinner and must
        // not wait on the network — so a remote change lands on the NEXT
        // launch. That is deliberate: crossing the Farsi boundary requires a
        // native reload (`crossesAppRtlBoundary`), and rebooting the app from a
        // background config refresh is not acceptable.
        let l: AppLocale;
        if (chosen && (v === "en" || v === "fa" || v === "es")) {
          l = v;
        } else {
          const remote = await readCachedRemoteConfig();
          l = deviceDefaultLocale({
            regionMap: configLocaleMap(remote, "locale_region_map") ?? undefined,
            fallback: configString(remote, "locale_default", ""),
          });
        }
```

The rest of the effect — the `nativeLayoutDirectionMismatch` branch and its `setSetting` writes — is unchanged. Those writes are exactly why the `localeUserChosen` marker is needed, and they must keep happening.

In `setLocale`, inside the existing `if (!repairingRtlOnly)` block at `:174-183`, alongside `setSetting(db, SETTINGS_KEYS.locale, l)`:

```tsx
        await setSetting(db, SETTINGS_KEYS.localeUserChosen, "1");
```

- [ ] **Step 7: Backfill existing installs**

Append to the migration list in `src/db/tallyMigrations.ts`, following the file's existing pattern:

```sql
-- Anyone already running the app with a persisted locale is treated as having
-- chosen it. Conservative on purpose: remote config must never retroactively
-- change the language of someone already using the app. Remote defaults reach
-- genuinely new installs only.
insert or replace into app_settings (key, value)
select 'locale_user_chosen', '1'
 where exists (select 1 from app_settings where key = 'locale');
```

- [ ] **Step 8: Verify**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src
```

On a device, with `('locale_region_map','everyone','{"TR":"fa"}','public')` set: a fresh install on an English phone in region TR shows English on first launch and Farsi on the second. An existing install with a chosen language is unaffected by either.

- [ ] **Step 9: Commit**

```bash
git add -A src
git commit -m "feat(config): resolve first-run locale from remote config

Also fixes LocaleContext treating the first-run RTL bootstrap write as a
user language choice, which would have made remote defaults skip exactly
the users they target."
```

---

### Task 8: Remote plan prices

**Files:**
- Create: `src/core/planPrices.ts` + `.test.ts`
- Modify: `src/screens/PlansScreen.tsx:154-185`

**Interfaces:**
- Consumes: `configLocaleMap` (Task 4); `useRemoteConfig` (Task 6); `PassType` from `src/premium/passes.ts`.
- Produces: `planPriceFrom(config: RemoteConfig, type: PassType, locale: string, fallback: string): string`.

- [ ] **Step 1: Write the failing test**

Create `src/core/planPrices.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planPriceFrom } from "./planPrices";
import { parseRemoteConfig } from "./remoteConfig";

const config = parseRemoteConfig({
  config: { plans_price_night: { en: "$4.99", fa: "۹۹٬۰۰۰ تومان" } },
});

describe("planPriceFrom", () => {
  it("returns the remote price for the current locale", () => {
    expect(planPriceFrom(config, "night", "en", "BUNDLED")).toBe("$4.99");
    expect(planPriceFrom(config, "night", "fa", "BUNDLED")).toBe("۹۹٬۰۰۰ تومان");
  });

  it("falls back to the bundled string when the locale is missing", () => {
    // Never show another locale's price: a Spanish user seeing a dollar amount
    // they will not be charged is worse than the bundled string.
    expect(planPriceFrom(config, "night", "es", "BUNDLED")).toBe("BUNDLED");
  });

  it("falls back when the key is absent or malformed", () => {
    expect(planPriceFrom(config, "trip", "en", "BUNDLED")).toBe("BUNDLED");
    const bad = parseRemoteConfig({ config: { plans_price_trip: { en: 5 } } });
    expect(planPriceFrom(bad, "trip", "en", "BUNDLED")).toBe("BUNDLED");
  });

  it("treats a blank remote price as absent", () => {
    const blank = parseRemoteConfig({ config: { plans_price_night: { en: "  " } } });
    expect(planPriceFrom(blank, "night", "en", "BUNDLED")).toBe("BUNDLED");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/core/planPrices.test.ts
```

Expected: FAIL — `Cannot find module './planPrices'`.

- [ ] **Step 3: Write the module**

Create `src/core/planPrices.ts`:

```ts
/**
 * Displayed pass prices, remotely overridable.
 *
 * DISPLAY ONLY. What a user is actually charged is owned by App Store Connect
 * and Cafe Bazaar via the SKUs in `premiumConfig.ts`; nothing here changes an
 * amount. That makes this a SECOND source of truth, and a drift means the user
 * sees one number and is charged another — a refund and store-review problem,
 * not merely a bug. `docs/ops/remote-config.md` lists each key beside the SKU
 * it must match.
 *
 * Falls back to the bundled translation string rather than to another locale's
 * price: showing a Spanish user a dollar amount they will not be charged is
 * worse than showing the shipped string.
 */
import type { PassType } from "../premium/passes";
import { configLocaleMap, type RemoteConfig } from "./remoteConfig";

const PRICE_KEYS: Readonly<Record<PassType, string>> = {
  night: "plans_price_night",
  trip: "plans_price_trip",
  explorer: "plans_price_explorer",
};

export function planPriceFrom(
  config: RemoteConfig,
  type: PassType,
  locale: string,
  fallback: string,
): string {
  const remote = configLocaleMap(config, PRICE_KEYS[type])?.[locale];
  return typeof remote === "string" && remote.trim() !== "" ? remote : fallback;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/core/planPrices.test.ts
```

Expected: PASS.

- [ ] **Step 5: Wire `PlansScreen`**

Add `const { config: remote } = useRemoteConfig();` alongside the existing hooks. In the `cards` memo at `:154-185`, change each `price` field and add `remote` and `locale` to the dependency array:

```tsx
        price: planPriceFrom(remote, "night", locale, t("plans.nightPrice")),
```

...and the same for `trip` and `explorer`. Leave `extendPrice`, `name`, `duration`, and `tagline` on translations — extension prices are not in the day-one key set.

- [ ] **Step 6: Verify**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src
```

On a device, with `('plans_price_night','everyone','{"en":"$9.99"}','public')` set: the Night Out card shows `$9.99` in English and the bundled string in Farsi.

- [ ] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(config): read displayed plan prices from remote config"
```

---

### Task 9: Force-update, maintenance banner, and sync switch

**Files:**
- Create: `src/core/appVersion.ts` + `.test.ts`
- Create: `src/components/MaintenanceBanner.tsx`, `src/screens/ForceUpdateScreen.tsx`
- Modify: `src/observability/sentry.ts:42-45`, `src/i18n/translations.ts`, `App.tsx`

**Interfaces:**
- Consumes: `configString`, `configLocaleMap`, `configBool` (Task 4); `useRemoteConfig` (Task 6).
- Produces: `currentAppVersion(): string | null`; `isBelowMinimum(current: string | null, minimum: string): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/core/appVersion.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isBelowMinimum } from "./appVersion";

describe("isBelowMinimum", () => {
  it("blocks a client below the floor", () => {
    expect(isBelowMinimum("1.1.0", "1.2.0")).toBe(true);
    expect(isBelowMinimum("1.2.0", "1.2.1")).toBe(true);
    expect(isBelowMinimum("0.9.9", "1.0.0")).toBe(true);
  });

  it("allows a client at or above the floor", () => {
    expect(isBelowMinimum("1.2.0", "1.2.0")).toBe(false);
    expect(isBelowMinimum("1.10.0", "1.9.0")).toBe(false); // numeric, not lexical
    expect(isBelowMinimum("2.0.0", "1.99.99")).toBe(false);
  });

  it("FAILS OPEN on anything it cannot parse", () => {
    // A force-update screen that fires wrongly bricks the app for the entire
    // install base, which is strictly worse than anything it prevents. Every
    // uncertain case must resolve to "do not block".
    expect(isBelowMinimum(null, "1.2.0")).toBe(false);
    expect(isBelowMinimum("unknown", "1.2.0")).toBe(false);
    expect(isBelowMinimum("1.2.0", "")).toBe(false);
    expect(isBelowMinimum("1.2.0", "not-a-version")).toBe(false);
    expect(isBelowMinimum("1.2", "1.2.0")).toBe(false);
    expect(isBelowMinimum("1.2.0-beta", "1.2.0")).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npx vitest run src/core/appVersion.test.ts
```

Expected: FAIL — `Cannot find module './appVersion'`.

- [ ] **Step 3: Write the module**

Create `src/core/appVersion.ts`:

```ts
/**
 * The running app's version, and the force-update comparison.
 *
 * `currentAppVersion` is the resolution `src/observability/sentry.ts` already
 * performed inline; it lives here now so the two cannot drift.
 */
import Constants from "expo-constants";

/** The build's `version` from app.json, or null when it cannot be determined. */
export function currentAppVersion(): string | null {
  const v =
    Constants.expoConfig?.version ??
    (Constants.manifest2 as { extra?: { expoClient?: { version?: string } } } | undefined)?.extra
      ?.expoClient?.version;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Strict `major.minor.patch` of digits. Anything else is unparseable. */
function parse(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * True only when we are CERTAIN the client is below the floor.
 *
 * Fails open on every uncertain input — unknown local version, malformed
 * remote value, prerelease suffix. A force-update screen that fires wrongly
 * bricks the app for the entire install base, which is strictly worse than
 * whatever shipping an old client costs.
 */
export function isBelowMinimum(current: string | null, minimum: string): boolean {
  if (!current) return false;
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npx vitest run src/core/appVersion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Use it in `sentry.ts`**

Replace the inline resolution at `:42-45` with:

```ts
  const release = currentAppVersion() ?? "unknown";
```

importing from `../core/appVersion`. Then:

```bash
npx vitest run src/observability/sentry.test.ts
```

Expected: PASS — the existing `expo-constants` mock at `:35` covers it. If the mock shape no longer matches, update the mock, not the helper.

- [ ] **Step 6: Add the translation keys**

Add a `forceUpdate` group to all three locales in `src/i18n/translations.ts` with `title`, `body`, `cta`. English: `"Update required"`; `"This version of Tally is no longer supported. Update to keep using it."`; `"Update"`. Translate for `fa` and `es` following the file's existing tone.

- [ ] **Step 7: Add the gate and banner**

`ForceUpdateScreen.tsx` renders `t("forceUpdate.title")`, `t("forceUpdate.body")`, and a button opening the store URL. `MaintenanceBanner.tsx` takes `{ message: string | null }` and returns `null` when the message is null or blank.

In `App.tsx`, inside the tree **below** `RemoteConfigProvider` and `LocaleProvider` so both config and `t` are available:

```tsx
  const { config } = useRemoteConfig();
  const { t, locale } = useLocale();

  // Fails open: an absent or malformed `min_supported_version` never blocks.
  if (isBelowMinimum(currentAppVersion(), configString(config, "min_supported_version", ""))) {
    return <ForceUpdateScreen />;
  }

  const maintenance = configLocaleMap(config, "maintenance_message")?.[locale] ?? null;
```

Render `<MaintenanceBanner message={maintenance} />` above the navigator.

- [ ] **Step 8: Honour `sync_enabled`**

In the sync entry point, bail when `configBool(config, "sync_enabled", true)` is false. The default is `true`, so absent config leaves sync exactly as it is today.

- [ ] **Step 9: Verify**

```bash
npx vitest run && npx tsc --noEmit && npx eslint src App.tsx
```

On a device: set `('min_supported_version','everyone','"99.0.0"','public')` and confirm the update screen appears; set it to `'"not-a-version"'` and confirm the app runs normally. Set `maintenance_message` and confirm the banner appears in the current locale only.

- [ ] **Step 10: Commit**

```bash
git add -A src App.tsx
git commit -m "feat(config): add force-update gate, maintenance banner, and sync switch"
```

---

### Task 10: Operator runbook and the inherited verification gate

**Files:**
- Create: `supabase/scripts/set-app-config.sql`
- Delete: `supabase/scripts/set-ai-flag.sql`
- Create: `docs/ops/remote-config.md`

- [ ] **Step 1: Close the JSONB round-trip gate — this blocks everything**

Gate 1 of `docs/superpowers/plans/2026-08-04-ai-remote-config-followups.md` has never been run. If a JSONB `false` arrives from supabase-js as the **string** `"false"`, `configBool` returns its `true` fallback and **every kill switch silently does nothing**, while all unit tests stay green because they feed JS booleans directly.

```bash
supabase db reset
psql "$DB_URL" -c "set local app.config_actor = 'gate-1';
                   update app_config set value = 'false'::jsonb
                    where key = 'ai_enabled' and cohort = 'everyone';"
supabase functions serve ai-proxy
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"transcribe"}' -w '\n%{http_code}\n'
```

Expected: `{"error":"ai_disabled"}` and `403`. **Anything else — especially a normal response — means the round-trip assumption is wrong and none of this work may ship.** If it fails, add an explicit `jsonb_typeof` coercion in the resolver and re-run before continuing.

- [ ] **Step 2: Verify a disabled action spends no credit**

```bash
psql "$DB_URL" -c "select balance from ai_credit_balances where user_id = '<uid>';"
psql "$DB_URL" -c "set local app.config_actor = 'gate-2';
                   update app_config set value = 'false'::jsonb
                    where key = 'ai_action_parse_receipt' and cohort = 'everyone';"
sleep 31   # ai-proxy caches config rows for 30s
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"parse-receipt","imageBase64":"x"}' -w '\n%{http_code}\n'
psql "$DB_URL" -c "select balance from ai_credit_balances where user_id = '<uid>';"
```

Expected: `403 action_disabled` and an **unchanged** balance.

Also confirm the break-glass still works: restart the function with `AI_KILL_SWITCH=1` and verify every call returns `403 ai_disabled` even with all table rows enabled.

- [ ] **Step 3: Write the operator recipes**

Create `supabase/scripts/set-app-config.sql` by adapting `set-ai-flag.sql`. Every recipe opens with `set local app.config_actor = '<your name>';`.

Carry over the **KILL EVERYWHERE** recipe verbatim: resolution is first-match-wins over `allowlist → alpha → premium → everyone`, so setting `('ai_enabled','everyone',false)` has **no effect** on users covered by an `ai_enabled` row at a more specific cohort. Read it before an incident, not during one.

Add recipes for: set a price, set the maintenance message, raise the minimum version, disable sync, and read the audit trail for a key.

```bash
git rm supabase/scripts/set-ai-flag.sql
```

- [ ] **Step 4: Write the runbook**

Create `docs/ops/remote-config.md` covering:
- the visibility model and the invariant (`public` only if a hostile client lying costs nothing);
- the `app.config_actor` convention and what happens when it is omitted;
- the cohort-precedence footgun, with a pointer to the KILL EVERYWHERE recipe;
- a **price-to-SKU table** pairing each `plans_price_*` key with its `EXPO_PUBLIC_*_PASS_ID`, stating plainly that changing a store price without changing the key means users see one number and are charged another;
- that a locale change lands on the next launch, not immediately, and why.

- [ ] **Step 5: Commit**

```bash
git add -A supabase/scripts docs/ops
git commit -m "docs(config): add operator recipes and remote config runbook"
```

---

## Self-review

**Spec coverage:** data model → Task 1; resolver and visibility → 2; endpoint, anonymous mode, alias, failure handling → 3; client parse → 4; fetch and cache → 5; provider → 6; locale and the `localeUserChosen` defect → 7; prices → 8; force-update, maintenance, sync → 9; runbook, price-to-SKU drift mitigation, and the inherited gate → 10.

**Type consistency:** `RemoteConfig` (Task 4) is consumed under that name by Tasks 5–9. `configBool` / `configInt` deliberately exist twice — `_shared/appConfigResolve.ts` operates on a `Map` for the server, `src/core/remoteConfig.ts` on a frozen object for the client — and are never imported across that boundary. `configStr` (server) and `configString` (client) differ for the same reason. Do **not** "unify" them: Deno cannot import from `src/`, which is why the duplication exists at all, and `aiConfig.test.ts` is the guard that keeps the two copies honest.

**Deliberate deviations from the spec:**
- The spec's day-one key list includes `plans_price_*_extend`. Task 8 wires only the three base prices; `extendPrice` stays on translations. Adding them is three registry rows and three lines in the `cards` memo — deferred, not dropped.
- `remoteConfigClient.ts` has no unit test (Task 5 Step 1 explains why). Its predecessor had none, its logic is covered by Task 4, and its behaviour is verified on device in Task 6.

**Carried forward, not covered by any task:** `ai_action_classify_category` still has no client-side consumer — unchanged from the previous feature's known gap and listed as a follow-up in the spec.
