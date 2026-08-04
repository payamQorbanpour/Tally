-- Change an app config value. Run from the Supabase SQL editor (or `psql`
-- against the project's DB_URL). Follows the same "edit the placeholders,
-- then run" shape as grant-reviewer-ai-access.sql.
--
-- This is the general-purpose successor to set-ai-flag.sql: the same
-- `app_config` table now serves AI flags, locale defaults, plan prices, the
-- maintenance banner, the force-update floor, and the sync switch. All of
-- them share the same resolution rule and the same audit trail, so one
-- script covers all of them.
--
-- Every recipe below opens with:
--     set local app.config_actor = '<your name>';
-- This is picked up by the `tally_app_config_validate` / `tally_app_config_audit`
-- triggers (20260804010000_app_config.sql) and recorded as `updated_by` /
-- `changed_by`. Every write happens as the service role, so `current_user`
-- is identical for every operator and records nothing useful — the session
-- variable is what makes the audit trail attributable to a person.
-- Omitting it does NOT block the write; it just degrades `updated_by` /
-- `changed_by` to `session_user` (the DB role), which is far less useful
-- during an incident post-mortem. Set it anyway.
--
-- `value` is JSONB: booleans are true/false, integers are bare numbers,
-- strings need double quotes ('"gpt-4o-mini"'), and locale_map keys
-- (plans_price_*, maintenance_message, locale_region_map) are JSON objects
-- of locale -> string, e.g. '{"en":"$4.99","fa":"۹۹٬۰۰۰ تومان"}'. The
-- `app_config_validate` trigger enforces the type declared in
-- `app_config_keys` and will reject a mismatched value at write time.
--
-- ═══════════════════════════════════════════════════════════════════════
-- == KILL EVERYWHERE (incident response — read this before you set     ==
-- == a switch to 'everyone' and walk away)                             ==
-- ═══════════════════════════════════════════════════════════════════════
-- Resolution is first-match-wins per key, in precedence order
-- allowlist > alpha > premium > everyone (see appConfigResolve.ts). That
-- means a row at 'everyone' is only the DEFAULT — any user covered by a
-- higher-precedence row for the SAME key (premium / alpha / allowlist)
-- keeps whatever THAT row says, completely ignoring the 'everyone' row you
-- just changed. Setting 'everyone' to false while a premium row for the
-- same key still says true does NOT kill the feature for premium users —
-- it just looks like it did, because the trailing SELECT below will show
-- the 'everyone' row you expect and nothing will look wrong.
--
-- To actually kill a key for every cohort, delete the higher-precedence
-- rows first, THEN force 'everyone' to the off value. Uncomment and run
-- this block on its own (shown for 'ai_enabled'; swap the key for any
-- other) — it is self-contained, including its own `set local`, so it is
-- safe to copy out and run alone during an incident:
--
-- set local app.config_actor = '<your name>';
--
-- delete from public.app_config
--   where key = 'ai_enabled' and cohort <> 'everyone';
--
-- insert into public.app_config (key, cohort, value, visibility)
-- values ('ai_enabled', 'everyone', 'false'::jsonb, 'client')
-- on conflict (key, cohort) do update
--   set value = excluded.value,
--       updated_at = now();
--
-- Swap 'ai_enabled' for 'ai_action_*' to kill just one AI action, for
-- 'sync_enabled' to stop cloud sync app-wide, etc. This works for any key
-- in app_config_keys, not just AI ones.
-- ═══════════════════════════════════════════════════════════════════════

-- ─────────────────────── Recipe: generic single-cohort write ───────────
-- Examples:
--   kill voice input for everyone:
--     key 'ai_action_transcribe', cohort 'everyone', value 'false'
--   enable a new AI action for alpha testers only:
--     key 'ai_action_parse_description', cohort 'alpha', value 'true'
--   raise the AI rate limit for premium users:
--     key 'ai_rate_limit_per_min', cohort 'premium', value '60'
--
-- `visibility` may not exceed the key's `max_visibility` in app_config_keys
-- (the trigger rejects an over-visible write) — when in doubt, use the same
-- visibility the seeded row already has (see the SELECT at the bottom).

set local app.config_actor = '<your name>';

insert into public.app_config (key, cohort, value, visibility)
values (
  'ai_action_transcribe',   -- <<< key
  'everyone',               -- <<< cohort: everyone | premium | alpha | allowlist
  'false'::jsonb,           -- <<< value
  'client'                  -- <<< visibility: server | client | public (must not exceed max_visibility)
)
on conflict (key, cohort) do update
  set value = excluded.value,
      visibility = excluded.visibility,
      updated_at = now();

-- Add a user to an allowlist-cohort key:
-- insert into public.app_config_allowlist (key, user_id)
-- values ('ai_action_transcribe', '00000000-0000-0000-0000-000000000000')
-- on conflict do nothing;

-- ─────────────────────── Recipe: set a displayed plan price ────────────
-- `plans_price_*` keys are `locale_map` (JSON object of locale -> display
-- string) and `max_visibility = 'public'` — this is DISPLAY TEXT ONLY. It
-- changes what the Plans screen shows; it does NOT change what the store
-- actually charges. See docs/ops/remote-config.md's price-to-SKU table
-- before touching this — changing the displayed price without also
-- changing the store listing price means the user sees one number and is
-- charged another.

set local app.config_actor = '<your name>';

insert into public.app_config (key, cohort, value, visibility)
values (
  'plans_price_night',      -- <<< key: plans_price_night | plans_price_trip | plans_price_explorer
  'everyone',
  '{"en":"$4.99","fa":"۹۹٬۰۰۰ تومان","es":"4,99 €"}'::jsonb,  -- <<< locale -> display string
  'public'
)
on conflict (key, cohort) do update
  set value = excluded.value,
      updated_at = now();

-- ─────────────────────── Recipe: set the maintenance banner ────────────
-- `maintenance_message` is a `locale_map`, `max_visibility = 'public'`,
-- non-blocking (see MaintenanceBanner.tsx). Absent or an empty string for
-- a locale means no banner for that locale. To clear the banner for all
-- locales, delete the row instead of setting empty strings:
--   delete from public.app_config where key = 'maintenance_message';

set local app.config_actor = '<your name>';

insert into public.app_config (key, cohort, value, visibility)
values (
  'maintenance_message',
  'everyone',
  '{"en":"Scheduled maintenance 02:00-03:00 UTC — sync may be delayed.","fa":"","es":""}'::jsonb, -- <<< locale -> message
  'public'
)
on conflict (key, cohort) do update
  set value = excluded.value,
      updated_at = now();

-- ─────────────────────── Recipe: raise the minimum supported version ───
-- `min_supported_version` is a `string`, `max_visibility = 'public'`. A
-- client whose bundled version is below this shows the blocking
-- ForceUpdateScreen (see appVersion.ts). Must be a bare semver
-- (`MAJOR.MINOR.PATCH`) — anything malformed or absent means "never
-- block" (fail-open by design). Raising this is disruptive: only do it for
-- a version with a genuine breaking change, not a routine bump.

set local app.config_actor = '<your name>';

insert into public.app_config (key, cohort, value, visibility)
values (
  'min_supported_version',
  'everyone',
  '"2.4.0"'::jsonb,   -- <<< bare semver string, quoted for JSONB
  'public'
)
on conflict (key, cohort) do update
  set value = excluded.value,
      updated_at = now();

-- ─────────────────────── Recipe: disable cloud sync app-wide ───────────
-- `sync_enabled` is a `boolean`, `max_visibility = 'public'`. False stops
-- both push and pull sync everywhere (DatabaseContext.tsx); local data
-- keeps working. Use this to take sync down during a backend incident
-- without needing a client release.

set local app.config_actor = '<your name>';

insert into public.app_config (key, cohort, value, visibility)
values (
  'sync_enabled',
  'everyone',
  'false'::jsonb,     -- <<< true to re-enable
  'public'
)
on conflict (key, cohort) do update
  set value = excluded.value,
      updated_at = now();

-- ─────────────────────── Recipe: read the audit trail for a key ────────
-- Every insert/update/delete on app_config is recorded in app_config_audit
-- with `changed_by` from app.config_actor (or session_user if it was never
-- set). Use this before an incident retro, or to find out who changed a
-- key and when. This recipe is read-only, so `set local` has no effect on
-- its own output — kept here anyway so every recipe in this file is
-- identically self-contained and copy-paste-safe.

set local app.config_actor = '<your name>';

select id, key, cohort, op, old_value, new_value, changed_at, changed_by
  from public.app_config_audit
 where key = 'ai_enabled'   -- <<< key to inspect
 order by changed_at desc
 limit 50;

-- ─────────────────────── Current state (run last) ───────────────────────

select key, cohort, value, visibility, updated_at, updated_by
  from public.app_config
 order by key, cohort;
