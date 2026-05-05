import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  type SectionListData,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../ui/AppText";
import { EmptyState } from "../ui/EmptyState";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import {
  type ActivityFeedItem,
  getLocalUserProfile,
  listActivityFeed,
  type LocalUserProfile,
} from "../data/tallyRepo";
import { formatMinorWithSymbol } from "../data/currencies";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";

const LOCALE_FOR_TIME: Record<AppLocale, string> = {
  en: "en-US",
  fa: "fa-IR",
  es: "es",
};

type TabKey = "all" | "expenses" | "payments" | "settlements";

type ActivitySection = {
  key: string;
  title: string;
  data: ActivityFeedItem[];
};

/** Day-bucket key used to group items into Today / Yesterday / older buckets. */
function dayBucketKey(iso: string): { key: string; ts: number } {
  const d = new Date(iso);
  const ts = Number.isNaN(d.getTime()) ? 0 : d.getTime();
  const local = new Date(ts);
  const y = local.getFullYear();
  const m = local.getMonth();
  const day = local.getDate();
  return { key: `${y}-${m}-${day}`, ts: new Date(y, m, day).getTime() };
}

function dayBucketLabel(
  bucketTs: number,
  appLocale: AppLocale,
  t: (k: string, vars?: Record<string, string>) => string,
): string {
  const today = new Date();
  const todayBucket = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (bucketTs === todayBucket) return t("activity.dayToday");
  if (bucketTs === todayBucket - oneDay) return t("activity.dayYesterday");
  const d = new Date(bucketTs);
  const yNow = today.getFullYear();
  return d.toLocaleDateString(LOCALE_FOR_TIME[appLocale], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: d.getFullYear() !== yNow ? "numeric" : undefined,
  });
}

function relativeTime(
  iso: string,
  appLocale: AppLocale,
  t: (k: string, vars?: Record<string, string>) => string,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diffMs = Date.now() - d.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return t("activity.relJustNow");
  if (min < 60) return t("activity.relMinutes", { n: String(min) });
  const hr = Math.round(min / 60);
  if (hr < 24) return t("activity.relHours", { n: String(hr) });
  return d.toLocaleDateString(LOCALE_FOR_TIME[appLocale], {
    month: "short",
    day: "numeric",
  });
}

type RowKind = "expense-you-added" | "expense-other-paid" | "expense-you-paid"
  | "settlement-sent" | "settlement-received" | "group";

function classifyRow(
  item: ActivityFeedItem,
  meName: string,
): RowKind {
  if (item.kind === "group") return "group";
  if (item.kind === "expense") {
    if (item.payerName === meName) return "expense-you-added";
    return "expense-other-paid";
  }
  if (item.fromName === meName) return "settlement-sent";
  if (item.toName === meName) return "settlement-received";
  return "settlement-sent";
}

function buildActivityStyles(
  colors: ThemeColors,
  isRTL: boolean,
  cardShadow: ShadowStyle,
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    column: { width: "100%", maxWidth: 640, alignSelf: "center" },

    /* ── Header ──────────────────────────────────────────────────── */
    titleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 4,
      paddingBottom: 8,
    },
    title: {
      flex: 1,
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      ...te,
    },
    /* ── Filter chips ────────────────────────────────────────────── */
    tabsRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 4,
      gap: 8,
    },
    tabBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
    },
    tabBtnActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    tabText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
    },
    tabTextActive: {
      color: "#fff",
    },

    /* ── Section group card ──────────────────────────────────────── */
    sectionWrap: {
      paddingHorizontal: 20,
      paddingTop: 18,
    },
    sectionEyebrow: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.6,
      marginBottom: 8,
      paddingLeft: 4,
      ...te,
    },
    sectionCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      overflow: "hidden",
      ...cardShadow,
    },

    /* ── Row ─────────────────────────────────────────────────────── */
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    leadTile: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 1,
    },
    leadTileNeutral: {
      backgroundColor: colors.inputSurface,
    },
    leadTileLetter: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.primary,
    },
    rowTextCol: { flex: 1, minWidth: 0 },
    rowPrimary: {
      fontSize: 14,
      color: colors.text,
      lineHeight: 20,
    },
    rowPrimaryActor: { fontWeight: "800" },
    rowPrimaryEmphasis: { fontWeight: "700" },
    rowPrimaryMuted: { color: colors.muted },
    rowTime: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 3,
    },

    /* ── Right-side amount pill / chevron ────────────────────────── */
    amountPill: {
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      marginTop: 4,
    },
    amountPillPositive: { backgroundColor: colors.owedSoft },
    amountPillNegative: { backgroundColor: colors.oweSoft },
    amountPillNeutral: { backgroundColor: colors.inputSurface },
    amountPillText: {
      fontSize: 12,
      fontWeight: "800",
      fontVariant: ["tabular-nums"],
    },
    amountPillTextPositive: { color: colors.owed },
    amountPillTextNegative: { color: colors.owe },
    amountPillTextNeutral: { color: colors.muted },
    chevron: {
      marginTop: 10,
    },

    centerEmpty: {
      paddingHorizontal: 16,
      paddingVertical: 32,
    },
    pressed: { opacity: 0.85 },
  });
}

