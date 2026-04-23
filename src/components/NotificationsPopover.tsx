import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  deriveNotifications,
  type NotificationItem,
  type NotificationSection,
} from "../core/notifications";
import { useDatabase } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { GroupsStackParamList, RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "../ui/AppText";

type Nav = NavigationProp<RootStackParamList> & NativeStackNavigationProp<GroupsStackParamList>;

export function NotificationsPopover({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const db = useDatabase();
  const navigation = useNavigation<Nav>();

  const [items, setItems] = useState<NotificationItem[]>([]);
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const next = await deriveNotifications(db);
      if (cancelled) return;
      setItems(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, visible]);

  const visibleItems = useMemo(
    () => items.filter((n) => !archivedIds.has(n.id)),
    [items, archivedIds],
  );
  const sections = useMemo(() => groupBySection(visibleItems), [visibleItems]);

  const onTap = (n: NotificationItem) => {
    setReadIds((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      return next;
    });
    onClose();
    if (n.target?.kind === "group") {
      navigation.navigate("Main", {
        screen: "Groups",
        params: { screen: "GroupDetail", params: { groupId: n.target.groupId } },
      });
    } else if (n.target?.kind === "invite") {
      navigation.navigate("Main", {
        screen: "Groups",
        params: { screen: "GroupShare", params: { groupId: n.target.groupId } },
      });
    }
  };

  const onArchive = (n: NotificationItem) =>
    setArchivedIds((prev) => {
      const next = new Set(prev);
      next.add(n.id);
      return next;
    });

  const markAllRead = () =>
    setReadIds(new Set(visibleItems.map((n) => n.id)));

  const openFullScreen = () => {
    onClose();
    navigation.navigate("Main", {
      screen: "Groups",
      params: { screen: "Notifications" },
    });
  };

  const topOffset = insets.top + 56;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.card,
            {
              marginTop: topOffset,
              marginHorizontal: 10,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {t("notifications.title")}
            </Text>
            <Pressable
              onPress={markAllRead}
              hitSlop={8}
              disabled={visibleItems.length === 0}
              style={styles.headerBtn}
            >
              <Text
                style={[
                  styles.headerBtnText,
                  visibleItems.length === 0 && styles.headerBtnDisabled,
                ]}
              >
                {t("notifications.markAllRead")}
              </Text>
            </Pressable>
            <Pressable onPress={onClose} hitSlop={10} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>

          {visibleItems.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons
                name="notifications-outline"
                size={28}
                color={colors.muted}
              />
              <Text style={styles.emptyTitle}>
                {t("notifications.emptyTitle")}
              </Text>
            </View>
          ) : (
            <ScrollView
              style={{ maxHeight: 360 }}
              contentContainerStyle={styles.scroll}
              showsVerticalScrollIndicator={false}
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
                    <Text style={styles.sectionTitle}>
                      {t(`notifications.section_${section}`)}
                    </Text>
                    {rows.map((n) => (
                      <NotificationRow
                        key={n.id}
                        item={n}
                        read={readIds.has(n.id)}
                        onTap={onTap}
                        onArchive={onArchive}
                        colors={colors}
                        styles={styles}
                        t={t}
                      />
                    ))}
                  </View>
                );
              })}
              <Pressable onPress={openFullScreen} style={styles.seeAllBtn}>
                <Text style={styles.seeAllText}>
                  {t("notifications.seeAll")}
                </Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
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
      <Pressable
        onPress={() => onArchive(item)}
        hitSlop={10}
        accessibilityLabel={t("notifications.archive")}
        style={styles.rowClose}
      >
        <Ionicons name="close" size={14} color={colors.muted} />
      </Pressable>
    </Pressable>
  );
}

function groupBySection(items: NotificationItem[]) {
  const m = new Map<NotificationSection, NotificationItem[]>();
  for (const n of items) {
    const arr = m.get(n.section) ?? [];
    arr.push(n);
    m.set(n.section, arr);
  }
  return m;
}

function accentColor(a: NotificationItem["accent"], colors: ThemeColors): string {
  if (a === "red") return colors.owe;
  if (a === "green") return colors.owed;
  if (a === "blue") return colors.primary;
  return colors.muted;
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.25)",
      alignItems: isRTL ? "flex-start" : "flex-end",
    },
    card: {
      width: 340,
      maxWidth: "94%",
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.15,
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      elevation: 8,
    },
    headerRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      gap: 6,
    },
    headerTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: "700",
      color: colors.text,
      ...te,
    },
    headerBtn: { paddingHorizontal: 4, paddingVertical: 2 },
    headerBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
    headerBtnDisabled: { color: colors.muted, opacity: 0.6 },
    closeBtn: { padding: 4 },
    scroll: { padding: 10 },
    sectionBlock: { marginBottom: 10 },
    sectionTitle: {
      fontSize: 10,
      fontWeight: "800",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
      paddingHorizontal: 4,
      ...te,
    },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 8,
      paddingVertical: 6,
      marginBottom: 4,
      borderRadius: 8,
      backgroundColor: colors.inputSurface,
    },
    rowUnread: { backgroundColor: colors.owedSoft },
    avatar: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarLetter: { color: "#fff", fontSize: 10, fontWeight: "800" },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 12, fontWeight: "700", ...te },
    rowSubtitle: { fontSize: 10, color: colors.muted, ...te },
    rowClose: {
      width: 20,
      height: 20,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyWrap: {
      alignItems: "center",
      paddingVertical: 28,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
    },
    seeAllBtn: {
      paddingVertical: 10,
      alignItems: "center",
    },
    seeAllText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
  });
}
