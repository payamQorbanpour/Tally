import { useFocusEffect } from "@react-navigation/native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  RefreshControl,
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
  listActivityFeed,
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

function formatActivityTime(iso: string, appLocale: AppLocale): string {
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

function buildActivityStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    list: { flex: 1, backgroundColor: colors.bg },
    kicker: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      width: "100%",
      ...te,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      marginTop: 4,
      marginBottom: 4,
      width: "100%",
      ...te,
    },
    body: {
      fontSize: 16,
      color: colors.muted,
      lineHeight: 24,
      marginBottom: 4,
      width: "100%",
      ...te,
    },
    section: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.muted,
      marginTop: 8,
      marginBottom: 8,
      width: "100%",
      ...te,
    },
    introBlock: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
      alignItems: isRTL ? "flex-end" : "flex-start",
    },
    sectionHeader: { paddingHorizontal: 16 },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    rowText: { flex: 1, minWidth: 0 },
    rowPrimary: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      lineHeight: 22,
    },
    rowSub: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
    centerEmpty: { padding: 20, paddingHorizontal: 16, alignItems: isRTL ? "flex-end" : "flex-start" },
    empty: { fontSize: 15, color: colors.muted, lineHeight: 22, width: "100%", ...te },
  });
}

export function ActivityScreen() {
  const db = useDatabase();
  const { dataRevision, refreshCloudData } = useTallyData();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, locale, isRTL } = useLocale();
  const styles = useMemo(() => buildActivityStyles(colors, isRTL), [colors, isRTL]);
  const [items, setItems] = useState<ActivityFeedItem[] | null>(null);
  const listRef = useRef<FlatList<ActivityFeedItem>>(null);
  const { refreshing, onRefresh, onScrollWhileRefreshing } =
    useRefreshWithBackgroundSync(refreshCloudData, {
      scrollToTop: () =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true }),
    });

  const load = useCallback(async () => {
    const list = await listActivityFeed(db);
    setItems(list);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load, dataRevision]);

  const subForItem = (item: ActivityFeedItem) => {
    const when = formatActivityTime(item.at, locale);
    if (item.kind === "group") {
      return t("activity.groupSub", { when });
    }
    if (item.kind === "expense") {
      return t("activity.expenseSub", {
        payer: item.payerName,
        amount: formatMinor(item.amountMinor, item.currency),
        group: item.groupName,
        when,
      });
    }
    return t("activity.settlementSub", {
      amount: formatMinor(item.amountMinor, item.currency),
      group: item.groupName,
      when,
    });
  };

  const renderItem: ListRenderItem<ActivityFeedItem> = ({ item }) => {
    const iconName =
      item.kind === "group"
        ? "home-outline"
        : item.kind === "expense"
          ? "receipt-outline"
          : "swap-horizontal";
    return (
      <View style={styles.row} accessible accessibilityLabel={subForItem(item)}>
        <View style={styles.rowIcon} accessibilityElementsHidden>
          <Ionicons
            name={iconName as keyof typeof Ionicons.glyphMap}
            size={20}
            color={colors.primary}
          />
        </View>
        <View style={styles.rowText}>
          {item.kind === "group" ? (
            <AutoDirectionText style={styles.rowPrimary} maxFontSizeMultiplier={1.3}>
              {item.groupName}
            </AutoDirectionText>
          ) : item.kind === "expense" ? (
            <AutoDirectionText style={styles.rowPrimary} maxFontSizeMultiplier={1.3}>
              {item.description}
            </AutoDirectionText>
          ) : (
            <AutoDirectionText style={styles.rowPrimary} maxFontSizeMultiplier={1.3}>
              {`${item.fromName} → ${item.toName}`}
            </AutoDirectionText>
          )}
          <AutoDirectionText style={styles.rowSub} maxFontSizeMultiplier={1.2}>
            {subForItem(item)}
          </AutoDirectionText>
        </View>
      </View>
    );
  };

  if (items === null) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top, justifyContent: "center" }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const ListHeader = (
    <>
      <View style={styles.introBlock}>
        <Text style={styles.kicker} accessibilityRole="header">
          {t("activity.kicker")}
        </Text>
        <Text style={styles.title} accessibilityRole="header">
          {t("activity.title")}
        </Text>
        <Text style={styles.body} accessibilityRole="text">
          {t("activity.body")}
        </Text>
        {items.length > 0 ? (
          <Text style={styles.section} accessibilityRole="text">
            {t("activity.sectionRecent")}
          </Text>
        ) : null}
      </View>
      {items.length === 0 ? (
        <View style={styles.centerEmpty} accessibilityRole="text">
          <Text style={styles.empty}>{t("activity.empty")}</Text>
        </View>
      ) : null}
    </>
  );

  return (
    <View style={styles.list} accessibilityLabel={t("activity.title")}>
      <FlatList<ActivityFeedItem>
        ref={listRef}
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        ListHeaderComponent={ListHeader}
        contentContainerStyle={{
          paddingBottom: 24 + insets.bottom,
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
