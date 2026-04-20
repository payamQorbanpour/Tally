/**
 * Configure Supabase (cloud sync) from `EXPO_PUBLIC_*` at build time.
 * Copy `.env.example` to `.env` in the project root, or set the same keys in EAS/CI.
 *
 * From the Supabase dashboard: Project name → (gear) Project settings → **API**:
 * *Project URL* and *anon* under **Project API keys** (the public, safe-for-client key).
 */
const trim = (v: string | undefined) => (v ? v.trim() : undefined);

export function isSupabaseSyncConfigured(): boolean {
  return Boolean(getSupabaseUrl() && getSupabaseAnonKey());
}

/** @deprecated Use isSupabaseSyncConfigured */
export function isPowerSyncConfigured(): boolean {
  return isSupabaseSyncConfigured();
}

export function getSupabaseUrl(): string | null {
  return trim(process.env.EXPO_PUBLIC_SUPABASE_URL) ?? null;
}

export function getSupabaseAnonKey(): string | null {
  return trim(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) ?? null;
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
