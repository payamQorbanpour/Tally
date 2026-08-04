import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import { getAppStoreUrl } from "../premium/premiumConfig";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

/**
 * Full-screen, blocking gate rendered instead of the app when the running
 * build is below `min_supported_version` (see `App.tsx`'s `ThemedApp`).
 *
 * There is no dismiss affordance by design — this only ever renders when
 * `isBelowMinimum` is certain the client must update, and that check fails
 * open on every uncertain case, so a user who reaches this screen genuinely
 * needs to update. The CTA is hidden rather than shown-but-dead when no
 * store URL is configured for this platform.
 */
export function ForceUpdateScreen() {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const storeUrl = getAppStoreUrl();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.page}>
        <View style={styles.iconTile}>
          <Ionicons name="arrow-up-circle-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t("forceUpdate.title")}</Text>
        <Text style={styles.body}>{t("forceUpdate.body")}</Text>
      </View>

      {storeUrl ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
          <AppButton
            variant="primary"
            fullWidth
            label={t("forceUpdate.cta")}
            onPress={() => void Linking.openURL(storeUrl)}
          />
        </View>
      ) : null}
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const tc = { textAlign: "center" as const };
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      writingDirection: isRTL ? "rtl" : "ltr",
      ...(Platform.OS === "web"
        ? { minHeight: "100vh" as unknown as number }
        : {}),
    },
    page: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    iconTile: {
      width: 64,
      height: 64,
      borderRadius: 20,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.3,
      marginBottom: 8,
      ...tc,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      maxWidth: 360,
      ...tc,
    },
    footer: { paddingHorizontal: 22, paddingTop: 8 },
  });
}
