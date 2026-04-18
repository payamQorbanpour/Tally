import { StyleSheet, Text, View } from "react-native";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import { isPowerSyncConfigured } from "../sync/config";

/**
 * Sync row: respects the Account “sync devices” switch and build env.
 */
export function SyncStatusPill() {
  const { t } = useLocale();
  const { syncStatus, cloudSyncUserEnabled, cloudSyncUserPrefReady } =
    useTallyData();
  const { colors } = useTheme();
  const s = syncStatus;

  if (!cloudSyncUserPrefReady) {
    return (
      <View
        style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityRole="text"
      >
        <Text style={[styles.text, { color: colors.muted }]} numberOfLines={1}>
          {t("sync.loading")}
        </Text>
      </View>
    );
  }

  if (!cloudSyncUserEnabled || !isPowerSyncConfigured()) {
    return (
      <View
        style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
        accessibilityRole="text"
      >
        <Text style={[styles.text, { color: colors.muted }]} numberOfLines={1}>
          📱 {t("sync.localFirst")}
        </Text>
      </View>
    );
  }

  const connected = s?.connected;
  const df = s?.dataFlowStatus;
  const uploading = Boolean(df?.uploading);
  const downloading = Boolean(df?.downloading);
  const upErr = df?.uploadError;
  const dlErr = df?.downloadError;

  let line =
    "☁️ " + (connected ? t("sync.lineOnline") : t("sync.lineOffline"));
  if (uploading || downloading) {
    const parts: string[] = [];
    if (downloading) parts.push(t("sync.verbPull"));
    if (uploading) parts.push(t("sync.verbPush"));
    line = t("sync.working", { ops: parts.join(" + ") });
  } else if (connected && s?.hasSynced) {
    line = t("sync.upToDate");
  } else if (upErr || dlErr) {
    line = t("sync.error");
  }

  return (
    <View
      style={[styles.pill, { backgroundColor: colors.surface, borderColor: colors.border }]}
      accessibilityRole="text"
    >
      <Text style={[styles.text, { color: colors.muted }]} numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 6,
  },
  text: { fontSize: 12, fontWeight: "600" },
});
