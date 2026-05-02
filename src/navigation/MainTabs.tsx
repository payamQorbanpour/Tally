import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Image, Platform, ScrollView, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../ui/AppText";
import { Pressable } from "react-native-gesture-handler";
import { AccountScreen } from "../screens/AccountScreen";
import { ActivityScreen } from "../screens/ActivityScreen";
import { AiReceiptScreen } from "../screens/AiReceiptScreen";
import { FriendsScreen } from "../screens/FriendsScreen";
import { AutoDirectionText } from "../components/AutoDirectionText";
import {
  getGroupBalances,
  getLocalUserProfile,
  listGroups,
  getLocalUserId,
  type GroupRow,
  type LocalUserProfile,
} from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { GroupsListSyncProvider, useGroupsListEpoch } from "./GroupsListSyncContext";
import type { MainTabParamList, RootStackParamList } from "./types";
import { GroupsStackNavigator } from "./GroupsStackNavigator";
import { GroupsListHeader } from "./GroupsListHeader";

const Tab = createBottomTabNavigator<MainTabParamList>();

/** Web/desktop: show sidebar; below this, use bottom tab bar (PRD: 768) */
const WIDE_BREAKPOINT = 768;

const SIDEBAR_W = 240;

function buildMainTabsStyles(
  colors: ThemeColors,
  isRTL: boolean,
  isGlass: boolean,
) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    /**
     * Global add-expense pill FAB shown on tabs that don't already own one
     * (Friends, Activity). Mirrors the dual-half pill on the Groups tab so
     * the entry point is consistent across screens. Hidden on wide layouts
     * where the sidebar covers the role.
     */
    globalFab: {
      position: "absolute",
      right: 20,
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
    globalFabHalf: {
      width: 56,
      height: 56,
      alignItems: "center",
      justifyContent: "center",
    },
    globalFabDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: "rgba(255,255,255,0.35)",
    },
    globalFabPlusText: {
      color: "#fff",
      fontSize: 32,
      fontWeight: "300",
      marginTop: -2,
    },
    globalFabPressed: { opacity: 0.8 },
    sidebarSlot: {
      position: "absolute",
      ...(isRTL ? { right: 0 } : { left: 0 }),
      top: 0,
      bottom: 0,
      width: SIDEBAR_W,
      zIndex: 2,
      borderRightWidth: isRTL ? 0 : StyleSheet.hairlineWidth,
      borderLeftWidth: isRTL ? StyleSheet.hairlineWidth : 0,
      borderRightColor: colors.border,
      borderLeftColor: colors.border,
      backgroundColor: isGlass ? "rgba(16, 22, 32, 0.62)" : colors.surface,
    },
    tabColumn: { flex: 1 },
    tabColumnInset: isRTL ? { marginRight: SIDEBAR_W } : { marginLeft: SIDEBAR_W },
  });
}

function buildWebSidebarStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
    sidebar: {
      flex: 1,
      paddingTop: 20,
      paddingHorizontal: 8,
      paddingBottom: 12,
    },
    logoContainer: {
      alignItems: "center",
      marginBottom: 16,
      paddingHorizontal: 8,
    },
    logo: {
      width: 60,
      height: 60,
      borderRadius: 8,
    },
    navMain: { flex: 1, minHeight: 0 },
    navRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
    },
    navIcon: { width: 22, alignItems: "center" },
    navLabelCol: { flex: 1, minWidth: 0 },
    profileBlock: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      marginTop: 6,
      paddingTop: 12,
      paddingHorizontal: 2,
    },
    profileRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      borderRadius: 10,
      padding: 8,
    },
    profileRowPressed: { opacity: 0.9, backgroundColor: colors.inputSurface },
    profileAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    profileAvatarImg: { width: 32, height: 32, borderRadius: 16 },
    profileAvatarL: { fontSize: 14, fontWeight: "700", color: colors.text },
    profileName: { fontSize: 15, fontWeight: "600", color: colors.text, flex: 1 },
    profileSub: { fontSize: 11, color: colors.muted, marginTop: 1 },
    groupDot: { width: 5, height: 5, borderRadius: 2.5, flexShrink: 0 },
    sidebarBrand: {
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 20,
      paddingHorizontal: 8,
      color: colors.text,
    },
    sidebarItem: {
      paddingVertical: 12,
      paddingHorizontal: 10,
      borderRadius: 10,
      marginBottom: 4,
    },
    sidebarItemPressed: { opacity: 0.88, backgroundColor: colors.bg },
    sidebarItemLabel: { fontSize: 16, fontWeight: "600", color: colors.text },
    sidebarItemHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
    groupShortcuts: {
      marginTop: 20,
      paddingTop: 16,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    groupShortcutsTitle: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
      paddingHorizontal: 8,
    },
    groupShortcut: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingVertical: 8,
      paddingRight: 10,
      paddingLeft: 10,
      borderRadius: 10,
      marginBottom: 2,
      borderWidth: 2,
      borderColor: "transparent",
    },
    groupShortcutNameWrap: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    },
    /** Selected group: full rounded tile (not a left-edge bar only) */
    groupShortcutActive: {
      backgroundColor: colors.owedSoft,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    groupShortcutName: {
      flex: 1,
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      minWidth: 0,
    },
    groupShortcutCcy: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.currencyMeta,
      letterSpacing: 0.3,
      flexShrink: 0,
    },
  });
}

