import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCallback, useMemo, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { useLocale } from "../i18n/LocaleContext";
import { useDatabase } from "../db/DatabaseContext";
import { useBumpGroupsList } from "../navigation/GroupsListSyncContext";
import type { GroupsStackParamList } from "../navigation/types";
import { isValidCurrencyCode } from "../data/currencies";
import {
  deleteGroup,
  formatMinor,
  getMyBalanceInGroup,
  getOverallBalanceForUser,
  getSetting,
  listGroups,
  listMembers,
  LOCAL_USER_ID,
  SETTINGS_KEYS,
  type GroupRow,
} from "../data/tallyRepo";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/** Widen taps on small devices (e.g. iPhone 7) without changing layout. */
const EXTRA_TOUCH_SLOP = { top: 16, bottom: 16, left: 16, right: 16 } as const;

type Props = NativeStackScreenProps<GroupsStackParamList, "GroupsList">;

type GroupListItem = GroupRow & { myBalanceMinor: number; memberNames: string[] };

function buildGroupsStyles(colors: ThemeColors) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 16, paddingBottom: 120, gap: 10 },
  listEmpty: { flexGrow: 1, padding: 24, justifyContent: "center" },
  empty: { color: colors.muted, textAlign: "center", lineHeight: 22 },
  summaryCard: {
    backgroundColor: colors.owedSoft,
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.muted,
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  netLine: { marginBottom: 10, flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 6 },
  netLabel: { fontSize: 12, color: colors.muted, fontWeight: "600" },
  netAmount: { fontSize: 22, fontWeight: "800", color: colors.text },
  netPos: { color: colors.owed },
  netNeg: { color: colors.owe },
  summaryRow: { flexDirection: "row", gap: 10 },
  summaryPill: {
    flex: 1,
    backgroundColor: colors.bg,
    borderRadius: 12,
    padding: 12,
  },
  summaryLabel: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  summaryOwed: { fontSize: 18, fontWeight: "700", color: colors.owed },
  summaryOwe: { fontSize: 18, fontWeight: "700", color: colors.owe },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cardDeleting: { opacity: 0.55 },
  cardMain: { padding: 16 },
  cardPressed: { opacity: 0.92 },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
    /** Keep currency + overflow menu on the same physical edge for RTL locales */
    direction: "ltr",
  },
  cardTitle: { fontSize: 17, fontWeight: "600", color: colors.text, flex: 1, minWidth: 0 },
  cardTopRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 0,
  },
  cardCurrency: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.currencyMeta,
    letterSpacing: 0.3,
  },
  cardMenuBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    marginRight: -4,
    borderRadius: 8,
    minWidth: 32,
    alignItems: "center",
    justifyContent: "center",
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
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.owedSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  avatarLetter: { fontSize: 14, fontWeight: "700", color: colors.owed },
  moreAv: { fontSize: 13, color: colors.muted, marginLeft: 4 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 100,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabPressed: { opacity: 0.88 },
  fabText: { color: "#fff", fontSize: 32, fontWeight: "300", marginTop: -2 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: "transparent",
  },
  menuBackdropHit: {
    zIndex: 0,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  pressed: { opacity: 0.88 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  menuBackdropWeb: {
    justifyContent: "center",
    padding: 24,
  },
  menuBackdropMobile: {
    justifyContent: "flex-end",
  },
  menuSheet: {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    zIndex: 2,
  },
  menuSheetWeb: {
    borderRadius: 14,
    maxWidth: 400,
    alignSelf: "center",
    width: "100%",
  },
  menuSheetMobile: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: "100%",
    alignSelf: "stretch",
  },
  menuTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  menuRowDanger: { borderBottomWidth: 0 },
  menuRowCancel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderBottomWidth: 0,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "stretch",
  },
  menuRowTextEdit: { fontSize: 16, fontWeight: "600", color: colors.primary },
  menuRowTextDanger: { fontSize: 16, fontWeight: "600", color: colors.destructive },
  menuRowTextMuted: { fontSize: 16, fontWeight: "600", color: colors.muted },
});
}

