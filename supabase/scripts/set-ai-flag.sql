-- Change an AI config value. Run from the Supabase SQL editor.
-- Follows the same "edit the placeholders, then run" shape as
-- grant-reviewer-ai-access.sql.
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
