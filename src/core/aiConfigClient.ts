/**
 * Fetches the caller's resolved AI config from the `get-ai-config` Edge
 * Function. Mirrors the transport in `aiProxy.ts` — same base URL, same
 * session JWT, same network guard — so config and proxy calls behave
 * identically offline and under the app's network rules.
 */
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";
import { type AiConfig, aiConfigFrom } from "./aiConfig";
import { parseRemoteConfig } from "./remoteConfig";
import { guardNetworkCall } from "./networkGuard";

/**
 * Returns the caller's config, or `null` when it could not be fetched —
 * not configured, signed out, offline, or a server error.
 *
 * `null` means "keep what you have" rather than "disable AI". The caller
 * holds a cache or the bundled defaults; the proxy enforces regardless, so
 * failing open here cannot become a bypass.
 */
export async function fetchAiConfig(): Promise<AiConfig | null> {
  const urlBase = getSyncUrl();
  if (!urlBase) return null;

  const supabase = createTallySupabaseClient();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  // Signed-out callers have no cohort, so there is nothing to resolve. They
  // keep the bundled defaults; AI is gated behind sign-in anyway.
  if (!token) return null;

  const url = `${urlBase.replace(/\/$/, "")}/functions/v1/get-ai-config`;
  try {
    const res = await guardNetworkCall(() =>
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }),
    );
    if (!res.ok) return null;
    return aiConfigFrom(parseRemoteConfig(await res.json()));
  } catch {
    // Offline, DNS failure, guard rejection. The caller keeps its cache.
    return null;
  }
}