function tabBarIconForRoute(
  name: keyof MainTabParamList,
): keyof typeof Ionicons.glyphMap {
  switch (name) {
    case "Groups":
      return "home-outline";
    case "Friends":
      return "person-outline";
    case "Activity":
      return "time-outline";
    case "AiReceipt":
      return "sparkles-outline";
    case "Account":
      return "person-circle-outline";
    default:
      return "ellipse-outline";
  }
}

function groupIdFromGroupsStackState(stackState: {
  routes?: { name: string; params?: { groupId?: string } }[];
  index?: number;
}): string | undefined {
  if (!stackState.routes?.length) return undefined;
  const idx = stackState.index ?? 0;
  const route = stackState.routes[idx];
  if (route?.name === "GroupDetail" && route.params?.groupId) {
    return route.params.groupId;
  }
  return undefined;
}

/**
 * Returns the focused tab's name (e.g. "Friends", "Activity", "Groups").
 * The global brand header is hidden on the redesigned tabs that own a
 * page-level title row.
 */
function activeTabFromNavState(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const ns = state as {
    routes?: { name: string; state?: unknown }[];
    index?: number;
  };
  const mainRoute = ns.routes?.find((r) => r.name === "Main");
  if (mainRoute?.state) {
    const inner = mainRoute.state as {
      routes?: { name: string }[];
      index?: number;
    };
    const idx = inner.index ?? 0;
    return inner.routes?.[idx]?.name;
  }
  const idx = ns.index ?? 0;
  return ns.routes?.[idx]?.name;
}

/**
 * Returns true when the focused screen sits inside the Groups stack but
 * isn't the root (`GroupsList`). All inner screens own their own stack
 * header, so the global brand bar would just stack on top of theirs.
 */
function activeGroupsInnerRouteFromNavState(state: unknown): boolean {
  if (!state || typeof state !== "object") return false;
  const ns = state as {
    routes?: { name: string; state?: unknown }[];
    index?: number;
  };
  const mainRoute = ns.routes?.find((r) => r.name === "Main");
  const tabState = (mainRoute?.state ?? ns) as {
    routes?: { name: string; state?: unknown }[];
    index?: number;
  };
  const tabIdx = tabState.index ?? 0;
  const tabRoute = tabState.routes?.[tabIdx];
  if (tabRoute?.name !== "Groups") return false;
  const stackState = tabRoute.state as
    | { routes?: { name: string }[]; index?: number }
    | undefined;
  if (!stackState?.routes?.length) return false;
  const stackIdx = stackState.index ?? 0;
  const innerName = stackState.routes[stackIdx]?.name;
  return !!innerName && innerName !== "GroupsList";
}

/**
 * Resolves the focused group from navigation state whether the selector receives
 * the root stack (Main → tabs) or the tab navigator.
 */
function activeGroupIdFromNavState(state: unknown): string | undefined {
  if (!state || typeof state !== "object") return undefined;
  const ns = state as { routes?: { name: string; state?: unknown }[] };

  const groupsRoute = ns.routes?.find((r) => r.name === "Groups");
  if (groupsRoute?.state) {
    const gid = groupIdFromGroupsStackState(
      groupsRoute.state as {
        routes?: { name: string; params?: { groupId?: string } }[];
        index?: number;
      },
    );
    if (gid) return gid;
  }

  const mainRoute = ns.routes?.find((r) => r.name === "Main");
  if (mainRoute?.state) {
    return activeGroupIdFromNavState(mainRoute.state);
  }

  return undefined;
}

function userInitial(p: LocalUserProfile): string {
  const s = p.name?.trim() ?? "Y";
  return s.slice(0, 1).toUpperCase() || "Y";
}

