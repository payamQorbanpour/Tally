/**
 * Holds the app's current AI remote config: reads a cached copy at start,
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
import { type AiConfig, DEFAULT_AI_CONFIG, isActionEnabled, parseAiConfig } from "../core/aiConfig";
import type { AiProxyAction } from "../core/aiCreditCost";
import { fetchAiConfig } from "../core/aiConfigClient";

const CACHE_KEY = "@tally:ai_config";
const CACHE_USER_KEY = "@tally:ai_config_user";
/** Matches `ttlSeconds` from get-ai-config. Refresh on foreground past this. */
const TTL_MS = 15 * 60 * 1000;

type AiConfigValue = {
  config: AiConfig;
  isActionEnabled: (action: AiProxyAction) => boolean;
  refresh: () => void;
};

const AiConfigContext = createContext<AiConfigValue | null>(null);

export function AiConfigProvider({ children }: { children: ReactNode }) {
  const { session } = useSupabaseSession();
  const userId = session?.user?.id ?? null;

  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const lastFetchedAt = useRef(0);
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
        const next = await fetchAiConfig();
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
        setConfig(next);
        lastFetchedAt.current = Date.now();
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
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
    let cancelled = false;

    void (async () => {
      let cachedUser: string | null = null;
      try {
        cachedUser = await AsyncStorage.getItem(CACHE_USER_KEY);
      } catch {
        /* treat an unreadable cache as absent */
      }
      if (cancelled) return;

      if (cachedUser !== userId) {
        setConfig(DEFAULT_AI_CONFIG);
        lastFetchedAt.current = 0;
        try {
          await AsyncStorage.removeItem(CACHE_KEY);
          // Re-check between writes: a fast A→B→C identity sequence could
          // otherwise have this (now-superseded) run stamp CACHE_USER_KEY
          // with an identity that's no longer current. No setState happens
          // in this branch, so the risk was narrow, but the recheck is
          // free.
          if (cancelled) return;
          if (userId) await AsyncStorage.setItem(CACHE_USER_KEY, userId);
          else await AsyncStorage.removeItem(CACHE_USER_KEY);
        } catch {
          /* best-effort */
        }
      } else {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          if (raw && !cancelled) setConfig(parseAiConfig(JSON.parse(raw)));
        } catch {
          /* corrupt cache — bundled defaults already in state */
        }
      }

      if (!cancelled && userId) refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  // Foreground refresh, but only past the TTL — cohort changes (a pass
  // purchase, an alpha grant) should land without waiting for a cold start.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s !== "active") return;
      if (Date.now() - lastFetchedAt.current < TTL_MS) return;
      refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<AiConfigValue>(
    () => ({
      config,
      isActionEnabled: (action: AiProxyAction) => isActionEnabled(config, action),
      refresh,
    }),
    [config, refresh],
  );

  return <AiConfigContext.Provider value={value}>{children}</AiConfigContext.Provider>;
}

export function useAiConfig(): AiConfigValue {
  const v = useContext(AiConfigContext);
  if (!v) throw new Error("useAiConfig requires AiConfigProvider");
  return v;
}
