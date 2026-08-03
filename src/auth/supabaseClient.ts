import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Platform } from "react-native";
import { getSupabaseAuthStorage } from "./supabaseAuthStorage";
import { getSyncAnonKey, getSyncUrl } from "../sync/config";

let supabaseClientCache: SupabaseClient | null = null;
let supabaseClientCacheKey: string | null = null;

/**
 * Single Supabase client for auth + data sync. Persists the session: `localStorage` on web,
 * `@react-native-async-storage/async-storage` on iOS/Android (native module not available in browser).
 * Reuses one instance per (url, key) so GoTrue does not warn about multiple clients.
 */
export function createTallySupabaseClient(): SupabaseClient | null {
  const url = getSyncUrl();
  const key = getSyncAnonKey();
  if (!url || !key) {
    supabaseClientCache = null;
    supabaseClientCacheKey = null;
    return null;
  }
  const k = `${url}\0${key}`;
  if (supabaseClientCache && supabaseClientCacheKey === k) return supabaseClientCache;
  supabaseClientCache = createClient(url, key, {
    auth: {
      storage: getSupabaseAuthStorage(),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === "web",
      // PKCE, not the supabase-js default of `implicit`. Under `implicit` the
      // OAuth round-trip hands the access *and* refresh token back in the URL
      // fragment of `tally://auth/callback`, and a custom scheme is not
      // exclusive on Android — any installed app may declare it and receive
      // that redirect, which is a silent account takeover. PKCE returns a
      // single-use `?code=` instead, worthless without the verifier this
      // client keeps in its own storage. See RFC 8252 §8.1.
      flowType: "pkce",
    },
  });
  supabaseClientCacheKey = k;
  return supabaseClientCache;
}