function WebSidebar() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { db, dataRevision } = useTallyData();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(
    () => buildWebSidebarStyles(colors, isRTL),
    [colors, isRTL],
  );
  const tabItems = useMemo(
    () =>
      (["Groups", "Friends", "AiReceipt", "Activity"] as const).map((name) => ({
        name,
        label: t(`tabs.${name}.label`),
        hint: t(`tabs.${name}.hint`),
        icon: tabBarIconForRoute(name),
      })),
    [t],
  );
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [me, setMe] = useState<LocalUserProfile | null>(null);
  const [byGroupMyBal, setByGroupMyBal] = useState<Record<string, number>>({});
  const activeGroupId = useNavigationState(activeGroupIdFromNavState);
  const groupsEpoch = useGroupsListEpoch();
  const profileLoadId = useRef(0);

  // useFocusEffect does not re-run when `Main` stays focused (e.g. after deleting a
  // group); sync with the groups list when data changes in other views.
  // `listGroups` is async: without invalidating in-flight work, a slower, older
  // query can finish after a newer one and leave the sidebar out of date.
  useEffect(() => {
    let live = true;
    void (async () => {
      const next = await listGroups(db);
      if (live) setGroups(next);
    })();
    return () => {
      live = false;
    };
  }, [db, groupsEpoch, dataRevision]);

  useEffect(() => {
    const n = ++profileLoadId.current;
    void (async () => {
      const p = await getLocalUserProfile(db);
      if (n === profileLoadId.current) setMe(p);
    })();
  }, [db, groupsEpoch, dataRevision]);

  useEffect(() => {
    if (groups.length === 0) {
      setByGroupMyBal({});
      return;
    }
    let live = true;
    void (async () => {
      const next: Record<string, number> = {};
      await Promise.all(
        groups.map(async (g) => {
          const b = await getGroupBalances(db, g.id);
          if (live) {
            next[g.id] = b.get(getLocalUserId()) ?? 0;
          }
        }),
      );
      if (live) setByGroupMyBal({ ...next });
    })();
    return () => {
      live = false;
    };
  }, [db, groups, groupsEpoch, dataRevision]);

  const go = useCallback(
    (name: keyof MainTabParamList) => {
      switch (name) {
        case "Groups":
          navigation.navigate("Main", {
            screen: "Groups",
            params: { screen: "GroupsList" },
          });
          break;
        case "Friends":
          navigation.navigate("Main", { screen: "Friends" });
          break;
        case "Activity":
          navigation.navigate("Main", { screen: "Activity" });
          break;
        case "AiReceipt":
          navigation.navigate("Main", { screen: "AiReceipt" });
          break;
        case "Account":
          navigation.navigate("Main", { screen: "Account" });
          break;
      }
    },
    [navigation],
  );

  const goGroup = useCallback(
    (groupId: string) => {
      navigation.navigate("Main", {
        screen: "Groups",
        params: { screen: "GroupDetail", params: { groupId } },
      });
    },
    [navigation],
  );

  return (
    <View style={styles.sidebar} accessibilityRole="menu">
      <View
        style={[
          styles.logoContainer,
          Platform.OS === "web" ? { marginBottom: 24 } : null,
        ]}
      >
        <Image
          source={require("../../assets/Tally.jpg")}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Tally logo"
        />
      </View>
      {Platform.OS !== "web" ? (
        <Text style={styles.sidebarBrand}>Tally</Text>
      ) : null}
      <View style={styles.navMain}>
        {tabItems.map((row) => (
          <Pressable
            key={row.name}
            style={(s) => {
              const pressed = s.pressed;
              const hovered = "hovered" in s && s.hovered ? s.hovered : false;
              return [
                styles.sidebarItem,
                (pressed || hovered) && styles.sidebarItemPressed,
                Platform.OS === "web" && hovered
                  ? ({ transform: [{ scale: 0.99 }], cursor: "pointer" } as ViewStyle)
                  : null,
              ];
            }}
            onPress={() => go(row.name)}
          >
            <View style={styles.navRow}>
              <View style={styles.navIcon}>
                <Ionicons name={row.icon} size={20} color={colors.muted} />
              </View>
              <View style={styles.navLabelCol}>
                <Text style={styles.sidebarItemLabel}>{row.label}</Text>
                <Text style={styles.sidebarItemHint}>{row.hint}</Text>
              </View>
            </View>
          </Pressable>
        ))}

        {groups.length > 0 ? (
          <View style={styles.groupShortcuts}>
            <Text style={styles.groupShortcutsTitle}>
              {t("sidebar.groupShortcuts")}
            </Text>
            <ScrollView
              style={{ maxHeight: 200 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {groups.slice(0, 12).map((g) => {
                const raw = byGroupMyBal[g.id] ?? 0;
                return (
                  <Pressable
                    key={g.id}
                    style={(s) => {
                      const pressed = s.pressed;
                      const hovered = "hovered" in s && s.hovered ? s.hovered : false;
                      return [
                        styles.groupShortcut,
                        g.id === activeGroupId && styles.groupShortcutActive,
                        (pressed || hovered) && styles.sidebarItemPressed,
                        Platform.OS === "web" && hovered
                          ? ({ transform: [{ scale: 0.99 }], cursor: "pointer" } as ViewStyle)
                          : null,
                      ];
                    }}
                    onPress={() => goGroup(g.id)}
                  >
                    <View style={styles.groupShortcutNameWrap}>
                      <View
                        style={[
                          styles.groupDot,
                          { backgroundColor: colors.currencyMeta },
                          raw > 0 && { backgroundColor: colors.owed },
                          raw < 0 && { backgroundColor: colors.owe },
                        ]}
                        accessibilityLabel=""
                      />
                      <AutoDirectionText
                        style={styles.groupShortcutName}
                        numberOfLines={1}
                      >
                        {g.name}
                      </AutoDirectionText>
                    </View>
                    <Text style={styles.groupShortcutCcy}>{g.currency}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>

      <Pressable
        style={({ pressed }) => [styles.profileBlock, pressed && styles.profileRowPressed]}
        onPress={() => go("Account")}
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.profileA11y")}
      >
        <View style={styles.profileRow}>
          <View style={styles.profileAvatar}>
            {me?.avatarUri ? (
              <Image
                source={{ uri: me.avatarUri }}
                style={styles.profileAvatarImg}
                accessibilityIgnoresInvertColors
              />
            ) : (
              <Text style={styles.profileAvatarL}>
                {me ? userInitial(me) : "•"}
              </Text>
            )}
          </View>
          <View style={styles.navLabelCol}>
            <Text style={styles.profileName} numberOfLines={1}>
              {me?.name?.trim() || t("addExpense.memberFallback")}
            </Text>
            <Text style={styles.profileSub}>{t("sidebar.profileSub")}</Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.muted}
            style={isRTL ? { transform: [{ scaleX: -1 }] } : undefined}
          />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * Dual-half pill FAB that lives at the navigator level so it follows the
 * user across tabs. Mirrors the Groups-tab pill (mic + plus). Hidden on the
 * Groups tab (which owns its own pill with a tour anchor), on AiReceipt
 * (which IS the mic destination), and on wide layouts where the sidebar
 * covers the role.
 *  - Plus  → AddExpense in the most recent group, or CreateGroup when none.
 *  - Mic   → AiReceipt with autoRecord, or CreateGroup when no groups exist.
 */
function GlobalFab({ visible }: { visible: boolean }) {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { db } = useTallyData();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => buildMainTabsStyles(colors, isRTL, false),
    [colors, isRTL],
  );

  const onPlusPress = useCallback(async () => {
    const groups = await listGroups(db);
    const latest = groups[0];
    if (latest) {
      navigation.navigate("Main", {
        screen: "Groups",
        params: { screen: "AddExpense", params: { groupId: latest.id } },
      });
      return;
    }
    navigation.navigate("Main", {
      screen: "Groups",
      params: { screen: "CreateGroup" },
    });
  }, [db, navigation]);

  const onMicPress = useCallback(async () => {
    const groups = await listGroups(db);
    const latest = groups[0];
    if (latest) {
      navigation.navigate("AiReceipt", { autoRecord: true });
      return;
    }
    navigation.navigate("Main", {
      screen: "Groups",
      params: { screen: "CreateGroup" },
    });
  }, [db, navigation]);

  if (!visible) return null;

  // Sit above the standard tab bar (~50px) plus its bottom inset, with a
  // small additional gap so the shadow doesn't clip the bar.
  const bottom = Math.max(72, 50 + insets.bottom + 12);

  return (
    <View style={[styles.globalFab, { bottom }]}>
      <Pressable
        style={({ pressed }) => [
          styles.globalFabHalf,
          pressed && styles.globalFabPressed,
        ]}
        onPress={() => void onMicPress()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t("groupList.fabMicA11y")}
      >
        <Ionicons name="mic" size={22} color="#fff" />
      </Pressable>
      <View style={styles.globalFabDivider} pointerEvents="none" />
      <Pressable
        style={({ pressed }) => [
          styles.globalFabHalf,
          pressed && styles.globalFabPressed,
        ]}
        onPress={() => void onPlusPress()}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={t("nav.addExpense")}
      >
        <Text style={styles.globalFabPlusText}>+</Text>
      </Pressable>
    </View>
  );
}

export function MainTabs() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { colors, resolvedScheme } = useTheme();
  const { t, isRTL } = useLocale();
  const isGlass = Platform.OS === "web" && resolvedScheme === "dark";
  const webGlass: ViewStyle = useMemo(
    () =>
      isGlass
        ? ({
            backdropFilter: "blur(14px)" as const,
            WebkitBackdropFilter: "blur(14px)" as const,
          } as ViewStyle)
        : {},
    [isGlass],
  );
  const styles = useMemo(
    () => buildMainTabsStyles(colors, isRTL, isGlass),
    [colors, isRTL, isGlass],
  );
  // Tabs that render a page-level title row of their own and shouldn't
  // get the global Tally/brand header layered above them.
  const activeTab = useNavigationState(activeTabFromNavState);
  const inGroupsInnerScreen = useNavigationState(
    activeGroupsInnerRouteFromNavState,
  );
  const hideBrandHeader =
    activeTab === "Friends" ||
    activeTab === "Activity" ||
    activeTab === "Account" ||
    activeTab === "AiReceipt" ||
    inGroupsInnerScreen;
  // Show the global FAB only on tabs that don't already provide their own
  // primary "add expense" affordance, and only on narrow layouts (wide
  // screens use the sidebar instead).
  const showGlobalFab =
    !wide &&
    (activeTab === "Friends" || activeTab === "Activity") &&
    !inGroupsInnerScreen;

  return (
    <GroupsListSyncProvider>
      <View style={styles.root}>
        {wide ? (
          <View
            style={[styles.sidebarSlot, isGlass && webGlass]}
            pointerEvents="box-none"
          >
            <WebSidebar />
          </View>
        ) : null}
        <View style={[styles.tabColumn, wide && styles.tabColumnInset]}>
          {/* Global brand header: shows Tally / bell / avatar on tabs that  */}
          {/* don't own a page-level title row. Hidden on wide screens —     */}
          {/* the sidebar covers that role there.                            */}
          {wide || hideBrandHeader ? null : <GroupsListHeader />}
          <Tab.Navigator
            screenOptions={({ route }) => ({
              // The global header above covers every tab screen, so the
              // per-screen title bar is hidden to avoid a duplicate row.
              headerShown: false,
              headerTitleAlign: "center" as const,
              headerShadowVisible: false,
              contentStyle: {
                backgroundColor: colors.bg,
                flex: 1,
              },
              headerStyle: { backgroundColor: colors.bg },
              tabBarStyle: wide ? { display: "none" } : undefined,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.muted,
              tabBarIcon: ({ color, size, focused }) => {
                const tabName = route.name as keyof MainTabParamList;
                if (tabName === "AiReceipt") {
                  return (
                    <Ionicons
                      name={focused ? "sparkles" : "sparkles-outline"}
                      size={size}
                      color={color}
                    />
                  );
                }
                return (
                  <Ionicons
                    name={tabBarIconForRoute(tabName)}
                    size={size}
                    color={color}
                  />
                );
              },
            })}
          >
            <Tab.Screen
              name="Groups"
              component={GroupsStackNavigator}
              options={{
                headerShown: false,
                title: t("tabs.Groups.label"),
                tabBarLabel: t("tabs.Groups.label"),
              }}
            />
            <Tab.Screen
              name="Friends"
              component={FriendsScreen}
              options={{
                title: t("tabs.Friends.label"),
                tabBarLabel: t("tabs.Friends.label"),
              }}
            />
            <Tab.Screen
              name="AiReceipt"
              component={AiReceiptScreen}
              options={{
                title: t("tabs.AiReceipt.label"),
                tabBarLabel: t("tabs.AiReceipt.label"),
              }}
            />
            <Tab.Screen
              name="Activity"
              component={ActivityScreen}
              options={{
                title: t("tabs.Activity.label"),
                tabBarLabel: t("tabs.Activity.label"),
              }}
            />
            {/* Settings tab: hosts profile + preferences. Also reachable */}
            {/* from the Groups list header avatar and the web sidebar.    */}
            <Tab.Screen
              name="Account"
              component={AccountScreen}
              options={{
                title: t("tabs.Account.label"),
                tabBarLabel: t("tabs.Account.label"),
              }}
            />
          </Tab.Navigator>
          <GlobalFab visible={showGlobalFab} />
        </View>
      </View>
    </GroupsListSyncProvider>
  );
}
