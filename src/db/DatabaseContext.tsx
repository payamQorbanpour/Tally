import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  AppState,
  type AppStateStatus,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { getLocalUserProfile, getSetting, setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import type { SQLiteDatabase } from "expo-sqlite";
import { openTallyDatabase } from "./openTallyDatabase";
import type { TallyDb } from "./tallyDb";
import {
  createTallySupabaseClient,
  pullAllFromSupabase,
  pushMergedToSupabase,
  TALLY_SUPABASE_TABLES,
} from "../sync/supabaseSync";
import {
  isCloudSyncDisabledByBuildEnv,
  isSupabaseSyncConfigured,
} from "../sync/config";
import { usePremium } from "../premium/PremiumContext";

/** Batch rapid local writes before uploading (lower = snappier sync, more requests). */
const PUSH_DEBOUNCE_MS = 400;
/** Fallback poll when Realtime is slow or unavailable. */
const PULL_INTERVAL_MS = 30_000;
/** Coalesce noisy `postgres_changes` bursts into one pull. */
const REALTIME_PULL_DEBOUNCE_MS = 350;
/** Avoid hammering the network when the app foregrounds repeatedly. */
const FOREGROUND_SYNC_MIN_GAP_MS = 2_500;

export type TallyDataContext = {
  db: TallyDb;
  /** Raw sqlite (for `Supabase` sync helpers that need `expo-sqlite` types). */
  sqlite: SQLiteDatabase;
  /**
   * Incremented after local writes and after a successful `Supabase` pull. Use in `useTallyQuery` deps
   * so lists refresh if the DB change hook misses a batch.
   */
  dataRevision: number;
  /** Latest cloud sync / error state. */
  syncState: { busy: boolean; lastError: string | null; lastOkAt: number | null };
  cloudSyncUserEnabled: boolean;
  cloudSyncUserPrefReady: boolean;
  cloudSyncCanBeUsed: boolean;
  cloudSyncBuildDisabled: boolean;
  /**
   * Saved email on this device (from profile). Cloud sync is only *effective* when this is true
   * and the user has turned the toggle on, even if the preference is still “on” briefly while saving.
   */
  localUserHasProfileEmail: boolean;
  /** Re-read local profile email (e.g. after profile save) so the cloud toggle can turn on. */
  revalidateLocalUserForSync: () => Promise<void>;
  setCloudSyncUserEnabled: (enabled: boolean) => Promise<boolean>;
  /** Call after auth-linked SQLite id remap so screens reload member lists. */
  bumpDataRevision: () => void;
  /**
   * Pull-to-refresh: upload pending changes then pull remote (when cloud sync is on),
   * otherwise only bump `dataRevision` so local queries reload.
   */
  refreshCloudData: () => Promise<void>;
  /** Premium subscription required for cloud sync when IAP product IDs are configured (native builds). */
  cloudSyncPremiumBlocked: boolean;
};

const TallyData = createContext<TallyDataContext | null>(null);

const webMinFill: ViewStyle | false =
  Platform.OS === "web"
    ? ({ minHeight: "100vh", width: "100%" } as unknown as ViewStyle)
    : false;

type Opened = { sqlite: import("expo-sqlite").SQLiteDatabase; tally: TallyDb };

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const premium = usePremium();
  const { session: authSession, loading: authSessionLoading } =
    useSupabaseSession();
  const [value, setValue] = useState<Opened | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [syncState, setSyncState] = useState<{
    busy: boolean;
    lastError: string | null;
    lastOkAt: number | null;
  }>({ busy: false, lastError: null, lastOkAt: null });
  const [cloudUserEnabled, setCloudUserEnabled] = useState(false);
  const [cloudPrefReady, setCloudPrefReady] = useState(false);
  const [localUserHasProfileEmail, setLocalUserHasProfileEmail] = useState(false);

  const canUseCloud = isSupabaseSyncConfigured() && !isCloudSyncDisabledByBuildEnv();
  const buildDisabled = isCloudSyncDisabledByBuildEnv();
  const cloudSyncPremiumBlocked = premium.iapGatingEnabled && !premium.isPremium;
  const cloudSyncEffective =
    canUseCloud &&
    cloudUserEnabled &&
    localUserHasProfileEmail &&
    !cloudSyncPremiumBlocked;

  const valueRef = useRef<Opened | null>(null);
  valueRef.current = value;
  const pushDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doPush = useCallback(async () => {
    if (!valueRef.current || !canUseCloud || !cloudUserEnabled) return;
    if (!localUserHasProfileEmail) return;
    if (premium.iapGatingEnabled && !premium.isPremium) return;
    const c = createTallySupabaseClient();
    if (!c) return;
    setSyncState((s) => ({ ...s, busy: true, lastError: null }));
    try {
      await pushMergedToSupabase(c, valueRef.current.sqlite);
      setSyncState({ busy: false, lastError: null, lastOkAt: Date.now() });
    } catch (e) {
      setSyncState({
        busy: false,
        lastError: e instanceof Error ? e.message : String(e),
        lastOkAt: null,
      });
    }
  }, [
    canUseCloud,
    cloudUserEnabled,
    localUserHasProfileEmail,
    premium.iapGatingEnabled,
    premium.isPremium,
  ]);

  const schedulePush = useCallback(() => {
    if (!canUseCloud || !cloudUserEnabled || !localUserHasProfileEmail) return;
    if (premium.iapGatingEnabled && !premium.isPremium) return;
    if (pushDebounce.current) clearTimeout(pushDebounce.current);
    pushDebounce.current = setTimeout(() => {
      pushDebounce.current = null;
      void doPush();
    }, PUSH_DEBOUNCE_MS);
  }, [
    canUseCloud,
    cloudUserEnabled,
    localUserHasProfileEmail,
    premium.iapGatingEnabled,
    premium.isPremium,
    doPush,
  ]);

  const schedulePushRef = useRef(schedulePush);
  schedulePushRef.current = schedulePush;
  const openDbCallbackRef = useRef(() => {});
  openDbCallbackRef.current = () => {
    setDataRevision((n) => n + 1);
    schedulePushRef.current();
  };

  useEffect(() => {
    let c = true;
    void (async () => {
      try {
        const o = await openTallyDatabase(() => openDbCallbackRef.current());
        if (c) setValue(o);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      c = false;
    };
  }, []);

  const doFullSync = useCallback(
    async (includePush: boolean, o?: { bypassProfileEmailCheck?: boolean }) => {
      if (!valueRef.current || !canUseCloud) return;
      if (!o?.bypassProfileEmailCheck && !localUserHasProfileEmail) return;
      if (premium.iapGatingEnabled && !premium.isPremium) return;
      const client = createTallySupabaseClient();
      if (!client) return;
      setSyncState((s) => ({ ...s, busy: true, lastError: null }));
      try {
        if (includePush) {
          await pushMergedToSupabase(client, valueRef.current.sqlite);
        } else {
          await pullAllFromSupabase(client, valueRef.current.sqlite);
        }
        setDataRevision((n) => n + 1);
        setSyncState({ busy: false, lastError: null, lastOkAt: Date.now() });
      } catch (e) {
        setSyncState({
          busy: false,
          lastError: e instanceof Error ? e.message : String(e),
          lastOkAt: null,
        });
      }
    },
    [canUseCloud, localUserHasProfileEmail, premium.iapGatingEnabled, premium.isPremium],
  );

  // After open: profile email, then cloud preference (disable cloud if on without email), then maybe sync.
  useEffect(() => {
    if (!value) return;
    let alive = true;
    void (async () => {
      const profile = await getLocalUserProfile(value.tally);
      if (!alive) return;
      const authEmail = authSession?.user?.email?.trim() ?? "";
      const hasEmail = Boolean(profile.email?.trim() || authEmail);
      setLocalUserHasProfileEmail(hasEmail);
      const raw = await getSetting(
        value.tally,
        SETTINGS_KEYS.cloudSyncUserEnabled,
      );
      const wants = raw === "1" || raw === "true";
      if (wants && !hasEmail) {
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "0");
        if (!alive) return;
        setCloudUserEnabled(false);
      } else {
        if (!alive) return;
        setCloudUserEnabled(wants);
      }
      setCloudPrefReady(true);
      if (wants && hasEmail && canUseCloud) {
        if (!alive) return;
        await doFullSync(true, { bypassProfileEmailCheck: true });
      }
    })();
    return () => {
      alive = false;
    };
  }, [value, canUseCloud, doFullSync, authSession?.user?.email]);

  // When local data changes, re-read email and turn cloud off if it was removed.
  useEffect(() => {
    if (!value) return;
    void (async () => {
      const profile = await getLocalUserProfile(value.tally);
      const authEmail = authSession?.user?.email?.trim() ?? "";
      const hasEmail = Boolean(profile.email?.trim() || authEmail);
      setLocalUserHasProfileEmail(hasEmail);
      if (hasEmail) return;
      const on = await getSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled);
      if (on === "1" || on === "true") {
        await setSetting(value.tally, SETTINGS_KEYS.cloudSyncUserEnabled, "0");
        setCloudUserEnabled(false);
        setSyncState((s) => ({ ...s, lastError: null, busy: false }));
      }
    })();
  }, [value, dataRevision, authSession?.user?.email]);

  // When Supabase auth session loads (email), refresh cloud eligibility without waiting for local writes.
  useEffect(() => {
    if (!value || authSessionLoading) return;
    void (async () => {
      const profile = await getLocalUserProfile(value.tally);
      const authEmail = authSession?.user?.email?.trim() ?? "";
      setLocalUserHasProfileEmail(Boolean(profile.email?.trim() || authEmail));
    })();
  }, [value, authSession?.user?.email, authSessionLoading]);

  // Periodic pull when cloud is effectively on.
  useEffect(() => {
    if (!value || !cloudSyncEffective) return;
    const id = setInterval(() => void doFullSync(false), PULL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [value, cloudSyncEffective, doFullSync]);

  // When returning to the app, catch up (pull + push) without waiting for the poll interval.
  const lastForegroundSyncAtRef = useRef(0);
  useEffect(() => {
    if (!value || !cloudSyncEffective) return;
    const onChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      const now = Date.now();
      if (now - lastForegroundSyncAtRef.current < FOREGROUND_SYNC_MIN_GAP_MS) return;
      lastForegroundSyncAtRef.current = now;
      void doFullSync(true);
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [value, cloudSyncEffective, doFullSync]);

  // Realtime: re-pull on any public table change.
  useEffect(() => {
    if (!value || !cloudSyncEffective) return;
    const c = createTallySupabaseClient();
    if (!c) return;
    const deb = (fn: () => void) => {
      let p: ReturnType<typeof setTimeout> | null = null;
      return () => {
        if (p) clearTimeout(p);
        p = setTimeout(() => {
          p = null;
          fn();
        }, REALTIME_PULL_DEBOUNCE_MS);
      };
    };
    const dPull = deb(() => void doFullSync(false));
    const channelName = "tally-sync-" + String(Platform.OS);
    const rch = c.channel(channelName);
    TALLY_SUPABASE_TABLES.forEach((table) => {
      (rch as { on: (a: string, f: object, c: () => void) => typeof rch }).on(
        "postgres_changes",
        { event: "*", schema: "public", table },
        dPull,
      );
    });
    rch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void doFullSync(false);
      }
    });
    return () => {
      void c.removeChannel(rch);
    };
  }, [value, cloudSyncEffective, doFullSync]);

  const revalidateLocalUserForSync = useCallback(async () => {
    if (!value) return;
    const p = await getLocalUserProfile(value.tally);
    const authEmail = authSession?.user?.email?.trim() ?? "";
    setLocalUserHasProfileEmail(Boolean(p.email?.trim() || authEmail));
  }, [value, authSession?.user?.email]);

  const bumpDataRevision = useCallback(() => {
    setDataRevision((n) => n + 1);
  }, []);

  const refreshCloudData = useCallback(async () => {
    if (!valueRef.current) return;
    if (!canUseCloud || !cloudUserEnabled || !localUserHasProfileEmail) {
      setDataRevision((n) => n + 1);
      return;
    }
    if (premium.iapGatingEnabled && !premium.isPremium) {
      setDataRevision((n) => n + 1);
      return;
    }
    const client = createTallySupabaseClient();
    if (!client) {
      setDataRevision((n) => n + 1);
      return;
    }
    setSyncState((s) => ({ ...s, busy: true, lastError: null }));
    try {
      await pushMergedToSupabase(client, valueRef.current.sqlite);
      await pullAllFromSupabase(client, valueRef.current.sqlite);
      setDataRevision((n) => n + 1);
      setSyncState({ busy: false, lastError: null, lastOkAt: Date.now() });
    } catch (e) {
      setSyncState({
        busy: false,
        lastError: e instanceof Error ? e.message : String(e),
        lastOkAt: null,
      });
      setDataRevision((n) => n + 1);
    }
  }, [
    canUseCloud,
    cloudUserEnabled,
    localUserHasProfileEmail,
    premium.iapGatingEnabled,
    premium.isPremium,
  ]);

  const setCloudSyncUserEnabled = useCallback(
    async (enabled: boolean) => {
      if (!value) return false;
      if (enabled && premium.iapGatingEnabled && !premium.isPremium) return false;
      if (enabled) {
        const p = await getLocalUserProfile(value.tally);
        if (!p.email?.trim()) return false;
        setLocalUserHasProfileEmail(true);
      }
      setCloudUserEnabled(enabled);
      await setSetting(
        value.tally,
        SETTINGS_KEYS.cloudSyncUserEnabled,
        enabled ? "1" : "0",
      );
      if (enabled && canUseCloud) {
        try {
          await doFullSync(true, { bypassProfileEmailCheck: true });
        } catch {
          // keep preference
        }
      } else {
        setSyncState((s) => ({ ...s, lastError: null, busy: false }));
      }
      return true;
    },
    [value, canUseCloud, doFullSync, premium.iapGatingEnabled, premium.isPremium],
  );

  if (error) {
    return (
      <View style={[styles.center, webMinFill]}>
        <Text style={styles.err}>Could not open database</Text>
        <Text style={styles.sub}>{error}</Text>
        <Text style={styles.hint}>
          {`If this appeared after a quick reload, try full reload or clear Metro: npx expo start -c`}
        </Text>
      </View>
    );
  }

  if (!value) {
    return (
      <View style={[styles.center, webMinFill]}>
        <ActivityIndicator size="large" />
        <Text style={styles.sub}>Loading…</Text>
      </View>
    );
  }

  return (
    <TallyData.Provider
      value={{
        db: value.tally,
        sqlite: value.sqlite,
        dataRevision,
        syncState,
        cloudSyncUserEnabled: cloudUserEnabled,
        cloudSyncUserPrefReady: cloudPrefReady,
        cloudSyncCanBeUsed: canUseCloud,
        cloudSyncBuildDisabled: buildDisabled,
        localUserHasProfileEmail,
        revalidateLocalUserForSync,
        setCloudSyncUserEnabled,
        bumpDataRevision,
        refreshCloudData,
        cloudSyncPremiumBlocked,
      }}
    >
      {children}
    </TallyData.Provider>
  );
}

export function useTallyData(): TallyDataContext {
  const v = useContext(TallyData);
  if (!v) throw new Error("useTallyData / useDatabase need DatabaseProvider");
  return v;
}

export function useDatabase(): TallyDb {
  return useTallyData().db;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  err: { fontSize: 17, fontWeight: "600", marginBottom: 8 },
  sub: { color: "#666", textAlign: "center" },
  hint: {
    marginTop: 20,
    color: "#333",
    textAlign: "center",
    lineHeight: 22,
  },
});
