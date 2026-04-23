/**
 * Configure the cloud sync backend from `EXPO_PUBLIC_*` at build time.
 * Copy `.env.example` to `.env` in the project root, or set the same keys in EAS/CI.
 *
 * The app currently uses Supabase under the hood, so paste the Supabase
 * Project URL and anon key — but the env is named generically so the
 * provider is swappable without changing every call site.
 */
const trim = (v: string | undefined) => (v ? v.trim() : undefined);

export function isSyncConfigured(): boolean {
  return Boolean(getSyncUrl() && getSyncAnonKey());
}

export function getSyncUrl(): string | null {
  return trim(process.env.EXPO_PUBLIC_SYNC_URL) ?? null;
}

export function getSyncAnonKey(): string | null {
  return trim(process.env.EXPO_PUBLIC_SYNC_ANON_KEY) ?? null;
}

/**
 * Cloud sync is opt-in: `EXPO_PUBLIC_SYNC_ENABLED` must be `"1"` to enable it.
 * Anything else (unset, `"0"`, `"false"`, …) keeps builds offline even when
 * `EXPO_PUBLIC_SYNC_URL` / `EXPO_PUBLIC_SYNC_ANON_KEY` are configured.
 */
export function isCloudSyncEnabledByBuildEnv(): boolean {
  return trim(process.env.EXPO_PUBLIC_SYNC_ENABLED) === "1";
}

export function isCloudSyncDisabledByBuildEnv(): boolean {
  return !isCloudSyncEnabledByBuildEnv();
}
