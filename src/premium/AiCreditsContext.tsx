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
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getConfiguredRewardedAdProvider } from "../ads/admobProvider";
import { setAiCreditsListener } from "../core/aiProxy";
import { getSyncUrl } from "../sync/config";
import { usePremium } from "./PremiumContext";

/**
 * AI credits — the currency rewarded ads buy.
 *
 * Deliberately a sibling of `PremiumContext` rather than part of it: passes
 * and credits are different currencies with different lifecycles, and
 * `PremiumContext` is already large enough. This provider reads `isPremium`
 * from it for `isUnlimited` and owns nothing else about entitlement.
 *
 * The balance is server-owned (`ai_credit_balances`, select-only for
 * clients), so every value here is a cache of what the server said.
 */

export type WatchAdResult =
  /** Credits landed and `balance` is updated. */
  | "granted"
  /** The ad was watched but the server callback has not arrived yet. */
  | "pending"
  /** The user closed the ad early. Nothing was earned; not an error. */
  | "dismissed"
  /** No fill, or the SDK errored. */
  | "failed"
  /** No ad provider on this platform/build. */
  | "unavailable";

type AiCreditsValue = {
  balance: number;
  /** Premium users never spend credits and never see an ad. */
  isUnlimited: boolean;
  adsAvailable: boolean;
  busy: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  watchAdForCredits: () => Promise<WatchAdResult>;
};

const AiCreditsContext = createContext<AiCreditsValue | null>(null);

/** How long to wait for AdMob's SSV callback before giving up on the poll. */
const SSV_POLL_TIMEOUT_MS = 8_000;
const SSV_POLL_INTERVAL_MS = 800;

async function fetchBalance(): Promise<number | null> {
  const client = createTallySupabaseClient();
  if (!client) return null;
  const { data, error } = await client
    .from("ai_credit_balances")
    .select("balance")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { balance?: number };
  return typeof row.balance === "number" ? row.balance : 0;
}

export function AiCreditsProvider({ children }: { children: ReactNode }) {
  const { session } = useSupabaseSession();
  const { isPremium } = usePremium();

  const [balance, setBalance] = useState(0);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const provider = useMemo(() => getConfiguredRewardedAdProvider(), []);
  const adsAvailable = provider.isAvailable();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setBalance(0);
      return;
    }
    const next = await fetchBalance();
    if (next !== null && mounted.current) setBalance(next);
  }, [session?.user]);

  // Keep the balance in step with what the proxy reports on billed calls, so
  // spending a credit updates the chip without a round-trip.
  useEffect(() => {
    setAiCreditsListener((remaining) => {
      if (mounted.current) setBalance(remaining);
    });
    return () => setAiCreditsListener(null);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Credits can be granted out-of-band (an SSV callback that landed after the
  // app was backgrounded), so re-read on foreground — the same trigger
  // `PremiumContext` uses to re-check entitlement.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") void refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  /**
   * Poll until the balance rises above `previous` or the timeout elapses.
   * AdMob credits our server, not the client, so when `show()` resolves the
   * grant may still be in flight.
   */
  const pollForGrant = useCallback(async (previous: number): Promise<boolean> => {
    const deadline = Date.now() + SSV_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, SSV_POLL_INTERVAL_MS));
      const next = await fetchBalance();
      if (next !== null && next > previous) {
        if (mounted.current) setBalance(next);
        return true;
      }
    }
    return false;
  }, []);

  /** Redeem a nonce for networks with no server callback (phase 2). */
  const claimNonce = useCallback(
    async (nonce: string, providerId: string): Promise<boolean> => {
      const urlBase = getSyncUrl();
      const token = session?.access_token;
      if (!urlBase || !token) return false;
      try {
        const res = await fetch(
          `${urlBase.replace(/\/$/, "")}/functions/v1/ad-reward/claim`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ nonce, provider: providerId }),
          },
        );
        if (!res.ok) return false;
        const body = (await res.json()) as { balance?: number };
        if (typeof body.balance === "number" && mounted.current) setBalance(body.balance);
        return true;
      } catch {
        return false;
      }
    },
    [session?.access_token],
  );

  const watchAdForCredits = useCallback(async (): Promise<WatchAdResult> => {
    const userId = session?.user?.id;
    if (!userId) return "unavailable";
    if (!provider.isAvailable()) return "unavailable";

    setBusy(true);
    setLastError(null);
    const before = balance;
    try {
      const outcome = await provider.show({ userId });
      switch (outcome.kind) {
        case "ssv":
          return (await pollForGrant(before)) ? "granted" : "pending";
        case "nonce":
          return (await claimNonce(outcome.nonce, provider.id)) ? "granted" : "failed";
        case "dismissed":
          return "dismissed";
        case "failed":
          setLastError(outcome.reason);
          return "failed";
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      return "failed";
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [balance, claimNonce, pollForGrant, provider, session?.user?.id]);

  const value = useMemo<AiCreditsValue>(
    () => ({
      balance,
      isUnlimited: isPremium,
      adsAvailable,
      busy,
      lastError,
      refresh,
      watchAdForCredits,
    }),
    [balance, isPremium, adsAvailable, busy, lastError, refresh, watchAdForCredits],
  );

  return <AiCreditsContext.Provider value={value}>{children}</AiCreditsContext.Provider>;
}

export function useAiCredits(): AiCreditsValue {
  const v = useContext(AiCreditsContext);
  if (!v) throw new Error("useAiCredits requires AiCreditsProvider");
  return v;
}
