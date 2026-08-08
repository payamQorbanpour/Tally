import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { Text } from "../ui/AppText";

/**
 * Non-blocking strip pinned to the top of the screen, driven by
 * `maintenance_message` remote config (already resolved to the current
 * locale by the caller). Renders nothing — not an empty box — when there's
 * no message, so it never reserves layout space or eats touches when unused.
 */
export function MaintenanceBanner({ message }: { message: string | null }) {
  const { colors } = useTheme();
  const { isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  if (!message || !message.trim()) return null;

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <View style={styles.bar}>
        <Ionicons name="warning-outline" size={16} color={colors.owe} />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
    root: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      paddingHorizontal: 12,
    },
    bar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.oweSoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    text: {
      flex: 1,
      fontSize: 13,
      fontWeight: "600",
      color: colors.owe,
      lineHeight: 18,
    },
  });
}
