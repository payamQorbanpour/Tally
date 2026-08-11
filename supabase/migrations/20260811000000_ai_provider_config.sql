-- Registers the four keys that make AI provider order, the Gemini model, and
-- the completion-token ceiling changeable from SQL, extending the registry
-- created by 20260804010000_app_config.sql. Follows the shape of
-- 20260805000000_onboarding_tour_config.sql, minus its seed block.
--
-- NO values are seeded into app_config, deliberately. Absent means "use the
-- code default" for all four, and the shipped defaults already carry the fix
-- these keys exist to make repeatable without a deploy — see
-- docs/superpowers/specs/2026-08-11-ai-provider-config-design.md. Seeding
-- would freeze today's provider list into the table, so a later change to the
-- code default would silently do nothing.
--
-- All four are 'server'. A client that could read the provider order learns
-- little, but one that could read a token ceiling learns exactly what to stay
-- under — same posture as ai_rate_limit_per_min.

insert into public.app_config_keys (key, value_type, max_visibility, description) values
  ('ai_provider_order_text', 'string', 'server',
   'Comma-separated upstream order for text-only AI calls, e.g. "groq,gemini". Unknown names are ignored. Unset = groq,gemini.'),
  ('ai_provider_order_image', 'string', 'server',
   'Comma-separated upstream order for AI calls carrying images, e.g. "gemini,groq". Unknown names are ignored. Unset = gemini,groq.'),
  ('ai_gemini_model', 'string', 'server',
   'Override for GEMINI_MODEL. Unset = use the env value.'),
  ('ai_max_completion_tokens', 'integer', 'server',
   'Ceiling clamped over every action''s completion-token reservation. Groq bills the reservation against its per-minute token limit, so lowering this is the lever when calls fail with 413 rate_limit_exceeded. Unset = per-action defaults.')
on conflict (key) do nothing;
