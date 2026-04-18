/**
 * Configure Supabase (cloud sync) via `EXPO_PUBLIC_*` in `.env` (Expo) or the host’s env.
 *
 * Optional: set the fallbacks below for local dev; env vars win when set.
 * From the Supabase dashboard: Project name → (gear) Project settings → **API**:
 * *Project URL* and *anon* under **Project API keys** (the public, safe-for-client key).
 */
const trim = (v: string | undefined) => (v ? v.trim() : undefined);

const HARDCODED_SUPABASE_URL: string | null = "https://sveeidvyavmzafgktxfd.supabase.co";
/** Publishable/anon public key from Project settings → API (or legacy `eyJ...` anon). */
const HARDCODED_SUPABASE_ANON_KEY: string | null =
  "sb_publishable_ClrPhVdcrWIkUgTgGXOjAA_ved9dUB7";

export function isSupabaseSyncConfigured(): boolean {
  return Boolean(
    (trim(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? HARDCODED_SUPABASE_URL) &&
      (trim(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ?? HARDCODED_SUPABASE_ANON_KEY),
  );
}

/** @deprecated Use isSupabaseSyncConfigured */
export function isPowerSyncConfigured(): boolean {
  return isSupabaseSyncConfigured();
}

export function getSupabaseUrl(): string | null {
  return trim(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? HARDCODED_SUPABASE_URL ?? null;
}

export function getSupabaseAnonKey(): string | null {
  return (
    trim(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ?? HARDCODED_SUPABASE_ANON_KEY ?? null
  );
}

/**
 * @deprecated Prefer the in-app Account toggle. Kept for scripts that may check env.
 * Not required to enable sync — users choose in Settings.
 */
export function isSyncStreamEnabledByEnv(): boolean {
  const f = trim(process.env.EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC);
  return f === "1" || f === "true";
}

/** `EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC=0` or `EXPO_PUBLIC_SUPABASE_ENABLE_SYNC=0` forces all builds to stay offline. */
export function isCloudSyncDisabledByBuildEnv(): boolean {
  return (
    trim(process.env.EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC) === "0" ||
    trim(process.env.EXPO_PUBLIC_SUPABASE_ENABLE_SYNC) === "0"
  );
}
