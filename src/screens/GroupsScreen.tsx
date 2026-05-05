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
import { CategoryTile } from "../ui/CategoryTile";
import { SwipeableDeleteRow, webMergedDeleteRowContentStyle } from "../ui/SwipeableDeleteRow";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { isSyncConfigured } from "../sync/config";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList, MainTabParamList } from "../navigation/types";
import { formatMinorWithSymbol, isValidCurrencyCode } from "../data/currencies";
import {
  deleteGroup,
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
import { useAutoStartTour } from "../providers/TourContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";

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

function buildGroupsStyles(
  colors: ThemeColors,
  isRTL: boolean,
  cardShadow: ShadowStyle,
) {
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    list: { padding: 20, paddingBottom: 120, gap: 12 },
    listEmpty: { flexGrow: 1, padding: 24, justifyContent: "center" },
    empty: { color: colors.muted, textAlign: "center", lineHeight: 22 },

    /* ── Net summary card ─────────────────────────────────────────── */
    summaryCard: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      padding: 18,
      marginBottom: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      ...cardShadow,
    },
    summaryHeader: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
    },
    summaryEyebrow: {
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.5,
    },
    netLine: {
      marginTop: 4,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "baseline",
      flexWrap: "wrap",
      gap: 6,
    },
    netAmount: {
      fontSize: 34,
      fontWeight: "800",
      color: colors.owed,
      letterSpacing: -0.5,
      fontVariant: ["tabular-nums"],
    },
    netSuffix: {
      fontSize: 13,
      color: colors.muted,
      fontWeight: "600",
    },
    netNeg: { color: colors.owe },
    netZero: { color: colors.text },

    summaryRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      gap: 10,
      marginTop: 14,
    },
    summaryPill: {
      flex: 1,
      borderRadius: 12,
      padding: 12,
    },
    summaryPillOwed: { backgroundColor: colors.owedSoft },
    summaryPillOwe: { backgroundColor: colors.oweSoft },
    summaryLabelOwed: {
      fontSize: 11,
      color: colors.primary,
      marginBottom: 4,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    summaryLabelOwe: {
      fontSize: 11,
      color: colors.owe,
      marginBottom: 4,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    summaryOwed: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.owed,
      letterSpacing: -0.2,
      fontVariant: ["tabular-nums"],
    },
    summaryOwe: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.owe,
      letterSpacing: -0.2,
      fontVariant: ["tabular-nums"],
    },

    /* ── Currency picker pill (inline beside the eyebrow) ─────────── */
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

    /* ── Group rows ───────────────────────────────────────────────── */
    /**
     * Outer shadow shell — `SwipeableDeleteRow` wraps its content with
     * `overflow: hidden`, which would clip an inner card's shadow. We hoist
     * the shadow out to this shell so the float still reads on iOS.
     */
    cardShell: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      ...cardShadow,
    },
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
      alignItems: "center",
      gap: 12,
      padding: 14,
    },
    cardPressed: { opacity: 0.92 },
    cardMainCol: { flex: 1, minWidth: 0 },
    cardTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
    },
    cardMeta: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
      textAlign: isRTL ? "right" : "left",
    },
    cardAmountCol: {
      alignItems: isRTL ? "flex-start" : "flex-end",
      flexShrink: 0,
    },
    cardAmountKicker: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.4,
    },
    cardAmountKickerOwed: { color: colors.primary },
    cardAmountKickerOwe: { color: colors.owe },
    cardAmount: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.owed,
      letterSpacing: -0.2,
      marginTop: 2,
      fontVariant: ["tabular-nums"],
    },
    cardAmountOwe: { color: colors.owe },
    cardAmountSettled: { color: colors.muted, fontWeight: "600" },

    /* ── New group dashed footer ──────────────────────────────────── */
    addGroupCard: {
      borderRadius: 16,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: colors.border,
      backgroundColor: "transparent",
      paddingVertical: 18,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: isRTL ? "row-reverse" : "row",
      gap: 8,
    },
    addGroupCardEmpty: { marginTop: 20 },
    addGroupLabel: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.muted,
    },

    /* ── Currency picker modal ────────────────────────────────────── */
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
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      marginBottom: 8,
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
  });
}

