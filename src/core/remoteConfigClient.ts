/**
 * Fetches the caller's resolved config from the `get-app-config` Edge
 * Function, and exposes the on-disk cache to callers that need it before React
 * context is available.
 *
 * Mirrors the transport in `aiProxy.ts` — same base URL, same session JWT,
 * same network guard — so config and proxy calls behave identically offline
 * and under the app's network rules.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";
import { guardNetworkCall } from "./networkGuard";
import { EMPTY_REMOTE_CONFIG, parseRemoteConfig, type RemoteConfig } from "./remoteConfig";

export const REMOTE_CONFIG_CACHE_KEY = "@tally:remote_config";
export const REMOTE_CONFIG_USER_KEY = "@tally:remote_config_user";

/**
 * The caller's config, or `null` when it could not be fetched — not
 * configured, offline, or a server error.
 *
 * `null` means "keep what you have", never "disable everything". The caller
 * holds a cache or the bundled defaults, and the server enforces regardless,
 * so failing open here cannot become a bypass.
 *
 * Unlike the AI-only predecessor, this does NOT require a session. A
 * signed-out caller gets the `public` keys, which is the whole point — first
 * launch and the logged-out Plans screen both need config.
 */
export async function fetchRemoteConfig(): Promise<RemoteConfig | null> {
  const urlBase = getSyncUrl();
  if (!urlBase) return null;

  let token: string | undefined;
  const supabase = createTallySupabaseClient();
  if (supabase) {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  }

  const url = `${urlBase.replace(/\/$/, "")}/functions/v1/get-app-config`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const res = await guardNetworkCall(() => fetch(url, { method: "POST", headers }));
    if (!res.ok) return null;
    return parseRemoteConfig(await res.json());
  } catch {
    // Offline, DNS failure, guard rejection. The caller keeps its cache.
    return null;
  }
}

/**
 * The last cached config, or empty.
 *
 * Exported because `LocaleProvider` needs it at mount, before
 * `RemoteConfigProvider` has hydrated — reading the same key directly avoids a
 * provider-ordering dependency. Both go through this one function so the cache
 * key is never duplicated.
 */
export async function readCachedRemoteConfig(): Promise<RemoteConfig> {
  try {
    const raw = await AsyncStorage.getItem(REMOTE_CONFIG_CACHE_KEY);
    return raw ? parseRemoteConfig({ config: JSON.parse(raw) }) : EMPTY_REMOTE_CONFIG;
  } catch {
    // Unreadable or corrupt cache — bundled defaults apply.
    return EMPTY_REMOTE_CONFIG;
  }
}
