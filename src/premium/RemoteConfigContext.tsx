/**
 * Holds the app's current remote config: reads a cached copy at start,
 * refreshes in the background, and re-resolves whenever the signed-in user
 * changes.
 *
 * Never blocks first render. The UI always has some config — the cache, or
 * the bundled defaults — because `ai-proxy` enforces the same flags
 * server-side. A stale client shows a button and receives a clean 403.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { EMPTY_REMOTE_CONFIG, type RemoteConfig } from "../core/remoteConfig";
import { aiConfigFrom, isActionEnabled, type AiConfig } from "../core/aiConfig";
import type { AiProxyAction } from "../core/aiCreditCost";
import {
  fetchRemoteConfig,
  readCachedRemoteConfig,
  REMOTE_CONFIG_CACHE_KEY,
  REMOTE_CONFIG_USER_KEY,
} from "../core/remoteConfigClient";

/**
 * Foreground-refresh threshold used only until the server tells us its own.
 *
 * `get-app-config` returns a `ttlSeconds` that differs by audience — 300s for
 * anonymous callers (whose payload carries the incident switches) and 900s for
 * signed-in ones (see `_shared/appConfigResponse.ts`). The real value from the
 * last successful fetch is what the foreground check below uses; this constant
 * is the fallback for before that first fetch lands, or when the server sent no
 * usable TTL. It matches the slower (signed-in) case deliberately: guessing too
 * long merely delays a refresh, while guessing too short would have every
 * install polling harder than the server asked for.
 */
const DEFAULT_TTL_MS = 15 * 60 * 1000;

type RemoteConfigValue = {
  config: RemoteConfig;
  refresh: () => void;
};

const RemoteConfigContext = createContext<RemoteConfigValue | null>(null);

