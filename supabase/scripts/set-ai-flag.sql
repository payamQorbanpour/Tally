-- Change an AI config value. Run from the Supabase SQL editor.
-- Follows the same "edit the placeholders, then run" shape as
-- grant-reviewer-ai-access.sql.
--
-- ═══════════════════════════════════════════════════════════════════════
-- == KILL EVERYWHERE (incident response — read this before you set     ==
-- == 'ai_enabled'/'everyone' to false and walk away) ==
-- ═══════════════════════════════════════════════════════════════════════
-- Resolution is first-match-wins per key, in precedence order
-- allowlist > alpha > premium > everyone (see aiConfigResolve.ts). That
-- means an `ai_enabled` row at 'everyone' is only the DEFAULT — any user
-- covered by a higher-precedence `ai_enabled` row (premium / alpha /
-- allowlist) keeps whatever THAT row says, completely ignoring the
-- 'everyone' row you just changed. Setting 'everyone' to false while a
-- premium 'ai_enabled' = true row still exists does NOT kill AI for
-- premium users — it just looks like it did, because the trailing SELECT
-- below will show the 'everyone' row you expect.
--
-- To actually kill AI for every cohort, delete the higher-precedence rows
-- first, THEN force 'everyone' to false. Uncomment and run this block:
--
-- delete from public.ai_config
--   where key = 'ai_enabled' and cohort <> 'everyone';
--
-- insert into public.ai_config (key, cohort, value, client_visible)
-- values ('ai_enabled', 'everyone', 'false'::jsonb, true)
-- on conflict (key, cohort) do update
--   set value = excluded.value,
--       client_visible = excluded.client_visible,
--       updated_at = now();
--
-- Swap 'ai_enabled' for a specific 'ai_action_*' key to kill just one
-- action everywhere instead of the whole feature.
-- ═══════════════════════════════════════════════════════════════════════
--
-- Examples:
--   kill voice input for everyone:
--     key 'ai_action_transcribe', cohort 'everyone', value 'false'
--   enable a new action for alpha testers only:
--     key 'ai_action_parse_description', cohort 'alpha', value 'true'
--   raise the rate limit for premium users:
--     key 'ai_rate_limit_per_min', cohort 'premium', value '60'
--
-- `value` is JSONB: booleans are true/false, numbers are bare, strings need
-- double quotes ('"gpt-4o-mini"').

insert into public.ai_config (key, cohort, value, client_visible)
values (
  'ai_action_transcribe',   -- <<< key
  'everyone',               -- <<< cohort: everyone | premium | alpha | allowlist
  'false'::jsonb,           -- <<< value
  true                      -- <<< client_visible: false for models/prompts/rate limits
)
on conflict (key, cohort) do update
  set value = excluded.value,
      client_visible = excluded.client_visible,
      updated_at = now();

-- Add a user to an allowlist-cohort key:
-- insert into public.ai_config_allowlist (key, user_id)
-- values ('ai_action_transcribe', '00000000-0000-0000-0000-000000000000')
-- on conflict do nothing;

select key, cohort, value, client_visible, updated_at
  from public.ai_config
 order by key, cohort;
