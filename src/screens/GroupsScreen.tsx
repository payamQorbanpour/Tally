import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../ui/AppText";
import { SwipeableDeleteRow, webMergedDeleteRowContentStyle } from "../ui/SwipeableDeleteRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { isSyncConfigured } from "../sync/config";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList } from "../navigation/types";
import { isValidCurrencyCode } from "../data/currencies";
import {
  createGroup,
  deleteGroup,
  formatMinor,
  getMyBalanceInGroup,
  getOverallBalanceForUser,
  getSetting,
  listGroups,
  listMembers,
  getLocalUserId,
  SETTINGS_KEYS,
  type GroupRow,
} from "../data/tallyRepo";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/** Widen taps on small devices (e.g. iPhone 7) without changing layout. */
const EXTRA_TOUCH_SLOP = { top: 16, bottom: 16, left: 16, right: 16 } as const;

const LOCALE_FOR_TIME: Record<AppLocale, string> = {
  en: "en-US",
  fa: "fa-IR",
  es: "es",
};

function formatGroupCreatedAt(iso: string, appLocale: AppLocale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yNow = new Date().getFullYear();
  return d.toLocaleString(LOCALE_FOR_TIME[appLocale], {
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== yNow ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = NativeStackScreenProps<GroupsStackParamList, "GroupsList">;

type GroupListItem = GroupRow & { myBalanceMinor: number; memberNames: string[] };

function buildGroupsStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 120, gap: 10 },
  listEmpty: { flexGrow: 1, padding: 24, justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center", lineHeight: 22 },
  summaryCard: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.cardRim,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
    gap: 8,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    flex: 1,
  },
  netLine: {
    marginBottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    gap: 8,
  },
  netLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  netAmount: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.2,
  },
  netPos: { color: colors.owed },
  netNeg: { color: colors.owe },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryPill: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 14,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  summaryLabel: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  summaryOwed: { fontSize: 18, fontWeight: "700", color: colors.owed },
  summaryOwe: { fontSize: 18, fontWeight: "700", color: colors.owe },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardDeleting: { opacity: 0.55 },
  cardMain: { padding: 16 },
  cardPressed: { opacity: 0.92 },
  cardTop: {
    flexDirection: isRTL ? "row-reverse" : "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.text, flex: 1, minWidth: 0 },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  cardCurrency: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.inputSurface,
    overflow: "hidden",
  },
  cardCreatedAt: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 6,
    textAlign: isRTL ? "right" : "left",
  },
  disabled: { opacity: 0.4 },
  cardStatus: { fontSize: 14, marginTop: 8, color: colors.text },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.inputSurface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatarLetter: { fontSize: 14, fontWeight: "800", color: colors.text },
  moreAv: { fontSize: 13, color: colors.muted, marginLeft: 4 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabPressed: { opacity: 0.88 },
  fabText: { color: "#fff", fontSize: 32, fontWeight: "300", marginTop: -2 },
  pressed: { opacity: 0.88 },
  addGroupCard: {
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: colors.muted,
    backgroundColor: "transparent",
    paddingVertical: 22,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: isRTL ? "row-reverse" : "row",
    gap: 10,
  },
  addGroupCardEmpty: { marginTop: 20 },
  addGroupLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.primary,
    letterSpacing: 0.2,
  },
});
}

