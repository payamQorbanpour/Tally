-- Adds `onboarding_tour_enabled` to the app_config registry created by
-- 20260804010000_app_config.sql. First follow-up single-key addition to
-- that registry — mirrors the SHAPE of that migration's two insert blocks
-- (registry row, then seed row) since there is no prior "add one key"
-- migration to follow.
--
-- Gates only the in-app feature tour (`TourProvider` / `useAutoStartTour`
-- in src/providers/TourContext.tsx) — NOT the separate onboarding flow
-- (`OnboardingProvider`, SETTINGS_KEYS.onboardingDone). `public` because a
-- hostile client lying about this value costs nothing: it only affects
-- whether tooltips appear, never security or billing.
--
-- Seeded true at everyone, matching today's always-on behaviour exactly, so
-- applying this migration changes nothing observable.

insert into public.app_config_keys (key, value_type, max_visibility, description) values
  ('onboarding_tour_enabled', 'boolean', 'public',
   'False suppresses the first-run in-app feature tour (fab/ai/qr walkthrough). Does not affect the separate onboarding flow.')
on conflict (key) do nothing;

insert into public.app_config (key, cohort, value, visibility) values
  ('onboarding_tour_enabled', 'everyone', 'true'::jsonb, 'public')
on conflict (key, cohort) do nothing;
