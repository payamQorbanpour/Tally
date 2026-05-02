-- Prevent client-side writes to `profiles.is_premium` / `profiles.is_alpha`.
--
-- The `profiles_update_own` RLS policy from the initial schema scopes UPDATEs
-- to the user's own row but does not restrict *which* columns they can write.
-- That left `is_premium` and `is_alpha` reachable from any signed-in client —
-- a loophole an earlier release exploited inadvertently and a malicious user
-- could exploit on purpose by issuing a single PostgREST PATCH to grant
-- themselves premium.
--
-- Postgres column-level privileges close that gap independently of RLS:
--   * Revoke INSERT/UPDATE on the full table from `authenticated`.
--   * Re-grant INSERT/UPDATE only on the safe (preference) columns.
--   * Server-side writers (the auto-seed trigger runs as table owner; the
--     `sync-apple-subscription` Edge Function uses the service-role key)
--     bypass column grants and continue to work.
--
-- SELECT and DELETE are unchanged — RLS already gates those.
-- Re-running this file is safe: revoke+grant is idempotent.

revoke insert on public.profiles from authenticated;
revoke update on public.profiles from authenticated;

grant insert (id, preferred_locale, default_currency, appearance, updated_at)
  on public.profiles to authenticated;

grant update (preferred_locale, default_currency, appearance, updated_at)
  on public.profiles to authenticated;
