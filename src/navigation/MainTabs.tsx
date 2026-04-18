import Ionicons from "@expo/vector-icons/Ionicons";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useNavigation, useNavigationState } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useCallback, useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { AccountScreen } from "../screens/AccountScreen";
import { ActivityScreen } from "../screens/ActivityScreen";
import { FriendsScreen } from "../screens/FriendsScreen";
import { AutoDirectionText } from "../components/AutoDirectionText";
import { SyncStatusPill } from "../components/SyncStatusPill";
import { listGroups, type GroupRow } from "../data/tallyRepo";
import { useDatabase } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { GroupsListSyncProvider, useGroupsListEpoch } from "./GroupsListSyncContext";
import type { MainTabParamList, RootStackParamList } from "./types";
import { GroupsStackNavigator } from "./GroupsStackNavigator";

const Tab = createBottomTabNavigator<MainTabParamList>();

const WIDE_BREAKPOINT = 900;

const SIDEBAR_W = 240;

function buildMainTabsStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
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
      backgroundColor: colors.surface,
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
      paddingHorizontal: 12,
      paddingBottom: 24,
    },
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      paddingVertical: 8,
      paddingRight: 10,
      paddingLeft: 10,
      borderRadius: 10,
      marginBottom: 2,
      direction: "ltr",
    },
    groupShortcutActive: isRTL
      ? {
          backgroundColor: colors.owedSoft,
          borderRightWidth: 3,
          borderRightColor: colors.primary,
          paddingRight: 7,
        }
      : {
          backgroundColor: colors.owedSoft,
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          paddingLeft: 7,
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

function WebSidebar() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const db = useDatabase();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(
    () => buildWebSidebarStyles(colors, isRTL),
    [colors, isRTL],
  );
  const tabItems = useMemo(
    () =>
      (["Groups", "Friends", "Activity", "Account"] as const).map((name) => ({
        name,
        label: t(`tabs.${name}.label`),
        hint: t(`tabs.${name}.hint`),
      })),
    [t],
  );
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const activeGroupId = useNavigationState(activeGroupIdFromNavState);
  const groupsEpoch = useGroupsListEpoch();

  const loadGroups = useCallback(async () => {
    setGroups(await listGroups(db));
  }, [db]);

  // useFocusEffect does not re-run when `Main` stays focused (e.g. after deleting a
  // group); sync with the groups list when data changes in other views.
  useEffect(() => {
    void loadGroups();
  }, [db, loadGroups, groupsEpoch]);

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
      <Text style={styles.sidebarBrand}>Tally</Text>
      <SyncStatusPill />
      {tabItems.map((row) => (
        <Pressable
          key={row.name}
          style={({ pressed }) => [
            styles.sidebarItem,
            pressed && styles.sidebarItemPressed,
          ]}
          onPress={() => go(row.name)}
        >
          <Text style={styles.sidebarItemLabel}>{row.label}</Text>
          <Text style={styles.sidebarItemHint}>{row.hint}</Text>
        </Pressable>
      ))}
      {groups.length > 0 ? (
        <View style={styles.groupShortcuts}>
          <Text style={styles.groupShortcutsTitle}>
            {t("sidebar.groupShortcuts")}
          </Text>
          {groups.slice(0, 8).map((g) => (
            <Pressable
              key={g.id}
              style={({ pressed }) => [
                styles.groupShortcut,
                g.id === activeGroupId && styles.groupShortcutActive,
                pressed && styles.sidebarItemPressed,
              ]}
              onPress={() => goGroup(g.id)}
            >
              <AutoDirectionText
                style={styles.groupShortcutName}
                numberOfLines={1}
              >
                {g.name}
              </AutoDirectionText>
              <Text style={styles.groupShortcutCcy}>{g.currency}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function MainTabs() {
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_BREAKPOINT;
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const styles = useMemo(
    () => buildMainTabsStyles(colors, isRTL),
    [colors, isRTL],
  );

  return (
    <GroupsListSyncProvider>
      <View style={styles.root}>
        {wide ? (
          <View style={styles.sidebarSlot} pointerEvents="box-none">
            <WebSidebar />
          </View>
        ) : null}
        <View style={[styles.tabColumn, wide && styles.tabColumnInset]}>
          {wide ? null : (
            <View style={{ paddingHorizontal: 12, paddingTop: 6, paddingBottom: 2 }}>
              <SyncStatusPill />
            </View>
          )}
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: true,
              headerTitleAlign: "center" as const,
              headerShadowVisible: false,
              contentStyle: {
                backgroundColor: colors.bg,
                flex: 1,
                ...(isRTL && { direction: "rtl" as const }),
              },
              headerStyle: { backgroundColor: colors.bg },
              tabBarStyle: wide ? { display: "none" } : undefined,
              tabBarActiveTintColor: colors.primary,
              tabBarInactiveTintColor: colors.muted,
              tabBarIcon: ({ color, size }) => (
                <Ionicons
                  name={tabBarIconForRoute(route.name as keyof MainTabParamList)}
                  size={size}
                  color={color}
                />
              ),
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
              name="Activity"
              component={ActivityScreen}
              options={{
                title: t("tabs.Activity.label"),
                tabBarLabel: t("tabs.Activity.label"),
              }}
            />
            <Tab.Screen
              name="Account"
              component={AccountScreen}
              options={{
                title: t("tabs.Account.label"),
                tabBarLabel: t("tabs.Account.label"),
              }}
            />
          </Tab.Navigator>
        </View>
      </View>
    </GroupsListSyncProvider>
  );
}
