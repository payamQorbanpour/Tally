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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useRefreshWithBackgroundSync } from "../hooks/useRefreshWithBackgroundSync";
import {
  type ActivityFeedItem,
  formatMinor,
  getLocalUserProfile,
  listActivityFeed,
  type LocalUserProfile,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

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

function buildActivityStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const cardBorder =
    resolvedScheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.06)";
  const tabActiveBg =
    resolvedScheme === "dark" ? "rgba(52,211,153,0.18)" : "#D7F1E6";
  const indicatorPositiveBg =
    resolvedScheme === "dark" ? "rgba(52,211,153,0.18)" : "#D7F1E6";
  const indicatorNegativeBg =
    resolvedScheme === "dark" ? "rgba(248,113,113,0.20)" : "#FEE2E2";
  const indicatorNeutralBg =
    resolvedScheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(15,23,42,0.05)";
  const avatarTint =
    resolvedScheme === "dark" ? "rgba(52,211,153,0.18)" : "#D7F1E6";

  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    container: { flex: 1 },
    column: { width: "100%", maxWidth: 640, alignSelf: "center" },

    titleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    titleSpacer: { width: 36 },
    title: {
      flex: 1,
      fontSize: 20,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
    },

    tabsRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 8,
      gap: 4,
    },
    tabBtn: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 999,
    },
    tabBtnActive: {
      backgroundColor: tabActiveBg,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.muted,
    },
    tabTextActive: {
      color: colors.primary,
      fontWeight: "700",
    },

    sectionHeader: {
      paddingHorizontal: 16,
      paddingTop: 18,
      paddingBottom: 8,
      backgroundColor: colors.bg,
    },
    sectionHeaderText: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      ...te,
    },

    rowOuter: {
      paddingHorizontal: 16,
      paddingBottom: 8,
    },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
    },
    leadAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: avatarTint,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    leadAvatarLetter: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.primary,
    },
    rowText: { flex: 1, minWidth: 0 },
    rowPrimary: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      lineHeight: 20,
    },
    rowSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    indicator: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    indicatorPositive: { backgroundColor: indicatorPositiveBg },
    indicatorNegative: { backgroundColor: indicatorNegativeBg },
    indicatorNeutral: { backgroundColor: indicatorNeutralBg },

    centerEmpty: {
      paddingHorizontal: 16,
      paddingVertical: 32,
      alignItems: "center",
    },
    empty: {
      fontSize: 15,
      color: colors.muted,
      lineHeight: 22,
      textAlign: "center",
    },

    pressed: { opacity: 0.85 },
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

export function ActivityScreen() {
  const db = useDatabase();
  const { dataRevision, refreshCloudData } = useTallyData();
  const insets = useSafeAreaInsets();
  const { colors, resolvedScheme } = useTheme();
  const { t, locale, isRTL } = useLocale();
  const styles = useMemo(
    () => buildActivityStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
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
      if (tab === "payments") {
        return it.kind === "settlement";
      }
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

  const primaryFor = (item: ActivityFeedItem, kind: RowKind): string => {
    if (kind === "expense-you-added") {
      return t("activity.rowYouAdded");
    }
    if (kind === "expense-other-paid" && item.kind === "expense") {
      return t("activity.rowPersonPaid", {
        name: item.payerName,
        amount: formatMinor(item.amountMinor, item.currency),
      });
    }
    if (kind === "expense-you-paid" && item.kind === "expense") {
      return t("activity.rowYouPaid", {
        amount: formatMinor(item.amountMinor, item.currency),
      });
    }
    if (kind === "settlement-sent" && item.kind === "settlement") {
      return t("activity.rowSettlementSent", { name: item.toName });
    }
    if (kind === "settlement-received" && item.kind === "settlement") {
      return t("activity.rowSettlementReceived", { name: item.fromName });
    }
    if (kind === "group" && item.kind === "group") {
      return t("activity.rowGroupCreated", { name: item.groupName });
    }
    return "";
  };

  const renderRow = (item: ActivityFeedItem) => {
    const kind = classifyRow(item, meName);

    let leadingNode;
    if (item.kind === "group") {
      leadingNode = (
        <View style={styles.leadAvatar}>
          <Ionicons name="home-outline" size={20} color={colors.primary} />
        </View>
      );
    } else if (kind === "expense-you-added") {
      leadingNode = (
        <View style={styles.leadAvatar}>
          <Ionicons name="airplane-outline" size={20} color={colors.primary} />
        </View>
      );
    } else if (item.kind === "expense") {
      leadingNode = (
        <View style={styles.leadAvatar}>
          <Text style={styles.leadAvatarLetter}>{initial(item.payerName)}</Text>
        </View>
      );
    } else {
      const counterparty =
        kind === "settlement-sent" ? item.toName : item.fromName;
      leadingNode = (
        <View style={styles.leadAvatar}>
          <Text style={styles.leadAvatarLetter}>{initial(counterparty)}</Text>
        </View>
      );
    }

    let indicatorIcon: keyof typeof Ionicons.glyphMap = "logo-usd";
    let indicatorColor = colors.primary;
    let indicatorStyle = styles.indicatorPositive;
    if (kind === "expense-you-added") {
      indicatorIcon = "add";
      indicatorColor = colors.primary;
      indicatorStyle = styles.indicatorPositive;
    } else if (kind === "settlement-sent") {
      indicatorIcon = "arrow-up";
      indicatorColor = colors.destructive;
      indicatorStyle = styles.indicatorNegative;
    } else if (kind === "settlement-received") {
      indicatorIcon = "arrow-down";
      indicatorColor = colors.primary;
      indicatorStyle = styles.indicatorPositive;
    } else if (kind === "group") {
      indicatorIcon = "people-outline";
      indicatorColor = colors.muted;
      indicatorStyle = styles.indicatorNeutral;
    }

    const subtitle =
      item.kind === "group"
        ? relativeTime(item.at, locale, t)
        : t("activity.rowSubGroupTime", {
            group: item.groupName,
            time: relativeTime(item.at, locale, t),
          });

    return (
      <View style={styles.rowOuter}>
        <View style={styles.row}>
          {leadingNode}
          <View style={styles.rowText}>
            <AutoDirectionText style={styles.rowPrimary} numberOfLines={1}>
              {primaryFor(item, kind)}
            </AutoDirectionText>
            <AutoDirectionText style={styles.rowSub} numberOfLines={1}>
              {subtitle}
            </AutoDirectionText>
          </View>
          <View style={[styles.indicator, indicatorStyle]}>
            <Ionicons name={indicatorIcon} size={16} color={indicatorColor} />
          </View>
        </View>
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
          <View style={styles.titleSpacer} />
          <Text style={styles.title}>{t("activity.title")}</Text>
          <View style={styles.titleSpacer} />
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
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.title}</Text>
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={styles.column}>{renderRow(item)}</View>
        )}
        ListEmptyComponent={
          <View style={styles.column}>
            <View style={styles.centerEmpty}>
              <Text style={styles.empty}>{t("activity.empty")}</Text>
            </View>
          </View>
        }
        contentContainerStyle={{
          paddingTop: 8,
          paddingBottom: 24 + insets.bottom,
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
