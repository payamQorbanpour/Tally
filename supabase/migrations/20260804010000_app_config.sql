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

-- ─────────────────── Registry seed (21 keys) ───────────────────

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

-- ─────────────────────── Value seed (10 rows) ───────────────────
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

-- ─────────────── Retire the AI-only tables ───────────────────
-- Safe to drop rather than migrate: per
-- docs/superpowers/plans/2026-08-04-ai-remote-config-followups.md, no SQL in
-- that branch ever touched a database and no Edge Function ever served a
-- request, so there are no production rows.

drop table if exists public.ai_config_allowlist;
drop table if exists public.ai_config;
