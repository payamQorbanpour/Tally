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

/** `EXPO_PUBLIC_SYNC_ENABLED=0` forces all builds to stay offline. */
export function isCloudSyncDisabledByBuildEnv(): boolean {
  return trim(process.env.EXPO_PUBLIC_SYNC_ENABLED) === "0";
}