export function GroupsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const bumpGroupsList = useBumpGroupsList();
  const { t, locale, isRTL } = useLocale();
  const { colors } = useTheme();
  const {
    syncState,
    cloudSyncUserEnabled,
    cloudSyncUserPrefReady,
    localUserHasProfileEmail,
    dataRevision,
    refreshCloudData,
  } = useTallyData();
  const styles = useMemo(() => buildGroupsStyles(colors, isRTL), [colors, isRTL]);
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [totals, setTotals] = useState({ owedMinor: 0, owesMinor: 0 });
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [appDefaultCurrency, setAppDefaultCurrency] = useState("USD");
  const loadGen = useRef(0);
  const listRef = useRef<FlatList<GroupListItem>>(null);
  const { refreshing, onRefresh, onScrollWhileRefreshing } =
    useRefreshWithBackgroundSync(refreshCloudData, {
      scrollToTop: () =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    });

  const load = useCallback(async () => {
    const gen = ++loadGen.current;
    const c = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (gen !== loadGen.current) return;
    if (c && isValidCurrencyCode(c)) setAppDefaultCurrency(c);
    const groups = await listGroups(db);
    if (gen !== loadGen.current) return;
    const t = await getOverallBalanceForUser(db, getLocalUserId());
    if (gen !== loadGen.current) return;
    setTotals(t);
    const enriched: GroupListItem[] = [];
    for (const g of groups) {
      const myBalanceMinor = await getMyBalanceInGroup(db, g.id, getLocalUserId());
      const members = await listMembers(db, g.id);
      enriched.push({
        ...g,
        myBalanceMinor,
        memberNames: members.map((m) => m.name),
      });
    }
    if (gen !== loadGen.current) return;
    setItems(enriched);
  }, [db]);

  useEffect(() => {
    void load();
  }, [load, dataRevision]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const [creatingDefaultGroup, setCreatingDefaultGroup] = useState(false);
  const fabPress = async () => {
    const latestGroupId = items[0]?.id;
    if (latestGroupId) {
      navigation.navigate("AddExpense", { groupId: latestGroupId });
      return;
    }
    if (creatingDefaultGroup) return;
    setCreatingDefaultGroup(true);
    try {
      const id = await createGroup(db, {
        name: t("nav.newGroup"),
        currency: appDefaultCurrency,
        icon: null,
        groupType: "other",
        simplifyDebts: true,
        members: [],
      });
      bumpGroupsList();
      navigation.navigate("AddExpense", { groupId: id });
    } finally {
      setCreatingDefaultGroup(false);
    }
  };

  const summaryCurrency = useMemo(
    () => items[0]?.currency ?? appDefaultCurrency,
    [items, appDefaultCurrency],
  );

  const cloudConfigured = isSyncConfigured();
  const listSyncIcon = (() => {
    if (!cloudSyncUserPrefReady) {
      return { name: "cloud-outline" as const, color: colors.muted, dim: 0.45 as const };
    }
    if (!cloudSyncUserEnabled || !cloudConfigured || !localUserHasProfileEmail) {
      return { name: "phone-portrait-outline" as const, color: colors.muted, dim: 0.7 as const };
    }
    if (syncState.lastError) {
      return { name: "cloud-offline" as const, color: colors.owe, dim: 1 as const };
    }
    if (syncState.busy) {
      return { name: "sync" as const, color: colors.primary, dim: 1 as const };
    }
    if (syncState.lastOkAt != null) {
      return { name: "cloud-done-outline" as const, color: colors.primary, dim: 1 as const };
    }
    return { name: "cloud-outline" as const, color: colors.muted, dim: 0.85 as const };
  })();

  const performDeleteGroup = async (groupId: string) => {
    setDeletingGroupId(groupId);
    try {
      await deleteGroup(db, groupId);
      bumpGroupsList();
      await load();
    } finally {
      setDeletingGroupId(null);
    }
  };

  const confirmDeleteGroup = (g: GroupListItem) => {
    const msg = t("groupList.deleteConfirm", { name: g.name });
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(msg)) {
        void performDeleteGroup(g.id);
      }
      return;
    }
    Alert.alert(t("groupList.alertDeleteGroup"), msg, [
      { text: t("friends.cancel"), style: "cancel" },
      {
        text: t("groupList.delete"),
        style: "destructive",
        onPress: () => void performDeleteGroup(g.id),
      },
    ]);
  };

  return (
    <View style={styles.wrap}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(item) => item.id}
        removeClippedSubviews={false}
        alwaysBounceVertical
        onScroll={onScrollWhileRefreshing}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <View style={styles.summaryHeader}>
              <Text style={styles.summaryTitle}>{t("groupList.totalBalance")}</Text>
              <View
                style={{ opacity: listSyncIcon.dim }}
                accessibilityLabel={t("groupDetail.a11ySyncStatus")}
                accessibilityRole="text"
              >
                <Ionicons
                  name={listSyncIcon.name}
                  size={16}
                  color={listSyncIcon.color}
                />
              </View>
            </View>
            <View style={styles.netLine}>
              <Text style={styles.netLabel}>{t("groupList.net")}</Text>
              <Text
                style={[
                  styles.netAmount,
                  totals.owedMinor - totals.owesMinor > 0 && styles.netPos,
                  totals.owedMinor - totals.owesMinor < 0 && styles.netNeg,
                ]}
              >
                {formatMinor(
                  totals.owedMinor - totals.owesMinor,
                  summaryCurrency,
                )}
              </Text>
            </View>
            <View style={styles.summaryRow}>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>{t("groupList.youAreOwed")}</Text>
                <Text style={styles.summaryOwed}>
                  {formatMinor(totals.owedMinor, summaryCurrency)}
                </Text>
              </View>
              <View style={styles.summaryPill}>
                <Text style={styles.summaryLabel}>{t("groupList.youOwe")}</Text>
                <Text style={styles.summaryOwe}>
                  {formatMinor(totals.owesMinor, summaryCurrency)}
                </Text>
              </View>
            </View>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.empty}>{t("groupList.empty")}</Text>
        }
        ListFooterComponent={
          <Pressable
            style={({ pressed }) => [
              styles.addGroupCard,
              items.length === 0 && styles.addGroupCardEmpty,
              pressed && styles.cardPressed,
            ]}
            onPress={() => navigation.navigate("CreateGroup")}
            accessibilityRole="button"
            accessibilityLabel={t("nav.newGroup")}
          >
            <Ionicons name="add" size={22} color={colors.primary} />
            <Text style={styles.addGroupLabel}>{t("nav.newGroup")}</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const deleting = deletingGroupId === item.id;
          const deleteLocked = deletingGroupId !== null;
          return (
            <SwipeableDeleteRow
              isRTL={isRTL}
              cardEdgeRadius={14}
              disabled={deleting || deleteLocked}
              onRequestDelete={() => confirmDeleteGroup(item)}
              accessibilityLabel={t("groupList.deleteGroupA11y", { name: item.name })}
            >
            <View
              style={[
                styles.card,
                deleting && styles.cardDeleting,
                Platform.OS === "web" && webMergedDeleteRowContentStyle(isRTL, 14),
              ]}
            >
                <Pressable
                  style={({ pressed }) => [
                    styles.cardMain,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() =>
                    navigation.navigate("GroupDetail", { groupId: item.id })
                  }
                  disabled={deleting}
                >
                  <View style={styles.cardTop}>
                    <AutoDirectionText
                      style={styles.cardTitle}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.name}
                    </AutoDirectionText>
                    <View style={styles.cardTopRight}>
                      <Text style={styles.cardCurrency}>{item.currency}</Text>
                    </View>
                  </View>
                  {(() => {
                    const when = formatGroupCreatedAt(item.created_at, locale);
                    if (!when) return null;
                    return (
                      <Text style={styles.cardCreatedAt}>
                        {t("groupList.createdAt", { when })}
                      </Text>
                    );
                  })()}
                  <Text style={styles.cardStatus}>{statusLine(item, t)}</Text>
                  <View style={styles.avatarRow}>
                    {item.memberNames.slice(0, 5).map((n, i) => (
                      <View key={`${item.id}-${i}`} style={styles.avatar}>
                        <Text style={styles.avatarLetter}>{initial(n)}</Text>
                      </View>
                    ))}
                    {item.memberNames.length > 5 ? (
                      <Text style={styles.moreAv}>
                        +{item.memberNames.length - 5}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
            </View>
            </SwipeableDeleteRow>
          );
        }}
        contentContainerStyle={
          items.length === 0 ? styles.listEmpty : styles.list
        }
      />
      <Pressable
        style={({ pressed }) => [
          styles.fab,
          pressed && styles.fabPressed,
          { bottom: Math.max(24, 12 + insets.bottom) },
        ]}
        onPress={fabPress}
        hitSlop={EXTRA_TOUCH_SLOP}
        accessibilityRole="button"
        accessibilityLabel={
          items.length > 0 ? t("nav.addExpense") : t("nav.newGroup")
        }
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

function initial(name: string): string {
  const t = name.trim();
  return t ? t.slice(0, 1).toUpperCase() : "?";
}

function statusLine(
  item: GroupListItem,
  t: (path: string, vars?: Record<string, string>) => string,
): string {
  const c = item.currency;
  const b = item.myBalanceMinor;
  if (b === 0) return t("groupList.statusSettled");
  if (b > 0)
    return t("groupList.statusYouAreOwed", { amount: formatMinor(b, c) });
  return t("groupList.statusYouOwe", { amount: formatMinor(-b, c) });
}

