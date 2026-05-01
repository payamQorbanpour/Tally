import { useFocusEffect } from "@react-navigation/native";
import type { CompositeScreenProps } from "@react-navigation/native";
import type { BottomTabScreenProps } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  FlatList,
  Modal,
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
import { PersonAvatar } from "../components/PersonAvatar";
import { useLocalUserAvatar } from "../hooks/useLocalUserAvatar";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { isSyncConfigured } from "../sync/config";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList, MainTabParamList } from "../navigation/types";
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
  type OverallBalanceByCurrency,
} from "../data/tallyRepo";
import { useTheme } from "../theme/ThemeContext";
import { useTourTarget } from "../hooks/useTourTarget";
import { useAutoStartTour } from "../providers/TourContext";
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

type Props = CompositeScreenProps<
  NativeStackScreenProps<GroupsStackParamList, "GroupsList">,
  BottomTabScreenProps<MainTabParamList>
>;

type GroupListItem = GroupRow & {
  myBalanceMinor: number;
  memberNames: string[];
  members: { id: string; name: string }[];
};

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
  ccyPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.owedSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.primary,
    flexShrink: 0,
  },
  ccyPillLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: colors.primary,
    letterSpacing: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: "55%",
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  ccyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  ccyRowLast: { borderBottomWidth: 0 },
  ccyRowCode: { fontSize: 15, fontWeight: "700", color: colors.text, width: 60 },
  ccyRowNet: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.muted,
    fontVariant: ["tabular-nums"],
  },
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
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.cardRim,
    overflow: "hidden",
  },
  cardDeleting: { opacity: 0.55 },
  cardMain: {
    flexDirection: isRTL ? "row-reverse" : "row",
    alignItems: "flex-start",
    gap: 14,
    padding: 16,
  },
  cardPressed: { opacity: 0.92 },
  /** Leading category-icon tile (home / airplane / etc.) */
  cardIconTile: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.owedSoft,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardMainCol: { flex: 1, minWidth: 0 },
  cardTop: {
    flexDirection: isRTL ? "row-reverse" : "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  cardTitle: { fontSize: 17, fontWeight: "700", color: colors.text, flex: 1, minWidth: 0 },
  cardTopRight: {
    flexDirection: isRTL ? "row-reverse" : "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
  cardCurrency: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.muted,
    letterSpacing: 0.3,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: colors.inputSurface,
    overflow: "hidden",
  },
  cardCreatedAt: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
    textAlign: isRTL ? "right" : "left",
  },
  disabled: { opacity: 0.4 },
  cardStatus: {
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
    color: colors.primary,
    textAlign: isRTL ? "right" : "left",
  },
  cardStatusOwe: { color: colors.owe },
  cardStatusSettled: { color: colors.muted, fontWeight: "500" },
  avatarRow: {
    flexDirection: isRTL ? "row-reverse" : "row",
    alignItems: "center",
    marginTop: 12,
    gap: 6,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.owedSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: { fontSize: 12, fontWeight: "700", color: colors.primary },
  avatarOverflow: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.inputSurface,
    marginLeft: isRTL ? 0 : 2,
    marginRight: isRTL ? 2 : 0,
  },
  avatarOverflowText: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.muted,
  },
  fabPill: {
    position: "absolute",
    right: 20,
    bottom: 24,
    flexDirection: isRTL ? "row-reverse" : "row",
    alignItems: "center",
    backgroundColor: colors.primary,
    borderRadius: 28,
    height: 56,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabPillHalf: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  },
  fabPillMic: {},
  fabPillPlus: {},
  fabPillDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.35)",
  },
  fabPressed: { opacity: 0.8 },
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
  const { userId: myId, avatarUri: myAvatarUri } = useLocalUserAvatar();
  // Anchor for the in-app tour: spotlights the FAB pill on step 2.
  const fabTour = useTourTarget("fab");
  // First-run tour auto-start. Only Home owns this trigger; the hook guards
  // against duplicate starts and persistence keeps it from replaying.
  useAutoStartTour({ enabled: true });
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [totals, setTotals] = useState<OverallBalanceByCurrency[]>([]);
  const [selectedSummaryCurrency, setSelectedSummaryCurrency] = useState<string | null>(null);
  const [summaryCurrencyPickerOpen, setSummaryCurrencyPickerOpen] = useState(false);
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
        members: members.map((m) => ({ id: m.id, name: m.name })),
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
  const ensureDefaultGroupId = useCallback(async (): Promise<string | null> => {
    const latestGroupId = items[0]?.id;
    if (latestGroupId) return latestGroupId;
    if (creatingDefaultGroup) return null;
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
      return id;
    } finally {
      setCreatingDefaultGroup(false);
    }
  }, [appDefaultCurrency, bumpGroupsList, creatingDefaultGroup, db, items, t]);

  const onManualFabPress = async () => {
    const id = await ensureDefaultGroupId();
    if (!id) return;
    navigation.navigate("AddExpense", { groupId: id });
  };

  const onMicFabPress = async () => {
    const id = await ensureDefaultGroupId();
    if (!id) return;
    navigation.navigate("AiReceipt", { autoRecord: true });
  };

  const summaryRows = useMemo<OverallBalanceByCurrency[]>(
    () =>
      totals.length > 0
        ? totals
        : [{ currency: appDefaultCurrency, owedMinor: 0, owesMinor: 0 }],
    [totals, appDefaultCurrency],
  );

  // Keep `selectedSummaryCurrency` valid whenever the available currency set
  // changes (e.g. the last group in a currency was deleted).
  useEffect(() => {
    if (summaryRows.length === 0) return;
    if (
      selectedSummaryCurrency &&
      summaryRows.some((r) => r.currency === selectedSummaryCurrency)
    ) {
      return;
    }
    setSelectedSummaryCurrency(summaryRows[0]!.currency);
  }, [selectedSummaryCurrency, summaryRows]);

  const activeSummaryRow = useMemo<OverallBalanceByCurrency>(
    () =>
      summaryRows.find((r) => r.currency === selectedSummaryCurrency) ??
      summaryRows[0]!,
    [summaryRows, selectedSummaryCurrency],
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
              {summaryRows.length > 1 ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.ccyPill,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => setSummaryCurrencyPickerOpen(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t("groupList.pickSummaryCurrency")}
                  hitSlop={EXTRA_TOUCH_SLOP}
                >
                  <Text style={styles.ccyPillLabel}>
                    {activeSummaryRow.currency}
                  </Text>
                  <Ionicons name="chevron-down" size={14} color={colors.primary} />
                </Pressable>
              ) : null}
            </View>
            {(() => {
              const row = activeSummaryRow;
              const net = row.owedMinor - row.owesMinor;
              return (
                <View key={row.currency}>
                  <View style={styles.netLine}>
                    <Text style={styles.netLabel}>{t("groupList.net")}</Text>
                    <Text
                      style={[
                        styles.netAmount,
                        net > 0 && styles.netPos,
                        net < 0 && styles.netNeg,
                      ]}
                    >
                      {formatMinor(net, row.currency)}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <View style={styles.summaryPill}>
                      <Text style={styles.summaryLabel}>
                        {t("groupList.youAreOwed")}
                      </Text>
                      <Text style={styles.summaryOwed}>
                        {formatMinor(row.owedMinor, row.currency)}
                      </Text>
                    </View>
                    <View style={styles.summaryPill}>
                      <Text style={styles.summaryLabel}>
                        {t("groupList.youOwe")}
                      </Text>
                      <Text style={styles.summaryOwe}>
                        {formatMinor(row.owesMinor, row.currency)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })()}
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
                  <View style={styles.cardIconTile}>
                    <Ionicons
                      name={iconForGroupType(item.group_type)}
                      size={22}
                      color={colors.primary}
                    />
                  </View>
                  <View style={styles.cardMainCol}>
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
                    <Text
                      style={[
                        styles.cardStatus,
                        item.myBalanceMinor < 0 && styles.cardStatusOwe,
                        item.myBalanceMinor === 0 && styles.cardStatusSettled,
                      ]}
                    >
                      {statusLine(item, t)}
                    </Text>
                    <View style={styles.avatarRow}>
                      {item.members.slice(0, 4).map((m, i) => (
                        <PersonAvatar
                          key={`${item.id}-${m.id}-${i}`}
                          name={m.name}
                          avatarUri={m.id === myId ? myAvatarUri : null}
                          size={28}
                          containerStyle={styles.avatar}
                          letterStyle={styles.avatarLetter}
                          letterOverride={initial(m.name)}
                        />
                      ))}
                      {item.members.length > 4 ? (
                        <View style={styles.avatarOverflow}>
                          <Text style={styles.avatarOverflowText}>
                            +{item.members.length - 4}
                          </Text>
                        </View>
                      ) : null}
                    </View>
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
      <View
        ref={fabTour.ref}
        onLayout={fabTour.onLayout}
        collapsable={false}
        style={[
          styles.fabPill,
          { bottom: Math.max(24, 12 + insets.bottom) },
        ]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.fabPillHalf,
            styles.fabPillMic,
            pressed && styles.fabPressed,
          ]}
          onPress={onMicFabPress}
          hitSlop={EXTRA_TOUCH_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t("groupList.fabMicA11y")}
        >
          <Ionicons name="mic" size={22} color="#fff" />
        </Pressable>
        <View style={styles.fabPillDivider} pointerEvents="none" />
        <Pressable
          style={({ pressed }) => [
            styles.fabPillHalf,
            styles.fabPillPlus,
            pressed && styles.fabPressed,
          ]}
          onPress={onManualFabPress}
          hitSlop={EXTRA_TOUCH_SLOP}
          accessibilityRole="button"
          accessibilityLabel={
            items.length > 0 ? t("nav.addExpense") : t("nav.newGroup")
          }
        >
          <Text style={styles.fabText}>+</Text>
        </Pressable>
      </View>

      <Modal
        visible={summaryCurrencyPickerOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSummaryCurrencyPickerOpen(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSummaryCurrencyPickerOpen(false)}
        >
          <View
            style={[styles.modalSheet, { paddingBottom: 16 + insets.bottom }]}
          >
            <Text style={styles.modalTitle}>
              {t("groupList.pickSummaryCurrency")}
            </Text>
            {summaryRows.map((row, idx) => {
              const active = row.currency === activeSummaryRow.currency;
              const isLast = idx === summaryRows.length - 1;
              return (
                <Pressable
                  key={row.currency}
                  style={[styles.ccyRow, isLast && styles.ccyRowLast]}
                  onPress={() => {
                    setSelectedSummaryCurrency(row.currency);
                    setSummaryCurrencyPickerOpen(false);
                  }}
                >
                  <Text style={styles.ccyRowCode}>{row.currency}</Text>
                  <Text style={styles.ccyRowNet} numberOfLines={1}>
                    {formatMinor(
                      row.owedMinor - row.owesMinor,
                      row.currency,
                    )}
                  </Text>
                  {active ? (
                    <Ionicons
                      name="checkmark-circle"
                      size={20}
                      color={colors.primary}
                    />
                  ) : (
                    <Ionicons
                      name="ellipse-outline"
                      size={20}
                      color={colors.muted}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function initial(name: string): string {
  const t = name.trim();
  return t ? t.slice(0, 1).toUpperCase() : "?";
}

function iconForGroupType(
  groupType: GroupRow["group_type"],
): keyof typeof Ionicons.glyphMap {
  if (groupType === "home") return "home-outline";
  if (groupType === "trip") return "airplane-outline";
  if (groupType === "couple") return "heart-outline";
  return "people-outline";
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