export function GroupsScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const bumpGroupsList = useBumpGroupsList();
  const { t } = useLocale();
  const { colors } = useTheme();
  const styles = useMemo(() => buildGroupsStyles(colors), [colors]);
  const [items, setItems] = useState<GroupListItem[]>([]);
  const [totals, setTotals] = useState({ owedMinor: 0, owesMinor: 0 });
  const [refreshing, setRefreshing] = useState(false);
  const [menuGroupId, setMenuGroupId] = useState<string | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [appDefaultCurrency, setAppDefaultCurrency] = useState("USD");

  const load = useCallback(async () => {
    const c = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (c && isValidCurrencyCode(c)) setAppDefaultCurrency(c);
    const groups = await listGroups(db);
    const t = await getOverallBalanceForUser(db, LOCAL_USER_ID);
    setTotals(t);
    const enriched: GroupListItem[] = [];
    for (const g of groups) {
      const myBalanceMinor = await getMyBalanceInGroup(db, g.id, LOCAL_USER_ID);
      const members = await listMembers(db, g.id);
      enriched.push({
        ...g,
        myBalanceMinor,
        memberNames: members.map((m) => m.name),
      });
    }
    setItems(enriched);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const fabPress = () => {
    if (items.length === 0) {
      navigation.navigate("CreateGroup");
      return;
    }
    navigation.navigate("AddExpense", { groupId: items[0]!.id });
  };

  const menuGroup = menuGroupId
    ? items.find((g) => g.id === menuGroupId)
    : undefined;

  const summaryCurrency = useMemo(
    () => items[0]?.currency ?? appDefaultCurrency,
    [items, appDefaultCurrency],
  );

  const closeMenu = () => setMenuGroupId(null);

  const goEditGroup = (groupId: string) => {
    closeMenu();
    navigation.navigate("GroupDetail", { groupId });
  };

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
    closeMenu();
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
        data={items}
        keyExtractor={(item) => item.id}
        removeClippedSubviews={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>{t("groupList.totalBalance")}</Text>
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
        renderItem={({ item }) => {
          const deleting = deletingGroupId === item.id;
          return (
            <View
              style={[
                styles.card,
                deleting && styles.cardDeleting,
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
                    <Pressable
                      style={({ pressed }) => [
                        styles.cardMenuBtn,
                        pressed && styles.pressed,
                        deleting && styles.disabled,
                      ]}
                      onPress={() => setMenuGroupId(item.id)}
                      disabled={deleting || deletingGroupId !== null}
                      accessibilityRole="button"
                      accessibilityLabel={t("groupList.menuMoreActions", {
                        name: item.name,
                      })}
                      hitSlop={EXTRA_TOUCH_SLOP}
                    >
                      <Ionicons
                        name="ellipsis-vertical"
                        size={20}
                        color={colors.currencyMeta}
                      />
                    </Pressable>
                  </View>
                </View>
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
          );
        }}
        contentContainerStyle={
          items.length === 0 ? styles.listEmpty : styles.list
        }
      />
      <Pressable
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
        onPress={fabPress}
        hitSlop={EXTRA_TOUCH_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t("groupList.fabQuickAddExpense")}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(28, 16 + insets.bottom) },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.primaryBtn, pressed && styles.pressed]}
          onPress={() => navigation.navigate("CreateGroup")}
          hitSlop={EXTRA_TOUCH_SLOP}
        >
          <Text style={styles.primaryBtnText}>{t("nav.newGroup")}</Text>
        </Pressable>
      </View>

      <Modal
        transparent
        visible={menuGroupId !== null}
        animationType={Platform.OS === "web" ? "fade" : "slide"}
        onRequestClose={closeMenu}
      >
        <View
          style={[
            styles.menuBackdrop,
            Platform.OS === "web" ? styles.menuBackdropWeb : styles.menuBackdropMobile,
          ]}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, styles.menuBackdropHit]}
            onPress={closeMenu}
            accessibilityRole="button"
            accessibilityLabel={t("groupList.menuDismiss")}
          />
          <View
            style={[
              styles.menuSheet,
              Platform.OS === "web" ? styles.menuSheetWeb : styles.menuSheetMobile,
              Platform.OS !== "web" && {
                paddingBottom: Math.max(insets.bottom, 12),
              },
            ]}
          >
            <AutoDirectionText style={styles.menuTitle} numberOfLines={1}>
              {menuGroup?.name ?? t("groupList.menuTitleFallback")}
            </AutoDirectionText>
            <Pressable
              style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
              onPress={() => menuGroup && goEditGroup(menuGroup.id)}
              hitSlop={EXTRA_TOUCH_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t("groupList.editGroup")}
            >
              <Ionicons name="pencil" size={20} color={colors.primary} />
              <Text style={styles.menuRowTextEdit}>{t("groupList.editGroup")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowDanger,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                if (menuGroup) confirmDeleteGroup(menuGroup);
              }}
              hitSlop={EXTRA_TOUCH_SLOP}
              accessibilityRole="button"
              accessibilityLabel={t("groupList.deleteGroup")}
            >
              <Ionicons
                name="trash-outline"
                size={20}
                color={colors.destructive}
              />
              <Text style={styles.menuRowTextDanger}>{t("groupList.deleteGroup")}</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.menuRow,
                styles.menuRowCancel,
                pressed && styles.pressed,
              ]}
              onPress={closeMenu}
              hitSlop={EXTRA_TOUCH_SLOP}
            >
              <Text style={styles.menuRowTextMuted}>{t("friends.cancel")}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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

