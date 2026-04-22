import Ionicons from "@expo/vector-icons/Ionicons";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { isSyncConfigured } from "../sync/config";

/** Same as the mobile tab bar "Home" (Groups) icon in `MainTabs`. */
export const SYNC_STATUS_HOME_ICON: keyof typeof Ionicons.glyphMap = "home-outline";

export type SyncStatusDisplay = {
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
};

/** One-line cloud sync status for Account (Settings): icon + text, no emojis. */
export function useSyncStatusDisplay(): SyncStatusDisplay {
  const { t } = useLocale();
  const {
    syncState,
    cloudSyncUserEnabled,
    cloudSyncUserPrefReady,
    localUserHasProfileEmail,
    cloudSyncPremiumBlocked,
  } = useTallyData();

  if (!cloudSyncUserPrefReady) {
    return { text: t("sync.loading"), icon: "ellipsis-horizontal" };
  }

  if (!cloudSyncUserEnabled || !isSyncConfigured() || !localUserHasProfileEmail) {
    return { text: t("sync.localFirst"), icon: SYNC_STATUS_HOME_ICON };
  }

  if (cloudSyncPremiumBlocked) {
    return { text: t("sync.premiumRequired"), icon: "star-outline" };
  }

  if (syncState.lastError) {
    return { text: t("sync.statusPending"), icon: "cloud-outline" };
  }
  if (syncState.busy) {
    return { text: t("sync.working", { ops: t("sync.verbSync") }), icon: "cloud-outline" };
  }
  if (syncState.lastOkAt != null) {
    return { text: t("sync.upToDate"), icon: "checkmark-circle-outline" };
  }
  return { text: t("sync.lineOnline"), icon: "cloud-outline" };
}
