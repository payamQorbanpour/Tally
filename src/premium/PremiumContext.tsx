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
import {
  getLegacySubscriptionProductIds,
  getPassExtendProductId,
  getPassProductId,
  getSyncAppleSubscriptionFunctionSlug,
} from "./premiumConfig";
import {
  type ActivePass,
  extendedPass,
  endedPass,
  isPassActive,
  newPass,
  type PassType,
} from "./passes";
import { getSyncUrl } from "../sync/config";

/**
 * Persistence adapter the `PremiumPassBinding` bridge component
 * registers when it mounts inside `DatabaseProvider`. Pass writes go
 * through the adapter so `PremiumContext` itself never needs the local
 * SQLite handle (DatabaseProvider already depends on usePremium(), so
 * the reverse direction would create a cycle).
 *
 * `loadCurrent` is called once on bridge mount to hydrate state from
 * disk; the other methods are called on each mutator.
 */
export type PassPersistenceAdapter = {
  loadCurrent: () => Promise<ActivePass | null>;
  recordPurchase: (
    pass: ActivePass,
    productId: string,
    storeTransactionId?: string | null,
  ) => Promise<void>;
  recordExtension: (
    pass: ActivePass,
    productId: string,
    storeTransactionId?: string | null,
  ) => Promise<void>;
  markEnded: () => Promise<void>;
};

type PremiumContextValue = {
  /** True when at least one IAP product ID is set — pass or legacy sub. */
  iapGatingEnabled: boolean;
  activePass: ActivePass | null;
  hasActivePass: boolean;
  /** Legacy subscriber detected via `expo-iap` (grandfathered). */
  deviceSubscriptionActive: boolean;
  /** Last known `profiles.is_premium` from Supabase (signed-in users). */
  profilePremium: boolean;
  /** Last known `profiles.is_alpha` from Supabase — tester/admin bypass. */
  isAlpha: boolean;
  /** Effective entitlement for any premium feature. */
  isPremium: boolean;
  busy: boolean;
  lastError: string | null;
  refresh: () => Promise<void>;
  requestPass: (type: PassType, opts?: { groupId?: string }) => Promise<void>;
  requestExtension: () => Promise<void>;
  endActivePass: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  /**
   * Internal — called by the bridge component to wire up local SQLite
   * persistence. Calling code outside `PremiumPassBinding` should not
   * use this.
   */
  _registerPassPersister: (adapter: PassPersistenceAdapter | null) => void;
};

const PremiumContext = createContext<PremiumContextValue | null>(null);

async function fetchProfileEntitlements(
  client: ReturnType<typeof createTallySupabaseClient>,
): Promise<{ isPremium: boolean; isAlpha: boolean }> {
  if (!client) return { isPremium: false, isAlpha: false };
  try {
    const { data, error } = await client
      .from("profiles")
      .select("is_premium, is_alpha")
      .maybeSingle();
    if (error || !data) return { isPremium: false, isAlpha: false };
    const row = data as { is_premium?: boolean; is_alpha?: boolean };
    return { isPremium: Boolean(row.is_premium), isAlpha: Boolean(row.is_alpha) };
  } catch {
    return { isPremium: false, isAlpha: false };
  }
}

/**
 * Best-effort write of `profiles.is_premium` so other devices and the
 * server-side AI proxy see the entitlement immediately. Failures are
 * swallowed — the local pass row is the source of truth on this device,
 * and `is_premium` will reconcile on the next refresh.
 */
async function writeProfileIsPremium(
  client: ReturnType<typeof createTallySupabaseClient>,
  userId: string,
  value: boolean,
): Promise<void> {
  if (!client) return;
  try {
    await client
      .from("profiles")
      .update({ is_premium: value })
      .eq("id", userId);
  } catch {
    // best-effort
  }
}

