import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import type { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

/**
 * Compact sign-in / premium upsell card that hovers over a dimmed feature
 * card (Cloud sync on AccountScreen, AI Receipt screen, etc.). Two modes:
 *  - "signin": user has no Supabase session → primary CTA pushes the
 *    full AuthScreen, which owns every sign-in path (email, Google).
 *  - "premium": user is signed in but doesn't have premium → primary
 *    CTA pushes the in-app `Plans` screen (Free / Plus / Trip Pass).
 *
 * `context` selects the upsell copy ("cloudSync" — default — or "ai" for
 * the AI Receipt screen). Layout is intentionally identical across the
 * app so the gate reads as a single recognizable upsell shape.
 */
export function CloudSyncGateOverlay({
  mode,
  context = "cloudSync",
}: {
  mode: "signin" | "premium";
  context?: "cloudSync" | "ai";
}) {
  const { colors, resolvedScheme } = useTheme();
  const { t, isRTL } = useLocale();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  const { styles, proBadgeColor } = buildStyles(colors, isRTL, resolvedScheme);

  const onPrimary = () => {
    if (mode === "signin") {
      navigation.navigate("Auth");
      return;
    }
    navigation.navigate("Plans");
  };

  const title =
    context === "ai"
      ? t("premium.gateAiTitle")
      : mode === "signin"
        ? t("account.gateOverlaySignInTitle")
        : t("premium.gateSyncTitle");
  const body =
    context === "ai"
      ? t("premium.gateAiBody")
      : mode === "signin"
        ? t("account.gateOverlaySignInBody")
        : t("premium.gateSyncBody");
  const primaryLabel =
    mode === "signin"
      ? t("account.gateOverlaySignInCta")
      : context === "ai"
        ? t("account.aiGoCta")
        : t("account.cloudGoCta");

  return (
    <View style={styles.card} pointerEvents="auto">
      <View style={styles.headerRow}>
        <Text style={styles.title} numberOfLines={2}>
          {title.toUpperCase()}
        </Text>
        <View style={styles.proBadge}>
          <Ionicons name="lock-closed" size={11} color={proBadgeColor} />
          <Text style={styles.proBadgeText}>{t("account.gateOverlayPro")}</Text>
        </View>
      </View>
      <Text style={styles.body}>{body}</Text>
      <AppButton
        variant="primary"
        fullWidth
        label={primaryLabel}
        onPress={onPrimary}
        style={styles.primaryBtn}
        accessibilityLabel={primaryLabel}
      />
    </View>
  );
}

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const proBadgeBg =
    resolvedScheme === "dark"
      ? "rgba(168, 162, 230, 0.20)"
      : "rgba(99, 102, 241, 0.12)";
  const proBadgeColor =
    resolvedScheme === "dark" ? "#a8a2e6" : "#4f46e5";
  const styles = StyleSheet.create({
    card: {
      width: "100%",
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: resolvedScheme === "dark" ? 0.4 : 0.16,
      shadowRadius: 18,
      elevation: 6,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    headerRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 10,
    },
    title: {
      flex: 1,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.6,
      color: colors.text,
      ...te,
    },
    proBadge: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      backgroundColor: proBadgeBg,
    },
    proBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: proBadgeColor,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      marginBottom: 14,
      ...te,
    },
    primaryBtn: {
      marginTop: 0,
    },
  });
  return { styles, proBadgeColor };
}
