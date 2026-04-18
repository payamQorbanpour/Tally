import { type AbstractPowerSyncDatabase, SyncStatus } from "@powersync/common";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { getSetting, setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import { openTallyPowerSync } from "./openTallyDatabase";
import type { TallyDb } from "./tallyDb";
import { createSupabaseConnector, getDevSupabaseToken } from "../sync/SupabaseConnector";
import { isCloudSyncDisabledByBuildEnv, isPowerSyncConfigured } from "../sync/config";

export type TallyDataContext = {
  db: TallyDb;
  powerSync: AbstractPowerSyncDatabase;
  /** Latest sync / connection state. */
  syncStatus: SyncStatus;
  /** User preference from settings (not loaded until `cloudSyncUserPrefReady`). */
  cloudSyncUserEnabled: boolean;
  /** True after we read `cloud_sync_user_enabled` from the DB. */
  cloudSyncUserPrefReady: boolean;
  /** `EXPO_PUBLIC_POWERSYNC_URL` and build allow the sync stream. */
  cloudSyncCanBeUsed: boolean;
  /** `EXPO_PUBLIC_POWERSYNC_ENABLE_SYNC=0` — sync disabled for this build. */
  cloudSyncBuildDisabled: boolean;
  setCloudSyncUserEnabled: (enabled: boolean) => Promise<void>;
};

const TallyData = createContext<TallyDataContext | null>(null);

const webMinFill: ViewStyle | false =
  Platform.OS === "web"
    ? ({ minHeight: "100vh", width: "100%" } as unknown as ViewStyle)
    : false;

type Open = Awaited<ReturnType<typeof openTallyPowerSync>>;

function makeConnector() {
  return createSupabaseConnector(getDevSupabaseToken);
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<Open | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [cloudUserEnabled, setCloudUserEnabled] = useState(false);
  const [cloudPrefReady, setCloudPrefReady] = useState(false);

  const canUseCloud =
    isPowerSyncConfigured() && !isCloudSyncDisabledByBuildEnv();
  const buildDisabled = isCloudSyncDisabledByBuildEnv();

  // Open local DB; never import native op-sqlite on web (platform file).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const opened = await openTallyPowerSync();
        if (cancelled) return;
        setValue(opened);
        setSyncStatus(opened.powerSync.currentStatus);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // After DB exists: read in-app option, then connect if user and build allow.
  useEffect(() => {
    if (!value) return;
    let c = true;
    void (async () => {
      const raw = await getSetting(
        value.tally,
        SETTINGS_KEYS.cloudSyncUserEnabled,
      );
      const wants = raw === "1" || raw === "true";
      if (!c) return;
      setCloudUserEnabled(wants);
      setCloudPrefReady(true);
      if (wants && canUseCloud) {
        try {
          await value.powerSync.connect(makeConnector());
        } catch {
          // e.g. missing creds; UI still works offline
        }
        if (c) setSyncStatus(value.powerSync.currentStatus);
      }
    })();
    return () => {
      c = false;
    };
  }, [value, canUseCloud]);

  useEffect(() => {
    if (!value) return;
    return value.powerSync.registerListener({
      statusChanged: (s: SyncStatus) => setSyncStatus(s),
    });
  }, [value]);

  const setCloudSyncUserEnabled = useCallback(
    async (enabled: boolean) => {
      if (!value) return;
      setCloudUserEnabled(enabled);
      await setSetting(
        value.tally,
        SETTINGS_KEYS.cloudSyncUserEnabled,
        enabled ? "1" : "0",
      );
      try {
        if (enabled) {
          if (canUseCloud) {
            await value.powerSync.connect(makeConnector());
          }
        } else {
          if (value.powerSync.connected) {
            await value.powerSync.disconnect();
          }
        }
      } catch {
        // stay local-first
      }
    },
    [value, canUseCloud],
  );

  if (error) {
    const needsDevClient =
      error.includes("Base module not found") || error.includes("op-sqlite");
    return (
      <View style={[styles.center, webMinFill]}>
        <Text style={styles.err}>Could not open database</Text>
        <Text style={styles.sub}>{error}</Text>
        {needsDevClient && (
          <Text style={styles.hint}>
            {`This app uses @op-engineering/op-sqlite, which is not included in Expo Go. ` +
              `To run on a device, build a development client: connect the device, ` +
              `then run: npx expo prebuild  then  npx expo run:ios . ` +
              `Open the Tally app that Xcode installs, not the Expo Go app, ` +
              `and connect to the same dev server (QR in the terminal).`}
          </Text>
        )}
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
        powerSync: value.powerSync,
        syncStatus: syncStatus ?? value.powerSync.currentStatus,
        cloudSyncUserEnabled: cloudUserEnabled,
        cloudSyncUserPrefReady: cloudPrefReady,
        cloudSyncCanBeUsed: canUseCloud,
        cloudSyncBuildDisabled: buildDisabled,
        setCloudSyncUserEnabled,
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
