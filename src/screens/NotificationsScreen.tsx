import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  addNotificationArchivedIds,
  addNotificationReadIds,
  deriveNotifications,
  getNotificationArchivedIds,
  getNotificationReadIds,
  type NotificationItem,
} from "../core/notifications";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { EmptyState } from "../ui/EmptyState";
import { Text } from "../ui/AppText";

type Nav = NativeStackNavigationProp<GroupsStackParamList, "Notifications">;
type Bucket = "today" | "yesterday" | "earlier";

/**
 * Notification center. Notifications are derived fresh on every focus from
 * local SQLite state. Read/archive ids are persisted, so dismissals survive
 * navigation. Visual layer matches the design kit's grouped-by-day list.
 */
export function NotificationsScreen() {
  const { colors, shadows } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => buildStyles(colors, isRTL, shadows.card),
    [colors, isRTL, shadows.card],
  );
  const { db, bumpDataRevision } = useTallyData();
  const navigation = useNavigation<Nav>();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      void (async () => {
        const [next, persistedRead, persistedArchived] = await Promise.all([
          deriveNotifications(db),
          getNotificationReadIds(db),
          getNotificationArchivedIds(db),
        ]);
        if (cancelled) return;
        setItems(next);
        setReadIds(persistedRead);
        setArchivedIds(persistedArchived);
      })();
      return () => {
        cancelled = true;
      };
    }, [db]),
  );

  const visible = useMemo(
    () => items.filter((n) => !archivedIds.has(n.id)),
    [items, archivedIds],
  );

  const buckets = useMemo(() => groupByBucket(visible), [visible]);

  const unreadCount = useMemo(
    () => visible.filter((n) => !readIds.has(n.id)).length,
    [visible, readIds],
  );

  const markAllRead = () => {
    const ids = visible.map((n) => n.id);
    setReadIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
    void (async () => {
      await addNotificationReadIds(db, ids);
      bumpDataRevision();
    })();
  };

  const onTap = (n: NotificationItem) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      return next;
    });
    void (async () => {
      await addNotificationReadIds(db, [n.id]);
      bumpDataRevision();
    })();
    if (n.target?.kind === "group") {
      navigation.navigate("GroupDetail", { groupId: n.target.groupId });
    } else if (n.target?.kind === "invite") {
      navigation.navigate("GroupShare", { groupId: n.target.groupId });
    }
  };

  const onArchive = (n: NotificationItem) => {
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      return next;
    });
    void (async () => {
      await addNotificationArchivedIds(db, [n.id]);
      bumpDataRevision();
    })();
  };

  const onMore = () => {
    if (visible.length === 0) return;
    if (Platform.OS === "web") {
      // Native action sheet is unavailable; fall through to the explicit
      // mark-all behaviour so web users still have the action accessible.
      markAllRead();
      return;
    }
    Alert.alert(t("notifications.title"), undefined, [
      {
        text: t("notifications.markAllRead"),
        onPress: markAllRead,
      },
      { text: t("friends.cancel"), style: "cancel" },
    ]);
  };

  const renderRow = (n: NotificationItem, isFirst: boolean) => {
    const isInvite = n.target?.kind === "invite";
    const accent = accentBg(n.accent, colors);
    const rowKey = n.id;
    return (
      <View
        key={rowKey}
        style={[styles.row, !isFirst && styles.rowDivider]}
      >
        <View style={[styles.leadTile, { backgroundColor: accent.bg }]}>
          {n.avatarLetter ? (
            <Text style={[styles.leadLetter, { color: accent.fg }]}>
              {n.avatarLetter}
            </Text>
          ) : (
            <Ionicons
              name="notifications-outline"
              size={16}
              color={accent.fg}
            />
          )}
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {n.title}
          </Text>
          {n.subtitle ? (
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {n.subtitle}
            </Text>
          ) : null}
          <Text style={styles.rowTime}>{formatRelative(n.createdAt)}</Text>
          {isInvite ? (
            <View style={styles.inviteRow}>
              <AppButton
                variant="primary"
                size="sm"
                label={t("notifications.accept")}
                onPress={() => onTap(n)}
              />
              <AppButton
                variant="secondary"
                size="sm"
                label={t("notifications.decline")}
                onPress={() => onArchive(n)}
              />
            </View>
          ) : null}
        </View>
        {!isInvite ? (
          <Pressable
            onPress={() => onTap(n)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={n.title}
            style={styles.rowChevronTouch}
          >
            <Ionicons
              name={isRTL ? "chevron-back" : "chevron-forward"}
              size={16}
              color={colors.muted}
            />
          </Pressable>
        ) : null}
        <Pressable
          style={styles.rowDismiss}
          onPress={() => onArchive(n)}
          accessibilityLabel={t("notifications.archive")}
          hitSlop={8}
        >
          <Ionicons name="close" size={14} color={colors.muted} />
        </Pressable>
      </View>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => {
            if (navigation.canGoBack()) navigation.popToTop();
            else navigation.goBack();
          }}
          style={({ pressed }) => [
            styles.headerBack,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          hitSlop={10}
          accessibilityLabel={t("nav.back")}
        >
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={18}
            color={colors.text}
          />
        </Pressable>
        <Text style={styles.headerTitle}>{t("notifications.title")}</Text>
        <Pressable
          onPress={onMore}
          style={({ pressed }) => [
            styles.headerMore,
            pressed && styles.pressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={t("notifications.moreA11y")}
          hitSlop={10}
          disabled={visible.length === 0}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={20}
            color={visible.length === 0 ? colors.muted : colors.text}
          />
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon="notifications-outline"
            title={t("notifications.emptyTitle")}
            subtitle={t("notifications.emptyBody")}
          />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 32 },
          ]}
        >
          {unreadCount > 0 ? (
            <View style={styles.unreadPillWrap}>
              <View style={styles.unreadPill}>
                <View style={styles.unreadDot} />
                <Text style={styles.unreadPillText}>
                  {t("notifications.unreadCount", {
                    count: String(unreadCount),
                  })}
                </Text>
              </View>
            </View>
          ) : null}

          {(["today", "yesterday", "earlier"] as Bucket[]).map((b) => {
            const rows = buckets.get(b) ?? [];
            if (rows.length === 0) return null;
            return (
              <View key={b} style={styles.sectionWrap}>
                <Text style={styles.sectionEyebrow}>
                  {t(
                    b === "today"
                      ? "notifications.bucketToday"
                      : b === "yesterday"
                        ? "notifications.bucketYesterday"
                        : "notifications.bucketEarlier",
                  ).toUpperCase()}
                </Text>
                <View style={styles.sectionCard}>
                  {rows.map((n, idx) => renderRow(n, idx === 0))}
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function bucketFor(iso: string): Bucket {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "earlier";
  const today = new Date();
  const todayStart = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const oneDay = 24 * 60 * 60 * 1000;
  if (ts >= todayStart) return "today";
  if (ts >= todayStart - oneDay) return "yesterday";
  return "earlier";
}

function groupByBucket(
  items: NotificationItem[],
): Map<Bucket, NotificationItem[]> {
  const m = new Map<Bucket, NotificationItem[]>();
  for (const n of items) {
    const b = bucketFor(n.createdAt);
    const arr = m.get(b) ?? [];
    arr.push(n);
    m.set(b, arr);
  }
  return m;
}

function accentBg(
  a: NotificationItem["accent"],
  colors: ThemeColors,
): { bg: string; fg: string } {
  if (a === "red") return { bg: colors.oweSoft, fg: colors.owe };
  if (a === "green") return { bg: colors.owedSoft, fg: colors.primary };
  if (a === "blue") return { bg: colors.owedSoft, fg: colors.primary };
  return { bg: colors.inputSurface, fg: colors.muted };
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  cardShadow: ShadowStyle,
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },

    /* ── Header ──────────────────────────────────────────────────── */
    headerBar: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    headerBack: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      backgroundColor: colors.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    headerMore: {
      width: 36,
      height: 36,
      alignItems: "center",
      justifyContent: "center",
    },

    /* ── Unread pill ─────────────────────────────────────────────── */
    unreadPillWrap: {
      flexDirection: isRTL ? "row-reverse" : "row",
      paddingHorizontal: 18,
      paddingTop: 6,
    },
    unreadPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    unreadDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: "#fff",
    },
    unreadPillText: {
      fontSize: 12,
      fontWeight: "800",
      color: "#fff",
    },

    /* ── Sections ────────────────────────────────────────────────── */
    scroll: {
      paddingHorizontal: 18,
      paddingTop: 4,
    },
    sectionWrap: { marginTop: 14 },
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
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    leadTile: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      marginTop: 1,
    },
    leadLetter: {
      fontSize: 13,
      fontWeight: "800",
    },
    rowText: { flex: 1, minWidth: 0 },
    rowTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      lineHeight: 20,
      ...te,
    },
    rowSubtitle: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 2,
      lineHeight: 18,
      ...te,
    },
    rowTime: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 3,
    },
    inviteRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      gap: 8,
      marginTop: 10,
    },
    rowChevronTouch: {
      paddingHorizontal: 4,
      marginTop: 8,
    },
    rowDismiss: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 6,
    },

    emptyWrap: {
      flex: 1,
      paddingTop: 80,
    },
    pressed: { opacity: 0.85 },
  });
}
