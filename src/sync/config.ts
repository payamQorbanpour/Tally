/**
 * Configure PowerSync + Supabase via `EXPO_PUBLIC_*` in `.env` (Expo) or the host’s env.
 */
const trim = (v: string | undefined) => (v ? v.trim() : undefined);

export function isPowerSyncConfigured(): boolean {
  return Boolean(trim(process.env.EXPO_PUBLIC_POWERSYNC_URL));
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

/** `EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC=0` forces all builds to stay offline (no `connect()`). */
export function isCloudSyncDisabledByBuildEnv(): boolean {
  return trim(process.env.EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC) === "0";
}