export function RemoteConfigProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSupabaseSession();
  const userId = session?.user?.id ?? null;

  const [config, setConfig] = useState<RemoteConfig>(EMPTY_REMOTE_CONFIG);
  const lastFetchedAt = useRef(0);
  // The server's own `ttlSeconds` (in ms) from the last successful fetch, or
  // null when we have not had one yet / it sent none. A ref rather than state
  // because nothing renders from it — only the foreground check reads it, and
  // making it state would re-run the AppState effect on every fetch.
  const ttlMs = useRef<number | null>(null);
  const inFlight = useRef(false);
  // A refresh() that arrives while one is already in flight would otherwise
  // be a silent no-op — most importantly the identity effect's call for a
  // *new* user right after a stale fetch for the *old* user was kicked off.
  // Recorded here and drained in the `finally` block below so that identity
  // never goes without a fetch of its own.
  const pendingRefetch = useRef(false);
  // Mirrors `userId` on every render. `refresh()` snapshots this at the
  // moment it starts and compares again once its fetch resolves — a plain
  // closure over `userId` would go stale the instant sign-in/out/switch
  // happens mid-flight, which is exactly how one user's cohort config was
  // leaking into another's state and cache. Writing a ref during render
  // (rather than in an effect) is what guarantees it's already current by
  // the time any effect — including the one that calls `refresh()` — runs.
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const refresh = useCallback(() => {
    if (inFlight.current) {
      pendingRefetch.current = true;
      return;
    }
    inFlight.current = true;
    const requestedUserId = userIdRef.current;
    void (async () => {
      try {
        const next = await fetchRemoteConfig();
        if (userIdRef.current !== requestedUserId) {
          // Identity moved on while this fetch was in flight. The result
          // belongs to a cohort that's no longer current — applying it
          // would write user A's config into user B's (or a signed-out
          // session's) live state and persisted cache. Discard silently;
          // the pending-refetch drain below (or the identity effect that
          // already ran for the new user) is what gets the new identity
          // its own fetch.
          return;
        }
        // `null` means "keep what you have" — offline, signed out, or a
        // server error. Overwriting with defaults would flap the UI.
        if (!next) return;
        setConfig(next.config);
        lastFetchedAt.current = Date.now();
        ttlMs.current = next.ttlMs;
        try {
          // The BARE config bag, not the whole fetch envelope —
          // `readCachedRemoteConfig` reads this back as
          // `parseRemoteConfig({ config: JSON.parse(raw) })`, so anything
          // wrapped around it here would be silently dropped on read. The TTL
          // deliberately does not go in the cache: it governs when to refresh,
          // not what a cached read returns.
          await AsyncStorage.setItem(REMOTE_CONFIG_CACHE_KEY, JSON.stringify(next.config));
        } catch {
          /* best-effort — an unwritable cache only costs us a refetch */
        }
      } finally {
        inFlight.current = false;
        if (pendingRefetch.current) {
          // Something asked for a fresh fetch while this one was running
          // and got queued instead of dropped. Run it now — it will
          // snapshot whatever identity is current at this point.
          pendingRefetch.current = false;
          refresh();
        }
      }
    })();
  }, []);

  // Identity change → the cached config may belong to a different cohort.
  // Drop it, fall back to bundled defaults, and refetch. This covers
  // sign-in, sign-out, and account switch in one place.
  useEffect(() => {
    // `SupabaseSessionProvider` initialises `session` to null and only
    // populates it once `getSession()` resolves. While `loading` is true, a
    // null `userId` means "we don't know yet who's signed in", not "signed
    // out" — it's the same value a real sign-out produces. Effects flush
    // child-first, so on every cold start this effect would otherwise run
    // once with that ambiguous null before the restored session arrives,
    // take the "identity changed" branch below, and delete
    // REMOTE_CONFIG_CACHE_KEY / REMOTE_CONFIG_USER_KEY before they were ever
    // read — wiping the cache on every launch and skipping the "read cache →
    // render immediately" path this provider exists for. Waiting for
    // `loading` to clear means the effect only ever sees a real identity
    // (including a genuine signed-out one).
    if (loading) return;

    let cancelled = false;

    void (async () => {
      let cachedUser: string | null = null;
      try {
        cachedUser = await AsyncStorage.getItem(REMOTE_CONFIG_USER_KEY);
      } catch {
        /* treat an unreadable cache as absent */
      }
      if (cancelled) return;

      if (cachedUser !== userId) {
        setConfig(EMPTY_REMOTE_CONFIG);
        lastFetchedAt.current = 0;
        // The audience changed, so the previous audience's TTL no longer
        // applies (public and client are given different ones). Back to
        // "unknown" until the refetch below reports the new one.
        ttlMs.current = null;
        try {
          await AsyncStorage.removeItem(REMOTE_CONFIG_CACHE_KEY);
          // Re-check between writes: a fast A→B→C identity sequence could
          // otherwise have this (now-superseded) run stamp
          // REMOTE_CONFIG_USER_KEY with an identity that's no longer current.
          // No setState happens in this branch, so the risk was narrow, but
          // the recheck is free.
          if (cancelled) return;
          if (userId) await AsyncStorage.setItem(REMOTE_CONFIG_USER_KEY, userId);
          else await AsyncStorage.removeItem(REMOTE_CONFIG_USER_KEY);
        } catch {
          /* best-effort */
        }
      } else {
        setConfig(await readCachedRemoteConfig());
      }

      // Anonymous callers get the `public` keys — first-run locale, plan
      // prices, and the incident switches. The AI-only predecessor skipped the
      // fetch when signed out; that gap is exactly what this replaces.
      if (!cancelled) refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, loading, refresh]);

  // Foreground refresh, but only past the TTL — cohort changes (a pass
  // purchase, an alpha grant) should land without waiting for a cold start.
  // The threshold is the server's own `ttlSeconds` for this caller's audience,
  // so an anonymous install picks up the incident switches on the 5-minute
  // schedule the server intends rather than a hardcoded 15.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s !== "active") return;
      if (Date.now() - lastFetchedAt.current < (ttlMs.current ?? DEFAULT_TTL_MS)) return;
      refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<RemoteConfigValue>(() => ({ config, refresh }), [config, refresh]);

  return <RemoteConfigContext.Provider value={value}>{children}</RemoteConfigContext.Provider>;
}

export function useRemoteConfig(): RemoteConfigValue {
  const v = useContext(RemoteConfigContext);
  if (!v) throw new Error("useRemoteConfig requires RemoteConfigProvider");
  return v;
}

/**
 * The AI-shaped view of remote config. Signature is unchanged from the
 * previous `AiConfigContext`, so its consumers need no edits.
 */
export function useAiConfig(): {
  config: AiConfig;
  isActionEnabled: (action: AiProxyAction) => boolean;
  refresh: () => void;
} {
  const { config, refresh } = useRemoteConfig();
  const ai = useMemo(() => aiConfigFrom(config), [config]);
  return useMemo(
    () => ({ config: ai, isActionEnabled: (a: AiProxyAction) => isActionEnabled(ai, a), refresh }),
    [ai, refresh],
  );
}
