import Ionicons from "@expo/vector-icons/Ionicons";
import {
  useFocusEffect,
  useNavigation,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import {
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
  type NotificationSection,
} from "../core/notifications";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "../ui/AppText";

type Nav = NativeStackNavigationProp<GroupsStackParamList, "Notifications">;

/**
 * Notification center. Notifications are derived fresh on every focus from
 * local SQLite state (no persistence of read/archive yet) — the UI keeps
 * per-mount sets of read and archived ids so the user can dismiss items
 * within the session.
 */
export function NotificationsScreen() {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
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

  const sections = useMemo(() => groupBySection(visible), [visible]);

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

  const onMarkRead = (n: NotificationItem) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      return next;
    });
    void (async () => {
      await addNotificationReadIds(db, [n.id]);
      bumpDataRevision();
    })();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.headerBar}>
        <Pressable
          onPress={() => {
            // Always return to the home (GroupsList) instead of whatever
            // pushed this screen — the user reached it from the Account
            // settings list, so popping straight back would feel sideways.
            if (navigation.canGoBack()) navigation.popToTop();
            else navigation.goBack();
          }}
          style={styles.headerBack}
          accessibilityRole="button"
          hitSlop={10}
        >
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={24}
            color={colors.text}
          />
        </Pressable>
        <Text style={styles.headerTitle}>{t("notifications.title")}</Text>
        <Pressable
          onPress={markAllRead}
          style={styles.headerAction}
          accessibilityRole="button"
          hitSlop={8}
          disabled={visible.length === 0}
        >
          <Text
            style={[
              styles.headerActionText,
              visible.length === 0 && styles.headerActionDisabled,
            ]}
          >
            {t("notifications.markAllRead")}
          </Text>
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View style={styles.emptyRoot}>
          <View style={styles.emptyIconWrap}>
            <Ionicons
              name="notifications-outline"
              size={36}
              color={colors.muted}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {t("notifications.emptyTitle")}
          </Text>
          <Text style={styles.emptyBody}>{t("notifications.emptyBody")}</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 24 },
          ]}
        >
          {(
            [
              "action_required",
              "money_updates",
              "activity",
              "system",
            ] as NotificationSection[]
          ).map((section) => {
            const rows = sections.get(section) ?? [];
            if (rows.length === 0) return null;
            return (
              <View key={section} style={styles.sectionBlock}>
                <View style={styles.sectionHeaderRow}>
                  <View
                    style={[
                      styles.sectionDot,
                      { backgroundColor: sectionAccent(section, colors) },
                    ]}
                  />
                  <Text style={styles.sectionTitle}>
                    {t(`notifications.section_${section}`)}
                  </Text>
                </View>
                {rows.map((n) => (
                  <NotificationRow
                    key={n.id}
                    item={n}
                    read={readIds.has(n.id)}
                    onTap={onTap}
                    onArchive={onArchive}
                    onMarkRead={onMarkRead}
                    colors={colors}
                    styles={styles}
                    t={t}
                  />
                ))}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

function NotificationRow({
  item,
  read,
  onTap,
  onArchive,
  colors,
  styles,
  t,
}: {
  item: NotificationItem;
  read: boolean;
  onTap: (n: NotificationItem) => void;
  onArchive: (n: NotificationItem) => void;
  onMarkRead: (n: NotificationItem) => void;
  colors: ThemeColors;
  styles: ReturnType<typeof buildStyles>;
  t: (path: string, vars?: Record<string, string>) => string;
}) {
  const accent = accentColor(item.accent, colors);
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !read && styles.rowUnread,
        pressed && { opacity: 0.85 },
      ]}
      onPress={() => onTap(item)}
      accessibilityRole="button"
    >
      <View style={[styles.avatar, { backgroundColor: accent }]}>
        <Text style={styles.avatarLetter}>{item.avatarLetter ?? "•"}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: accent }]} numberOfLines={1}>
          {item.title}
        </Text>
        {item.subtitle ? (
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        ) : null}
      </View>
      <Text style={styles.rowTime}>{formatRelative(item.createdAt)}</Text>
      <Pressable
        style={styles.rowClose}
        onPress={() => onArchive(item)}
        accessibilityLabel={t("notifications.archive")}
        hitSlop={10}
      >
        <Ionicons name="close" size={14} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

function groupBySection(
  items: NotificationItem[],
): Map<NotificationSection, NotificationItem[]> {
  const m = new Map<NotificationSection, NotificationItem[]>();
  for (const n of items) {
    const arr = m.get(n.section) ?? [];
    arr.push(n);
    m.set(n.section, arr);
  }
  return m;
}

function accentColor(
  a: NotificationItem["accent"],
  colors: ThemeColors,
): string {
  if (a === "red") return colors.owe;
  if (a === "green") return colors.owed;
  if (a === "blue") return colors.primary;
  return colors.muted;
}

function sectionAccent(
  s: NotificationSection,
  colors: ThemeColors,
): string {
  if (s === "action_required") return colors.owe;
  if (s === "money_updates") return colors.owed;
  if (s === "activity") return colors.primary;
  return colors.muted;
}

function formatRelative(iso: string): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(ts).toLocaleDateString();
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    headerBar: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    headerBack: { padding: 6, minWidth: 40 },
    headerTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      textAlign: "center",
    },
    headerAction: { padding: 6, minWidth: 60 },
    headerActionText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
      textAlign: isRTL ? "left" : "right",
    },
    headerActionDisabled: { color: colors.muted, opacity: 0.6 },
    scroll: { paddingHorizontal: 14, paddingVertical: 12 },
    sectionBlock: { marginBottom: 16 },
    sectionHeaderRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sectionDot: { width: 8, height: 8, borderRadius: 4 },
    sectionTitle: {
      fontSize: 12,
      fontWeight: "800",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      ...te,
    },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginBottom: 6,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowUnread: {
      backgroundColor: colors.owedSoft,
      borderColor: colors.primary,
    },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarLetter: { color: "#fff", fontSize: 11, fontWeight: "800" },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 13, fontWeight: "700", ...te },
    rowSubtitle: { fontSize: 11, color: colors.muted, ...te },
    rowTime: { fontSize: 10, color: colors.muted, marginHorizontal: 4 },
    rowClose: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyRoot: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 30,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 6,
      textAlign: "center",
    },
    emptyBody: {
      fontSize: 14,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 20,
    },
  });
}
