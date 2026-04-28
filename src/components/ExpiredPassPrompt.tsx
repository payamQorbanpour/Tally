import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import type { RootStackParamList } from "../navigation/types";
import { usePremium } from "../premium/PremiumContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

const EXTEND_PRICE_BY_TYPE: Record<
  import("../premium/passes").PassType,
  string
> = {
  night: "$0.99",
  trip: "$2.99",
  explorer: "$7.99",
};

/**
 * Bottom-sheet style modal shown when the user attempts a premium-only
 * action without an active pass. Lists what's preserved (data is never
 * downgraded), what pauses, and offers two paths:
 *
 *   1. Extend — only when the user has a recently-expired pass row, so
 *      the cheaper extension SKU stays relevant.
 *   2. See all passes — always available; pushes the Plans screen.
 *
 * `visible` is owned by the caller (typically the screen that hit the
 * premium gate). The modal swallows the back button on its own.
 */
export function ExpiredPassPrompt({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  const { colors, resolvedScheme } = useTheme();
  const { t, isRTL } = useLocale();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { activePass, hasActivePass, busy, requestExtension } = usePremium();

  const styles = useMemo(
    () => buildStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
  );

  // Extension is offered when a prior pass exists *and* it isn't currently
  // live (otherwise the user wouldn't be staring at this modal). The Plans
  // screen handles extending an actually-active pass.
  const canExtend = !!activePass && !hasActivePass;
  const extendPrice = activePass
    ? EXTEND_PRICE_BY_TYPE[activePass.type]
    : null;

  const onExtendTap = async () => {
    await requestExtension();
    onDismiss();
  };

  const onSeeAll = () => {
    onDismiss();
    navigation.navigate("Plans");
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.scrim} onPress={onDismiss} accessibilityLabel={t("account.cancel")}>
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
          accessible={false}
        >
          <View style={styles.header}>
            <Ionicons
              name="lock-closed"
              size={20}
              color={resolvedScheme === "dark" ? "#a8a2e6" : "#4f46e5"}
            />
            <Text style={styles.title}>{t("plans.expiredTitle")}</Text>
          </View>
          <Text style={styles.body}>{t("plans.expiredBody")}</Text>

          <View style={styles.column}>
            <Text style={styles.columnHeader}>
              {t("plans.expiredKeepHeader")}
            </Text>
            <KeepRow text={t("plans.expiredKeep1")} styles={styles} />
            <KeepRow text={t("plans.expiredKeep2")} styles={styles} />
            <KeepRow text={t("plans.expiredKeep3")} styles={styles} />
          </View>

          <View style={styles.column}>
            <Text style={styles.columnHeader}>
              {t("plans.expiredPauseHeader")}
            </Text>
            <PauseRow text={t("plans.expiredPause1")} styles={styles} />
            <PauseRow text={t("plans.expiredPause2")} styles={styles} />
            <PauseRow text={t("plans.expiredPause3")} styles={styles} />
          </View>

          {canExtend && extendPrice ? (
            <AppButton
              variant="primary"
              fullWidth
              label={
                busy
                  ? t("premium.gateBusy")
                  : t("plans.expiredExtendCta", { price: extendPrice })
              }
              onPress={() => void onExtendTap()}
              disabled={busy}
              accessibilityLabel={t("plans.ctaExtend")}
              style={styles.primaryCta}
            />
          ) : null}

          <AppButton
            variant={canExtend ? "outline" : "primary"}
            fullWidth
            label={t("plans.expiredSeeAllCta")}
            onPress={onSeeAll}
            accessibilityLabel={t("plans.expiredSeeAllCta")}
            style={canExtend ? styles.secondaryCta : styles.primaryCta}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function KeepRow({
  text,
  styles,
}: {
  text: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name="checkmark-circle" size={16} color={styles.__keepIconColor} />
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

function PauseRow({
  text,
  styles,
}: {
  text: string;
  styles: ReturnType<typeof buildStyles>;
}) {
  return (
    <View style={styles.row}>
      <Ionicons name="pause-circle" size={16} color={styles.__pauseIconColor} />
      <Text style={[styles.rowText, styles.rowTextMuted]}>{text}</Text>
    </View>
  );
}

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const keepIconColor =
    resolvedScheme === "dark" ? "#34D399" : "#10B981";
  const pauseIconColor = colors.muted;

  const styles = StyleSheet.create({
    scrim: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.55)",
      justifyContent: "flex-end",
    },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingTop: 22,
      paddingBottom: 28,
      gap: 10,
    },
    header: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 4,
    },
    title: {
      flex: 1,
      fontSize: 18,
      fontWeight: "800",
      color: colors.text,
      ...te,
    },
    body: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      marginBottom: 8,
      ...te,
    },
    column: {
      gap: 6,
      marginTop: 4,
      marginBottom: 4,
    },
    columnHeader: {
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0.6,
      textTransform: "uppercase",
      color: colors.muted,
      marginBottom: 4,
      ...te,
    },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "flex-start",
      gap: 8,
    },
    rowText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      ...te,
    },
    rowTextMuted: {
      color: colors.muted,
    },
    primaryCta: {
      marginTop: 14,
    },
    secondaryCta: {
      marginTop: 8,
    },
  });

  (styles as unknown as { __keepIconColor: string; __pauseIconColor: string })
    .__keepIconColor = keepIconColor;
  (styles as unknown as { __keepIconColor: string; __pauseIconColor: string })
    .__pauseIconColor = pauseIconColor;

  return styles as typeof styles & {
    __keepIconColor: string;
    __pauseIconColor: string;
  };
}