async function postAppleSync(
  accessToken: string,
  transactionId: string,
): Promise<{ ok: boolean; message?: string }> {
  const slug = getSyncAppleSubscriptionFunctionSlug();
  const urlBase = getSyncUrl();
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
  // Legacy subscription detection — only for grandfathered subscribers
  // from the previous monthly/yearly model. New monetization is the
  // one-time pass IAPs (handled separately below).
  const legacySkus = useMemo(() => getLegacySubscriptionProductIds(), []);
  const iapGatingEnabled = Platform.OS !== "web";

  const [activePass, setActivePassState] = useState<ActivePass | null>(null);
  const [deviceSubscriptionActive, setDeviceSubscriptionActive] = useState(false);
  const [profilePremium, setProfilePremium] = useState(false);
  const [isAlpha, setIsAlpha] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [, setClockTick] = useState(0);
  const initDone = useRef(false);
  const persisterRef = useRef<PassPersistenceAdapter | null>(null);

  const _registerPassPersister = useCallback(
    (adapter: PassPersistenceAdapter | null) => {
      persisterRef.current = adapter;
      if (!adapter) return;
      // Hydrate immediately on bridge mount.
      void (async () => {
        try {
          const pass = await adapter.loadCurrent();
          setActivePassState(pass);
        } catch {
          // best-effort
        }
      })();
    },
    [],
  );

  // Periodic clock tick so `isPassActive(activePass)` flips off in real
  // time while the user is on the Plans screen watching the countdown.
  useEffect(() => {
    if (!activePass) return;
    const id = setInterval(() => setClockTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, [activePass]);

  // ── Legacy subscription / profile entitlement refresh ──────────────
  const refreshDevice = useCallback(async () => {
    if (legacySkus.length === 0 || Platform.OS === "web") {
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
      const active = await mod.hasActiveSubscriptions(legacySkus);
      setDeviceSubscriptionActive(active);
      if (active && session?.access_token) {
        const subs = await mod.getActiveSubscriptions(legacySkus);
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
  }, [legacySkus, session?.access_token]);

  const refreshProfileOnly = useCallback(async () => {
    const c = createTallySupabaseClient();
    if (!session?.user || !c) {
      setProfilePremium(false);
      setIsAlpha(false);
      return;
    }
    const ent = await fetchProfileEntitlements(c);
    setProfilePremium(ent.isPremium);
    setIsAlpha(ent.isAlpha);
  }, [session?.user]);

  const refresh = useCallback(async () => {
    setBusy(true);
    setLastError(null);
    try {
      await refreshProfileOnly();
      await refreshDevice();
      await refreshProfileOnly();
      // Reload pass from local DB — handles cases where another tab /
      // background flow wrote a new pass row while this provider was
      // backgrounded. (No-op when the bridge hasn't mounted yet.)
      if (persisterRef.current) {
        const pass = await persisterRef.current.loadCurrent();
        setActivePassState(pass);
      }
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [refreshDevice, refreshProfileOnly]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when auth / SKU config changes
  }, [session?.user?.id, legacySkus.join("|")]);

  useEffect(() => {
    if (legacySkus.length === 0 || Platform.OS === "web") return;
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
  }, [legacySkus, refreshDevice, refreshProfileOnly]);

  // Once-a-minute heartbeat that flips `is_premium` to false on the
  // remote profile the moment a pass crosses its `expires_at`. The
  // server-side AI proxy reads `is_premium` directly, so a stale `true`
  // would let an expired user keep using premium endpoints until they
  // next opened the app. Local state already flips off on its own
  // because `isPassActive` is computed against `Date.now()` per render.
  const lastWroteIsPremium = useRef<boolean | null>(null);
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) {
      lastWroteIsPremium.current = null;
      return;
    }
    const live = isPassActive(activePass);
    // Profile is the OR of pass + alpha + legacy sub. Don't flip off
    // here when alpha/legacy is still true; just sync the pass state to
    // the column.
    const next = live || isAlpha || deviceSubscriptionActive;
    if (lastWroteIsPremium.current === next) return;
    if (profilePremium === next) {
      lastWroteIsPremium.current = next;
      return;
    }
    lastWroteIsPremium.current = next;
    void (async () => {
      const c = createTallySupabaseClient();
      if (!c) return;
      await writeProfileIsPremium(c, userId, next);
    })();
  }, [
    activePass,
    isAlpha,
    deviceSubscriptionActive,
    profilePremium,
    session?.user?.id,
  ]);

  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s === "active") {
        setClockTick((n) => n + 1);
        void refresh();
      }
    };
    const a = AppState.addEventListener("change", onChange);
    return () => a.remove();
  }, [refresh]);

  // ── Pass purchases ─────────────────────────────────────────────────
  //
  // Real IAP for one-time purchases is deferred — it requires server-side
  // receipt validation (`sync-apple-subscription` Edge Function isn't
  // wired for non-consumable receipts yet). For now, when a SKU exists
  // we still try `requestPurchase`; on success we activate the pass
  // locally as a stand-in for what the receipt-validated server flow
  // will eventually do. When SKUs are unset (dev/web), the function
  // skips IAP entirely and just activates locally so the soft-lock UX
  // is testable end-to-end.
  const buyOrStub = useCallback(
    async (
      sku: string | null,
    ): Promise<{ ok: boolean; transactionId?: string | null }> => {
      if (!sku || Platform.OS === "web") return { ok: true, transactionId: null };
      try {
        const mod = await import("expo-iap");
        if (!initDone.current) {
          await mod.initConnection();
          initDone.current = true;
        }
        await mod.fetchProducts({ skus: [sku], type: "inapp" });
        await mod.requestPurchase({
          request: {
            apple: { sku },
            google: { skus: [sku] },
          },
          type: "inapp",
        });
        return { ok: true, transactionId: null };
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        return { ok: false };
      }
    },
    [],
  );

  const requestPass = useCallback(
    async (type: PassType, opts?: { groupId?: string }) => {
      setBusy(true);
      setLastError(null);
      try {
        const sku = getPassProductId(type);
        const result = await buyOrStub(sku);
        if (!result.ok) return;
        const pass = newPass(type, { groupId: opts?.groupId ?? null });
        setActivePassState(pass);
        if (persisterRef.current) {
          await persisterRef.current.recordPurchase(
            pass,
            sku ?? `local:${type}`,
            result.transactionId ?? null,
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [buyOrStub],
  );

  const requestExtension = useCallback(async () => {
    if (!activePass) return;
    setBusy(true);
    setLastError(null);
    try {
      const sku = getPassExtendProductId(activePass.type);
      const result = await buyOrStub(sku);
      if (!result.ok) return;
      const next = extendedPass(activePass);
      setActivePassState(next);
      if (persisterRef.current) {
        await persisterRef.current.recordExtension(
          next,
          sku ?? `local:${activePass.type}.extend`,
          result.transactionId ?? null,
        );
      }
    } finally {
      setBusy(false);
    }
  }, [activePass, buyOrStub]);

  const endActivePass = useCallback(async () => {
    if (!activePass) return;
    const next = endedPass(activePass);
    setActivePassState(next);
    if (persisterRef.current) {
      await persisterRef.current.markEnded();
    }
  }, [activePass]);

  const restorePurchases = useCallback(async () => {
    if (Platform.OS === "web") return;
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
  }, [refreshDevice, refreshProfileOnly]);

  // Once the user is signed in, `profiles.is_premium` is the canonical
  // source of truth for backend-granted premium (alpha / staff comp /
  // legacy subscriber). On top of that, an active pass grants premium
  // for the duration of the pass. Signed-out users stay permissive on
  // dev/web so local-only visitors aren't paywalled before signing up.
  const signedIn = !!session?.user;
  const hasActivePass = isPassActive(activePass);
  const isPremium =
    isAlpha ||
    deviceSubscriptionActive ||
    profilePremium ||
    hasActivePass ||
    (!signedIn && Platform.OS === "web");

  const value = useMemo<PremiumContextValue>(
    () => ({
      iapGatingEnabled,
      activePass,
      hasActivePass,
      deviceSubscriptionActive,
      profilePremium,
      isAlpha,
      isPremium,
      busy,
      lastError,
      refresh,
      requestPass,
      requestExtension,
      endActivePass,
      restorePurchases,
      _registerPassPersister,
    }),
    [
      iapGatingEnabled,
      activePass,
      hasActivePass,
      deviceSubscriptionActive,
      profilePremium,
      isAlpha,
      isPremium,
      busy,
      lastError,
      refresh,
      requestPass,
      requestExtension,
      endActivePass,
      restorePurchases,
      _registerPassPersister,
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
    activePass: null,
    hasActivePass: false,
    deviceSubscriptionActive: false,
    profilePremium: false,
    isAlpha: false,
    isPremium: true,
    busy: false,
    lastError: null,
    refresh: async () => {},
    requestPass: async () => {},
    requestExtension: async () => {},
    endActivePass: async () => {},
    restorePurchases: async () => {},
    _registerPassPersister: () => {},
  };
}
