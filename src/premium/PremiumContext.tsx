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
import { AppState, type AppStateStatus, Platform } from "react-native";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getPremiumSubscriptionProductIds, getSyncAppleSubscriptionFunctionSlug } from "./premiumConfig";

type PremiumContextValue = {
  /** When false, treat everyone as premium (no IAP product IDs in env). */
  iapGatingEnabled: boolean;
  /** Store says user has an active subscription for one of our SKUs. */
  deviceSubscriptionActive: boolean;
  /** Last known `profiles.is_premium` from Supabase (signed-in users). */
  profilePremium: boolean;
  /** Effective entitlement for gated features. */
  isPremium: boolean;
  busy: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  requestUpgrade: () => Promise<void>;
  restorePurchases: () => Promise<void>;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

async function fetchProfilePremium(client: ReturnType<typeof createTallySupabaseClient>): Promise<boolean> {
  if (!client) return false;
  try {
    const { data, error } = await client.from("profiles").select("is_premium").maybeSingle();
    if (error || !data) return false;
    return Boolean((data as { is_premium?: boolean }).is_premium);
  } catch {
    return false;
  }
}

async function postAppleSync(
  accessToken: string,
  transactionId: string,
): Promise<{ ok: boolean; message?: string }> {
  const slug = getSyncAppleSubscriptionFunctionSlug();
  const urlBase = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  if (!urlBase) return { ok: false, message: "not_configured" };
  const res = await fetch(`${urlBase.replace(/\/$/, "")}/functions/v1/${slug}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transactionId }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, message: t || res.statusText };
  }
  return { ok: true };
}

export function PremiumProvider({ children }: { children: ReactNode }) {
  const { session } = useSupabaseSession();
  const skus = useMemo(() => getPremiumSubscriptionProductIds(), []);
  const iapGatingEnabled = skus.length > 0 && Platform.OS !== "web";

  const [deviceSubscriptionActive, setDeviceSubscriptionActive] = useState(false);
  const [profilePremium, setProfilePremium] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const initDone = useRef(false);

  const refreshDevice = useCallback(async () => {
    if (!iapGatingEnabled) {
      setDeviceSubscriptionActive(false);
      return;
    }
    try {
      const mod = await import("expo-iap");
      const ok = await mod.initConnection();
      if (!ok) {
        setDeviceSubscriptionActive(false);
        return;
      }
      initDone.current = true;
      const active = await mod.hasActiveSubscriptions(skus);
      setDeviceSubscriptionActive(active);
      if (active && session?.access_token) {
        const subs = await mod.getActiveSubscriptions(skus);
        const tx = subs[0]?.transactionId;
        if (tx) {
          const r = await postAppleSync(session.access_token, tx);
          if (r.ok) setProfilePremium(true);
        }
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
      setDeviceSubscriptionActive(false);
    }
  }, [iapGatingEnabled, skus, session?.access_token]);

  const refreshProfileOnly = useCallback(async () => {
    const c = createTallySupabaseClient();
    if (!session?.user || !c) {
      setProfilePremium(false);
      return;
    }
    setProfilePremium(await fetchProfilePremium(c));
  }, [session?.user]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      await refreshProfileOnly();
      await refreshDevice();
      await refreshProfileOnly();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refreshDevice, refreshProfileOnly]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when auth / SKU config changes
  }, [session?.user?.id, iapGatingEnabled, skus.join("|")]);

  useEffect(() => {
    if (!iapGatingEnabled) return;
    let sub: { remove: () => void } | null = null;
    void (async () => {
      try {
        const mod = await import("expo-iap");
        sub = mod.purchaseUpdatedListener((purchase) => {
          void (async () => {
            try {
              await mod.finishTransaction({ purchase, isConsumable: false });
              await refreshDevice();
              await refreshProfileOnly();
            } catch (e) {
              setLastError(e instanceof Error ? e.message : String(e));
            }
          })();
        });
      } catch {
        // ignore
      }
    })();
    return () => {
      sub?.remove();
    };
  }, [iapGatingEnabled, refreshDevice, refreshProfileOnly]);

  useEffect(() => {
    if (!iapGatingEnabled) return;
    const onChange = (s: AppStateStatus) => {
      if (s === "active") void refresh();
    };
    const a = AppState.addEventListener("change", onChange);
    return () => a.remove();
  }, [iapGatingEnabled, refresh]);

  const requestUpgrade = useCallback(async () => {
    if (!iapGatingEnabled || skus.length === 0) return;
    setBusy(true);
    setLastError(null);
    try {
      const mod = await import("expo-iap");
      if (!initDone.current) {
        await mod.initConnection();
        initDone.current = true;
      }
      await mod.fetchProducts({ skus, type: "subs" });
      const sku = skus[0]!;
      await mod.requestPurchase({
        request: {
          apple: { sku },
          google: { skus: [sku] },
        },
        type: "subs",
      });
      await refreshDevice();
      await refreshProfileOnly();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [iapGatingEnabled, skus, refreshDevice, refreshProfileOnly]);

  const restorePurchases = useCallback(async () => {
    if (!iapGatingEnabled) return;
    setBusy(true);
    setLastError(null);
    try {
      const mod = await import("expo-iap");
      if (!initDone.current) {
        await mod.initConnection();
        initDone.current = true;
      }
      await mod.restorePurchases();
      await mod.getAvailablePurchases();
      await refreshDevice();
      await refreshProfileOnly();
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [iapGatingEnabled, refreshDevice, refreshProfileOnly]);

  const isPremium = !iapGatingEnabled || deviceSubscriptionActive || profilePremium;

  const value = useMemo(
    () => ({
      iapGatingEnabled,
      deviceSubscriptionActive,
      profilePremium,
      isPremium,
      busy,
      lastError,
      refresh,
      requestUpgrade,
      restorePurchases,
    }),
    [
      iapGatingEnabled,
      deviceSubscriptionActive,
      profilePremium,
      isPremium,
      busy,
      lastError,
      refresh,
      requestUpgrade,
      restorePurchases,
    ],
  );

  return <PremiumContext.Provider value={value}>{children}</PremiumContext.Provider>;
}

export function usePremium(): PremiumContextValue {
  const v = useContext(PremiumContext);
  if (!v) throw new Error("usePremium requires PremiumProvider");
  return v;
}

/** Safe on web or before provider (returns permissive defaults). */
export function usePremiumOptional(): PremiumContextValue {
  const v = useContext(PremiumContext);
  if (v) return v;
  return {
    iapGatingEnabled: false,
    deviceSubscriptionActive: false,
    profilePremium: false,
    isPremium: true,
    busy: false,
    lastError: null,
    refresh: async () => {},
    requestUpgrade: async () => {},
    restorePurchases: async () => {},
  };
}
