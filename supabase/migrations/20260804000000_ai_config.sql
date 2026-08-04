-- Remote config for the AI section — kill switches, cohort rollout, and
-- runtime tuning of limits/models/prompts.
--
-- Rows are keyed by (key, cohort). Resolution picks the most specific
-- matching cohort: allowlist > alpha > premium > everyone. A key with only
-- an `everyone` row behaves globally.
--
-- Clients never read these tables directly. `get-ai-config` returns only
-- `client_visible` keys, and `ai-proxy` enforces from the same rows with the
-- service-role key. A client that could write here could re-enable a killed
-- feature or raise its own rate limit, which is the whole threat model —
-- same posture as ai_credit_balances in 20260801000000_ai_credits.sql.

create table if not exists public.ai_config (
  key            text        not null,
  cohort         text        not null default 'everyone'
                   check (cohort in ('everyone', 'premium', 'alpha', 'allowlist')),
  value          jsonb       not null,
  -- Prompts and provider params must never reach the shipped bundle. An
  -- explicit column rather than a naming convention, so the client/server
  -- boundary is auditable in one query.
  client_visible boolean     not null default false,
  updated_at     timestamptz not null default now(),
  primary key (key, cohort),
  -- Kill switches must fail CLOSED (AI off) on a malformed value, not open.
  -- `configBool` (both client and server) treats anything that isn't a JSON
  -- boolean as "absent" and falls back to `true` — so a value stored as the
  -- JSON STRING '"false"' (jsonb_typeof = 'string') would leave AI ON
  -- instead of OFF. Constrain every `ai_enabled` / `ai_action_*` row to an
  -- actual JSON boolean so that mistake can't be written in the first place.
  constraint ai_config_switch_is_boolean check (
    (key <> 'ai_enabled' and key not like 'ai_action_%')
    or jsonb_typeof(value) = 'boolean'
  )
);

create table if not exists public.ai_config_allowlist (
  key     text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (key, user_id)
);

create index if not exists ai_config_allowlist_user_idx
  on public.ai_config_allowlist (user_id);

alter table public.ai_config            enable row level security;
alter table public.ai_config_allowlist  enable row level security;

-- No policies are defined on purpose. RLS with zero policies denies every
-- anon/authenticated request. The service-role key bypasses RLS, which is
-- how the Edge Functions read these rows.
revoke all on public.ai_config           from anon, authenticated;
revoke all on public.ai_config_allowlist from anon, authenticated;

-- ─────────────────────────── Seed ───────────────────────────
-- Every key at its CURRENT effective behaviour, so applying this migration
-- changes nothing observable. Numeric defaults mirror the ai-proxy env
-- fallbacks (AI_RATE_LIMIT_PER_MIN=20, AI_RATE_LIMIT_TRANSCRIBE_PER_MIN=10)
-- and the client's existing hardcoded thresholds: 4_000_000 base64 chars in
-- `downscaleReceiptImage.ts:37`. Do NOT "round up" to 4 MiB (4194304) — that
-- would silently change the downscale threshold and break the no-op property.
--
-- Provider params (models, prompts) are intentionally NOT seeded: absent
-- means "fall back to the Deno.env value", which is exactly today's
-- behaviour. Seeding them would freeze the current secret values into the
-- table and silently break `supabase secrets set`.

insert into public.ai_config (key, cohort, value, client_visible) values
  ('ai_enabled',                   'everyone', 'true'::jsonb,    true),
  ('ai_action_parse_receipt',      'everyone', 'true'::jsonb,    true),
  ('ai_action_parse_description',  'everyone', 'true'::jsonb,    true),
  ('ai_action_classify_category',  'everyone', 'true'::jsonb,    true),
  ('ai_action_transcribe',         'everyone', 'true'::jsonb,    true),
  ('ai_max_image_bytes',           'everyone', '4000000'::jsonb, true),
  ('ai_max_audio_seconds',         'everyone', '120'::jsonb,     true),
  ('ai_rate_limit_per_min',        'everyone', '20'::jsonb,      false),
  ('ai_rate_limit_transcribe_per_min', 'everyone', '10'::jsonb,  false)
on conflict (key, cohort) do nothing;
