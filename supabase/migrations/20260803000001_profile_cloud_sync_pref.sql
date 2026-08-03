-- Account-level default for the cloud-sync toggle.
--
-- The per-device preference lives in local SQLite (`app_settings`,
-- key `cloud_sync_user_enabled`) and stays authoritative for the device it
-- was set on — a user can keep sync on for their phone and off on a shared
-- laptop. This column is only the *default* a device inherits when it has
-- never made an explicit choice, so a fresh install signing in to an
-- existing account starts syncing without hunting for the toggle.
--
-- NULL means the account has never expressed a preference.
--
-- The grants are required, not decorative: `20260502000000_lock_profiles_
-- entitlements.sql` revoked table-wide INSERT/UPDATE from `authenticated`
-- and re-granted only named columns. Column grants are additive, so this
-- widens that set without disturbing it. Without them, client writes to
-- this column fail with "permission denied for table profiles".

alter table public.profiles
  add column if not exists cloud_sync_enabled boolean;

grant insert (cloud_sync_enabled) on public.profiles to authenticated;
grant update (cloud_sync_enabled) on public.profiles to authenticated;
