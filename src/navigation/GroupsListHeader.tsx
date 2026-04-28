import Ionicons from "@expo/vector-icons/Ionicons";
import type {
  CompositeNavigationProp,
  NavigationProp,
} from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTallyData } from "../db/DatabaseContext";
import {
  getLocalUserProfile,
  type LocalUserProfile,
} from "../data/tallyRepo";
import { useNotificationsUnreadCount } from "../hooks/useNotificationsUnreadCount";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "../ui/AppText";
import { NotificationsPopover } from "../components/NotificationsPopover";
import type { GroupsStackParamList, RootStackParamList } from "./types";

/**
 * Custom header for the Groups list: brand logo on the leading edge,
 * notification bell + profile avatar on the trailing edge.
 *
 * The bell is a soft wink to a future notifications inbox — today it jumps
 * to the Activity tab (closest thing we have). The avatar opens the Account
 * tab, which is why the dedicated Account tab is gone from the tab bar.
 */
export function GroupsListHeader() {
  const { colors, resolvedScheme } = useTheme();
  const { isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<
    CompositeNavigationProp<
      NavigationProp<RootStackParamList>,
      NativeStackNavigationProp<GroupsStackParamList>
    >
  >();
  const { db, dataRevision } = useTallyData();
  const styles = useMemo(
    () => buildStyles(colors, isRTL),
    [colors, isRTL],
  );

  const [me, setMe] = useState<LocalUserProfile | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const loadId = useRef(0);
  const unreadCount = useNotificationsUnreadCount();

  useEffect(() => {
    const n = ++loadId.current;
    void (async () => {
      const p = await getLocalUserProfile(db);
      if (n === loadId.current) setMe(p);
    })();
  }, [db, dataRevision]);

  const goNotifications = () => setNotifOpen(true);
  const goAccount = () => navigation.navigate("Main", { screen: "Account" });
  const goScan = () =>
    navigation.navigate("Main", {
      screen: "Groups",
      params: { screen: "QrScan" },
    });
  const goHome = () =>
    navigation.navigate("Main", {
      screen: "Groups",
      params: { screen: "GroupsList" },
    });

  const avatarInitial = (me?.name?.trim()?.slice(0, 1) ?? "").toUpperCase() || "•";

  const isDark = resolvedScheme === "dark";

  return (
    <View
      style={[
        styles.root,
        {
          // Floor the top padding so the brand row never hugs the viewport
          // edge on platforms where `insets.top` is 0 (web, some desktop
          // responsive previews). Native devices with a notch / status bar
          // still use the full `insets.top`.
          paddingTop: Math.max(insets.top, 12) + 6,
          paddingBottom: 10,
        },
      ]}
    >
      <Pressable
        onPress={goHome}
        accessibilityRole="link"
        accessibilityLabel="Tally — go to home"
        hitSlop={8}
        style={({ pressed }) => [styles.brandRow, pressed && styles.pressed]}
      >
        <Image
          source={require("../../assets/favicon.png")}
          style={styles.brandLogo}
          accessibilityIgnoresInvertColors
        />
        <Text
          style={styles.logo}
          accessibilityRole="header"
          accessibilityLabel="Tally"
        >
          Tally
        </Text>
      </Pressable>
      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            isDark && styles.iconBtnDark,
            pressed && styles.pressed,
          ]}
          onPress={goScan}
          accessibilityRole="button"
          accessibilityLabel="Scan QR code"
          hitSlop={8}
        >
          <Ionicons name="scan-outline" size={20} color={colors.text} />
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.iconBtn,
            isDark && styles.iconBtnDark,
            pressed && styles.pressed,
          ]}
          onPress={goNotifications}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
          hitSlop={8}
        >
          <Ionicons
            name="notifications-outline"
            size={20}
            color={colors.text}
          />
          {unreadCount > 0 ? <View style={styles.bellDot} /> : null}
        </Pressable>
        <Pressable
          style={({ pressed }) => [
            styles.avatar,
            pressed && styles.pressed,
          ]}
          onPress={goAccount}
          accessibilityRole="button"
          accessibilityLabel="Account"
          hitSlop={8}
        >
          {me?.avatarUri ? (
            <Image
              source={{ uri: me.avatarUri }}
              style={styles.avatarImg}
              accessibilityIgnoresInvertColors
            />
          ) : (
            <Text style={styles.avatarLetter}>{avatarInitial}</Text>
          )}
        </Pressable>
      </View>
      <NotificationsPopover
        visible={notifOpen}
        onClose={() => setNotifOpen(false)}
      />
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
    root: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.bg,
      paddingHorizontal: 16,
      gap: 12,
    } as ViewStyle,
    brandRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
    },
    brandLogo: {
      width: 28,
      height: 28,
      borderRadius: 6,
    },
    logo: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.primary,
      letterSpacing: -0.5,
    },
    actions: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    iconBtnDark: {
      backgroundColor: colors.inputSurface,
    },
    bellDot: {
      position: "absolute",
      top: 10,
      right: 10,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      borderWidth: 1.5,
      borderColor: colors.bg,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
      overflow: "hidden",
    },
    avatarImg: { width: 40, height: 40, borderRadius: 20 },
    avatarLetter: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "800",
    },
    pressed: { opacity: 0.8 },
  });
}