export function ActivityScreen() {
  const db = useDatabase();
  const { dataRevision, refreshCloudData } = useTallyData();
  const insets = useSafeAreaInsets();
  const { colors, shadows } = useTheme();
  const { t, locale, isRTL } = useLocale();
  const styles = useMemo(
    () => buildActivityStyles(colors, isRTL, shadows.card),
    [colors, isRTL, shadows.card],
  );
  const [items, setItems] = useState<ActivityFeedItem[] | null>(null);
  const [me, setMe] = useState<LocalUserProfile | null>(null);
  const [tab, setTab] = useState<TabKey>("all");
  const listRef = useRef<SectionList<ActivityFeedItem, ActivitySection>>(null);
  const tabsScrollRef = useRef<ScrollView>(null);
  const { refreshing, onRefresh, onScrollWhileRefreshing } =
    useRefreshWithBackgroundSync(refreshCloudData, {
      scrollToTop: () =>
        listRef.current?.scrollToLocation({
          sectionIndex: 0,
          itemIndex: 0,
          animated: true,
        }),
    });

  const load = useCallback(async () => {
    const [list, profile] = await Promise.all([
      listActivityFeed(db),
      getLocalUserProfile(db),
    ]);
    setItems(list);
    setMe(profile);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load, dataRevision]);

  const tabs: { key: TabKey; label: string }[] = useMemo(
    () => [
      { key: "all", label: t("activity.tabAll") },
      { key: "expenses", label: t("activity.tabExpenses") },
      { key: "payments", label: t("activity.tabPayments") },
      { key: "settlements", label: t("activity.tabSettlements") },
    ],
    [t],
  );

  const meName = me?.name?.trim() || "You";

  const sections = useMemo<ActivitySection[]>(() => {
    if (!items) return [];
    const filtered = items.filter((it) => {
      if (tab === "all") return true;
      if (tab === "expenses") return it.kind === "expense";
      if (tab === "payments") return it.kind === "settlement";
      if (tab === "settlements") return it.kind === "settlement";
      return true;
    });

    const buckets = new Map<string, { ts: number; data: ActivityFeedItem[] }>();
    for (const it of filtered) {
      const { key, ts } = dayBucketKey(it.at);
      const cur = buckets.get(key) ?? { ts, data: [] };
      cur.data.push(it);
      buckets.set(key, cur);
    }
    const ordered = Array.from(buckets.entries()).sort(
      (a, b) => b[1].ts - a[1].ts,
    );
    return ordered.map(([key, val]) => ({
      key,
      title: dayBucketLabel(val.ts, locale, t),
      data: val.data,
    }));
  }, [items, tab, t, locale]);

  const initial = (name: string) =>
    (name.trim().slice(0, 1) || "•").toUpperCase();

  /**
   * Build the row's primary line as inline parts so the actor name renders
   * in 800 weight (kit pattern) without a separate translation per kind.
   */
  const renderPrimary = (
    item: ActivityFeedItem,
    kind: RowKind,
  ): React.ReactNode => {
    if (kind === "group" && item.kind === "group") {
      // The activity feed doesn't carry a creator name, so we lead with the
      // group name (matches kit emphasis on the "object" of the action) and
      // attach the verb as a muted suffix.
      return (
        <Text style={styles.rowPrimary}>
          <Text style={styles.rowPrimaryActor}>{item.groupName}</Text>
          <Text style={styles.rowPrimaryMuted}>
            {" "}
            {t("activity.rowGroupCreatedVerb")}
          </Text>
        </Text>
      );
    }
    if (item.kind === "expense") {
      return (
        <Text style={styles.rowPrimary}>
          <Text style={styles.rowPrimaryActor}>{item.payerName}</Text>
          <Text style={styles.rowPrimaryMuted}> {t("activity.rowAddedVerb")} </Text>
          <Text style={styles.rowPrimaryEmphasis}>{item.description}</Text>
          {item.groupName ? (
            <Text style={styles.rowPrimaryMuted}>
              {" "}
              {t("activity.rowInGroup", { group: item.groupName })}
            </Text>
          ) : null}
        </Text>
      );
    }
    if (item.kind === "settlement") {
      const verb =
        kind === "settlement-received"
          ? t("activity.rowPaidYouVerb")
          : t("activity.rowPaidVerb");
      const counterparty =
        kind === "settlement-received" ? item.fromName : item.toName;
      return (
        <Text style={styles.rowPrimary}>
          <Text style={styles.rowPrimaryActor}>{counterparty}</Text>
          <Text style={styles.rowPrimaryMuted}> {verb}</Text>
        </Text>
      );
    }
    return null;
  };

  const renderAmount = (item: ActivityFeedItem, kind: RowKind) => {
    if (item.kind === "group") {
      return (
        <Ionicons
          name={isRTL ? "chevron-back" : "chevron-forward"}
          size={16}
          color={colors.muted}
          style={styles.chevron}
        />
      );
    }
    if (item.kind === "expense") {
      const amount = formatMinorWithSymbol(item.amountMinor, item.currency);
      const isYouAdded = kind === "expense-you-added";
      return (
        <View
          style={[
            styles.amountPill,
            isYouAdded ? styles.amountPillPositive : styles.amountPillNeutral,
          ]}
        >
          <Text
            style={[
              styles.amountPillText,
              isYouAdded
                ? styles.amountPillTextPositive
                : styles.amountPillTextNeutral,
            ]}
          >
            {amount}
          </Text>
        </View>
      );
    }
    // settlement
    const amount = formatMinorWithSymbol(item.amountMinor, item.currency);
    const sign = kind === "settlement-received" ? "+" : "−";
    const positive = kind === "settlement-received";
    return (
      <View
        style={[
          styles.amountPill,
          positive ? styles.amountPillPositive : styles.amountPillNegative,
        ]}
      >
        <Text
          style={[
            styles.amountPillText,
            positive
              ? styles.amountPillTextPositive
              : styles.amountPillTextNegative,
          ]}
        >
          {sign}
          {amount}
        </Text>
      </View>
    );
  };

  const renderLeadTile = (item: ActivityFeedItem, kind: RowKind) => {
    if (kind === "group" && item.kind === "group") {
      return (
        <View style={[styles.leadTile, styles.leadTileNeutral]}>
          <Ionicons name="people-circle" size={18} color={colors.primary} />
        </View>
      );
    }
    if (item.kind === "expense") {
      return (
        <View style={styles.leadTile}>
          <Ionicons name="receipt-outline" size={17} color={colors.primary} />
        </View>
      );
    }
    if (item.kind === "settlement") {
      const counterparty =
        kind === "settlement-sent" ? item.toName : item.fromName;
      return (
        <View style={styles.leadTile}>
          <Text style={styles.leadTileLetter}>{initial(counterparty)}</Text>
        </View>
      );
    }
    return <View style={styles.leadTile} />;
  };

  const renderRow = (item: ActivityFeedItem, isFirst: boolean) => {
    const kind = classifyRow(item, meName);
    return (
      <View style={[styles.row, !isFirst && styles.rowDivider]}>
        {renderLeadTile(item, kind)}
        <View style={styles.rowTextCol}>
          <AutoDirectionText style={undefined}>
            {renderPrimary(item, kind)}
          </AutoDirectionText>
          <Text style={styles.rowTime}>{relativeTime(item.at, locale, t)}</Text>
        </View>
        {renderAmount(item, kind)}
      </View>
    );
  };

  if (items === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          paddingTop: insets.top,
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const topPad = Math.max(8, insets.top);

  return (
    <View style={styles.wrap} accessibilityLabel={t("activity.title")}>
      <View style={[styles.column, { paddingTop: topPad }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>{t("activity.title")}</Text>
        </View>

        <ScrollView
          ref={tabsScrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {tabs.map((tabItem) => {
            const active = tabItem.key === tab;
            return (
              <Pressable
                key={tabItem.key}
                style={({ pressed }) => [
                  styles.tabBtn,
                  active && styles.tabBtnActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => setTab(tabItem.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.tabText, active && styles.tabTextActive]}
                >
                  {tabItem.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <SectionList<ActivityFeedItem, ActivitySection>
        ref={listRef}
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({
          section,
        }: {
          section: SectionListData<ActivityFeedItem, ActivitySection>;
        }) => (
          <View style={styles.column}>
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionEyebrow}>
                {section.title.toUpperCase()}
              </Text>
              <View style={styles.sectionCard}>
                {section.data.map((item, idx) => (
                  <View key={item.id}>{renderRow(item, idx === 0)}</View>
                ))}
              </View>
            </View>
          </View>
        )}
        renderItem={() => null}
        ListEmptyComponent={
          <View style={styles.column}>
            <View style={styles.centerEmpty}>
              <EmptyState
                icon="time-outline"
                title={t("activity.emptyTitle")}
                subtitle={t("activity.empty")}
              />
            </View>
          </View>
        }
        contentContainerStyle={{
          paddingTop: 4,
          paddingBottom: 110 + insets.bottom,
          flexGrow: 1,
        }}
        initialNumToRender={20}
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
      />
    </View>
  );
}