export function GroupsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const bumpGroupsList = useBumpGroupsList();
  const { t, locale, isRTL } = useLocale();
  const { colors, shadows } = useTheme();
  const {
    syncState,
    cloudSyncUserEnabled,
    cloudSyncUserPrefReady,
    localUserHasProfileEmail,
    dataRevision,
    refreshCloudData,
  } = useTallyData();
  const styles = useMemo(
    () => buildGroupsStyles(colors, isRTL, shadows.card),
    [colors, isRTL, shadows.card],
  );
  // First-run tour auto-start moved to AddExpense — that's the new home of
  // the first-run flow (no forced "create a group first" step). Leaving the
  // trigger here would race the AddExpense one when both screens mount.
  useAutoStartTour({ enabled: false });
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

  /**
   * FAB routing for plus/mic now lives in `MainTabs.GlobalFab` so the FAB
   * stays in one place across tabs. Per-screen wiring is no longer needed.
   */

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
              <Text
                style={styles.summaryEyebrow}
                accessibilityRole="text"
              >
                {t("groupList.netBalance").toUpperCase()}
              </Text>
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
              const sign = net > 0 ? "+" : net < 0 ? "−" : "";
              return (
                <View key={row.currency}>
                  <View style={styles.netLine}>
                    <Text
                      style={[
                        styles.netAmount,
                        net < 0 && styles.netNeg,
                        net === 0 && styles.netZero,
                      ]}
                      numberOfLines={1}
                    >
                      {sign}
                      {formatMinorWithSymbol(Math.abs(net), row.currency)}
                    </Text>
                    <Text style={styles.netSuffix}>
                      {t("groupList.acrossGroups", {
                        count: String(items.length),
                      })}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <View style={[styles.summaryPill, styles.summaryPillOwed]}>
                      <Text style={styles.summaryLabelOwed}>
                        {t("groupList.peopleOweYou").toUpperCase()}
                      </Text>
                      <Text style={styles.summaryOwed}>
                        {formatMinorWithSymbol(row.owedMinor, row.currency)}
                      </Text>
                    </View>
                    <View style={[styles.summaryPill, styles.summaryPillOwe]}>
                      <Text style={styles.summaryLabelOwe}>
                        {t("groupList.youOwe").toUpperCase()}
                      </Text>
                      <Text style={styles.summaryOwe}>
                        {formatMinorWithSymbol(row.owesMinor, row.currency)}
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
            <Ionicons name="add-circle-outline" size={18} color={colors.muted} />
            <Text style={styles.addGroupLabel}>{t("nav.newGroup")}</Text>
          </Pressable>
        }
        renderItem={({ item }) => {
          const deleting = deletingGroupId === item.id;
          const deleteLocked = deletingGroupId !== null;
          const memberCount = item.members.length;
          const when = formatGroupCreatedAt(item.created_at, locale);
          const meta =
            memberCount > 0 && when
              ? `${memberCount} · ${when}`
              : when || `${memberCount}`;
          return (
            <View style={styles.cardShell}>
              <SwipeableDeleteRow
                isRTL={isRTL}
                cardEdgeRadius={16}
                disabled={deleting || deleteLocked}
                onRequestDelete={() => confirmDeleteGroup(item)}
                accessibilityLabel={t("groupList.deleteGroupA11y", { name: item.name })}
              >
              <View
                style={[
                  styles.card,
                  deleting && styles.cardDeleting,
                  Platform.OS === "web" && webMergedDeleteRowContentStyle(isRTL, 16),
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
                  <CategoryTile
                    icon={iconForGroupType(item.group_type)}
                    size={46}
                    radius={13}
                    iconSize={22}
                  />
                  <View style={styles.cardMainCol}>
                    <AutoDirectionText
                      style={styles.cardTitle}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {item.name}
                    </AutoDirectionText>
                    <Text style={styles.cardMeta} numberOfLines={1}>
                      {meta}
                    </Text>
                  </View>
                  <View style={styles.cardAmountCol}>
                    <Text
                      style={[
                        styles.cardAmountKicker,
                        item.myBalanceMinor > 0 && styles.cardAmountKickerOwed,
                        item.myBalanceMinor < 0 && styles.cardAmountKickerOwe,
                      ]}
                    >
                      {amountKicker(item, t).toUpperCase()}
                    </Text>
                    <Text
                      style={[
                        styles.cardAmount,
                        item.myBalanceMinor < 0 && styles.cardAmountOwe,
                        item.myBalanceMinor === 0 &&
                          styles.cardAmountSettled,
                      ]}
                      numberOfLines={1}
                    >
                      {formatMinorWithSymbol(
                        Math.abs(item.myBalanceMinor),
                        item.currency,
                      )}
                    </Text>
                  </View>
                </Pressable>
              </View>
              </SwipeableDeleteRow>
            </View>
          );
        }}
        contentContainerStyle={
          items.length === 0 ? styles.listEmpty : styles.list
        }
      />

      {/* FAB lives in the global MainTabs.GlobalFab — the tour ref is wired
          there too, so we don't render a per-screen FAB here. */}

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
              {t("groupList.pickSummaryCurrency").toUpperCase()}
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
                    {formatMinorWithSymbol(
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

function iconForGroupType(
  groupType: GroupRow["group_type"],
): keyof typeof Ionicons.glyphMap {
  if (groupType === "home") return "home-outline";
  if (groupType === "trip") return "airplane-outline";
  if (groupType === "couple") return "heart-outline";
  return "people-outline";
}

/** UPPERCASE caption shown above the right-aligned row amount. */
function amountKicker(
  item: GroupListItem,
  t: (path: string, vars?: Record<string, string>) => string,
): string {
  const b = item.myBalanceMinor;
  if (b === 0) return t("groupList.rowSettled");
  if (b > 0) return t("groupList.rowYouLent");
  return t("groupList.rowYouOwe");
}
