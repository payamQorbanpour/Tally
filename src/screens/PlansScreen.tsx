import Ionicons from "@expo/vector-icons/Ionicons";
import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import type { RootStackParamList } from "../navigation/types";
import { usePremium } from "../premium/PremiumContext";
import { type PassType, passRemainingMs } from "../premium/passes";
import {
  getPassExtendProductId,
  getPassProductId,
  getSubscriptionWebUrl,
  isIapConfigured,
} from "../premium/premiumConfig";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

type PassCardData = {
  type: PassType;
  name: string;
  duration: string;
  price: string;
  extendPrice: string;
  tagline: string;
  /** Trip is the visual anchor — primary card. */
  highlight: boolean;
};

/**
 * Plans screen — Tally Passes (Night Out / Trip / Explorer).
 *
 * Free row sits at the top as a baseline. Three pass cards follow with
 * the same shared feature list (only the duration changes between them).
 * When a pass is already active, an "Active pass" banner replaces the
 * matching card's CTA with an "Extend Pass" button at the cheaper
 * extension price.
 */
export function PlansScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { colors, resolvedScheme } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const {
    activePass,
    hasActivePass,
    busy,
    lastError,
    requestPass,
    requestExtension,
    restorePurchases,
  } = usePremium();

  // Per-card "in flight" so the spinner doesn't bleed across all CTAs
  // when one is busy. Cleared when the provider's `busy` flips back.
  const [pending, setPending] = useState<
    "night" | "trip" | "explorer" | "extend" | "restore" | null
  >(null);
  useEffect(() => {
    if (!busy) setPending(null);
  }, [busy]);

  const styles = useMemo(
    () => buildStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
  );

  const iapAvailable = isIapConfigured() && Platform.OS !== "web";
  const webUrl = getSubscriptionWebUrl();

  const goBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    }
  };

  // Surface IAP errors as a single alert — `lastError` is set by the
  // provider on each failed call.
  const [shownError, setShownError] = useState<string | null>(null);
  useEffect(() => {
    if (!lastError || lastError === shownError) return;
    Alert.alert(t("plans.iapErrorTitle"), t("plans.iapErrorBody"));
    setShownError(lastError);
  }, [lastError, shownError, t]);

  const onBuyPass = async (type: PassType) => {
    setPending(type);
    if (!iapAvailable && !webUrl) {
      // Stub-mode (no SKUs and no web fallback): activate locally so the
      // soft-lock UX is still testable end-to-end.
      await requestPass(type);
      return;
    }
    if (!iapAvailable && webUrl) {
      await Linking.openURL(webUrl);
      setPending(null);
      return;
    }
    await requestPass(type);
  };

  const onExtend = async () => {
    if (!activePass) return;
    setPending("extend");
    await requestExtension();
  };

  const onRestore = async () => {
    setPending("restore");
    await restorePurchases();
  };

  const cards: PassCardData[] = useMemo(
    () => [
      {
        type: "night",
        name: t("plans.nightName"),
        duration: t("plans.nightDuration"),
        price: t("plans.nightPrice"),
        extendPrice: t("plans.nightExtendPrice"),
        tagline: t("plans.nightTagline"),
        highlight: false,
      },
      {
        type: "trip",
        name: t("plans.tripName"),
        duration: t("plans.tripDuration"),
        price: t("plans.tripPrice"),
        extendPrice: t("plans.tripExtendPrice"),
        tagline: t("plans.tripTagline"),
        highlight: true,
      },
      {
        type: "explorer",
        name: t("plans.explorerName"),
        duration: t("plans.explorerDuration"),
        price: t("plans.explorerPrice"),
        extendPrice: t("plans.explorerExtendPrice"),
        tagline: t("plans.explorerTagline"),
        highlight: false,
      },
    ],
    [t],
  );

  return (
    <View style={[styles.root, { paddingTop: Math.max(insets.top, 12) }]}>
      <View style={styles.topBar}>
        <Pressable
          onPress={goBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("nav.back")}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={26}
            color={colors.text}
          />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>{t("plans.title")}</Text>
          <Text style={styles.heroSubtitle}>{t("plans.subtitle")}</Text>
        </View>

        {hasActivePass && activePass ? (
          <ActivePassBanner
            activePass={activePass}
            cards={cards}
            styles={styles}
            t={t}
            onExtend={() => void onExtend()}
            extending={busy && pending === "extend"}
          />
        ) : null}

        {/* Free baseline row */}
        <View style={[styles.card, styles.cardFree]}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardName}>
              {t("plans.freeName").toUpperCase()}
            </Text>
            <Text style={styles.priceMain}>{t("plans.freePrice")}</Text>
          </View>
          <Text style={styles.cardTagline}>{t("plans.freeTagline")}</Text>
          <View style={styles.featureList}>
            <FeatureRow text={t("plans.freeFeature1")} styles={styles} />
            <FeatureRow text={t("plans.freeFeature2")} styles={styles} />
            <FeatureRow text={t("plans.freeFeature3")} styles={styles} />
          </View>
        </View>

        {/* Pass cards */}
        {cards.map((card) => {
          const isCurrent = hasActivePass && activePass?.type === card.type;
          return (
            <View
              key={card.type}
              style={[
                styles.card,
                card.highlight ? styles.cardHighlight : styles.cardPlain,
                isCurrent ? styles.cardActive : null,
              ]}
            >
              {card.highlight ? (
                <View style={styles.popularRibbon}>
                  <Ionicons name="star" size={12} color="#FFFFFF" />
                  <Text style={styles.popularRibbonText}>
                    {t("plans.tripBadge").toUpperCase()}
                  </Text>
                </View>
              ) : null}
              <View style={styles.cardHeaderRow}>
                <Text
                  style={[
                    styles.cardName,
                    card.highlight && styles.cardNameOnHighlight,
                  ]}
                >
                  {card.name.toUpperCase()}
                </Text>
                <Text
                  style={[
                    styles.durationPill,
                    card.highlight && styles.durationPillOnHighlight,
                  ]}
                >
                  {card.duration}
                </Text>
              </View>
              <View style={styles.priceRow}>
                <Text
                  style={[
                    styles.priceMain,
                    card.highlight && styles.priceMainOnHighlight,
                  ]}
                >
                  {card.price}
                </Text>
              </View>
              <Text
                style={[
                  styles.cardTagline,
                  card.highlight && styles.cardTaglineOnHighlight,
                ]}
              >
                {card.tagline}
              </Text>
              <View style={styles.featureList}>
                <FeatureRow
                  text={t("plans.passFeature1")}
                  styles={styles}
                  onHighlight={card.highlight}
                />
                <FeatureRow
                  text={t("plans.passFeature2")}
                  styles={styles}
                  onHighlight={card.highlight}
                />
                <FeatureRow
                  text={t("plans.passFeature3")}
                  styles={styles}
                  onHighlight={card.highlight}
                />
                <FeatureRow
                  text={t("plans.passFeature4")}
                  styles={styles}
                  onHighlight={card.highlight}
                />
              </View>
              <AppButton
                variant={card.highlight ? "primary" : "secondary"}
                fullWidth
                label={
                  isCurrent
                    ? t("plans.ctaActive")
                    : busy && pending === card.type
                      ? t("premium.gateBusy")
                      : t("plans.ctaBuy")
                }
                onPress={() => void onBuyPass(card.type)}
                disabled={isCurrent || (busy && pending === card.type)}
                accessibilityLabel={t("plans.ctaBuy")}
              />
            </View>
          );
        })}

        {/* Footer */}
        <View style={styles.footer}>
          {iapAvailable ? (
            <Pressable
              onPress={() => void onRestore()}
              disabled={busy && pending === "restore"}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("plans.restoreCta")}
              style={({ pressed }) => [
                styles.restoreBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.restoreText}>{t("plans.restoreCta")}</Text>
            </Pressable>
          ) : webUrl ? (
            <>
              <Text style={styles.webHint}>{t("plans.webFallbackHint")}</Text>
              <AppButton
                variant="ghost"
                label={t("plans.webFallbackCta")}
                onPress={() => void Linking.openURL(webUrl)}
                accessibilityLabel={t("plans.webFallbackCta")}
              />
            </>
          ) : null}
          <Text style={styles.legal}>{t("plans.legalFinePrint")}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

function ActivePassBanner({
  activePass,
  cards,
  styles,
  t,
  onExtend,
  extending,
}: {
  activePass: import("../premium/passes").ActivePass;
  cards: PassCardData[];
  styles: ReturnType<typeof buildStyles>;
  t: ReturnType<typeof useLocale>["t"];
  onExtend: () => void;
  extending: boolean;
}) {
  const card = cards.find((c) => c.type === activePass.type);
  const remainingMs = passRemainingMs(activePass);
  const remainingLabel = formatRemaining(remainingMs, t);
  const status = activePass.isExtended
    ? t("plans.activeStatusExtended")
    : t("plans.activeStatusActive");
  return (
    <View style={styles.activeBanner}>
      <View style={styles.activeBannerHeader}>
        <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" />
        <Text style={styles.activeBannerTitle}>
          {`${card?.name ?? t("plans.tripName")} · ${status}`}
        </Text>
      </View>
      <Text style={styles.activeBannerRemaining}>{remainingLabel}</Text>
      <AppButton
        variant="secondary"
        fullWidth
        label={
          extending
            ? t("premium.gateBusy")
            : `${t("plans.ctaExtend")} · ${card?.extendPrice ?? ""}`
        }
        onPress={onExtend}
        disabled={extending}
        accessibilityLabel={t("plans.ctaExtend")}
        style={styles.activeBannerCta}
      />
    </View>
  );
}

function formatRemaining(
  ms: number,
  t: ReturnType<typeof useLocale>["t"],
): string {
  if (ms <= 0) return t("plans.remainingExpired");
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes - days * 24 * 60 - hours * 60;
  if (days > 0) {
    return t("plans.remainingDaysHours", {
      d: String(days),
      h: String(hours),
    });
  }
  if (hours > 0) {
    return t("plans.remainingHoursMinutes", {
      h: String(hours),
      m: String(minutes),
    });
  }
  return t("plans.remainingMinutes", { m: String(Math.max(1, minutes)) });
}

function FeatureRow({
  text,
  styles,
  onHighlight,
}: {
  text: string;
  styles: ReturnType<typeof buildStyles>;
  onHighlight?: boolean;
}) {
  return (
    <View style={styles.featureRow}>
      <Ionicons
        name="checkmark-circle"
        size={18}
        color={onHighlight ? "#FFFFFF" : styles.__featureIconColor}
      />
      <Text
        style={[styles.featureText, onHighlight && styles.featureTextOnHighlight]}
      >
        {text}
      </Text>
    </View>
  );
}

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const tc = { textAlign: "center" as const };
  const featureIconColor =
    resolvedScheme === "dark" ? "#34D399" : "#10B981";
  const highlightBg = resolvedScheme === "dark" ? "#0F2D2C" : "#10B981";
  const highlightBorder =
    resolvedScheme === "dark" ? "#34D399" : "#0E9E72";
  const cardShadow =
    resolvedScheme === "dark"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 12,
          elevation: 4,
        }
      : {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.06,
          shadowRadius: 8,
          elevation: 2,
        };

  const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    topBar: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    backBtn: {
      padding: 8,
      borderRadius: 999,
    },
    pressed: { opacity: 0.65 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      alignItems: "stretch",
    },
    hero: {
      paddingHorizontal: 4,
      paddingBottom: 18,
      paddingTop: 4,
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      ...tc,
      marginBottom: 6,
    },
    heroSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      ...tc,
    },
    activeBanner: {
      width: "100%",
      borderRadius: 16,
      padding: 16,
      marginBottom: 14,
      backgroundColor: resolvedScheme === "dark" ? "#10B981" : "#059669",
      ...cardShadow,
    },
    activeBannerHeader: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 6,
    },
    activeBannerTitle: {
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
      color: "#FFFFFF",
      letterSpacing: 0.4,
    },
    activeBannerRemaining: {
      fontSize: 13,
      color: "rgba(255, 255, 255, 0.9)",
      marginBottom: 12,
      ...te,
    },
    activeBannerCta: {
      backgroundColor: "rgba(255, 255, 255, 0.18)",
      borderColor: "rgba(255, 255, 255, 0.25)",
    },
    card: {
      width: "100%",
      borderRadius: 18,
      padding: 18,
      marginBottom: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      ...cardShadow,
    },
    cardFree: {
      backgroundColor:
        resolvedScheme === "dark"
          ? "rgba(255, 255, 255, 0.02)"
          : "rgba(15, 23, 42, 0.02)",
    },
    cardPlain: {},
    cardHighlight: {
      backgroundColor: highlightBg,
      borderColor: highlightBorder,
      borderWidth: 1.5,
      paddingTop: 26,
    },
    cardActive: {
      borderColor: featureIconColor,
      borderWidth: 2,
    },
    popularRibbon: {
      position: "absolute",
      top: -10,
      alignSelf: "center",
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor:
        resolvedScheme === "dark" ? "#34D399" : "#059669",
    },
    popularRibbonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.6,
    },
    cardHeaderRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 8,
    },
    cardName: {
      flex: 1,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0.8,
      color: colors.text,
    },
    cardNameOnHighlight: {
      color: "#FFFFFF",
    },
    durationPill: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      overflow: "hidden",
    },
    durationPillOnHighlight: {
      color: "#FFFFFF",
      borderColor: "rgba(255, 255, 255, 0.35)",
      backgroundColor: "rgba(255, 255, 255, 0.15)",
    },
    priceRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "baseline",
      gap: 8,
      marginBottom: 4,
    },
    priceMain: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
    },
    priceMainOnHighlight: {
      color: "#FFFFFF",
    },
    cardTagline: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      marginTop: 6,
      marginBottom: 14,
      ...te,
    },
    cardTaglineOnHighlight: {
      color: "rgba(255, 255, 255, 0.86)",
    },
    featureList: {
      gap: 8,
      marginBottom: 16,
    },
    featureRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "flex-start",
      gap: 10,
    },
    featureText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      ...te,
    },
    featureTextOnHighlight: {
      color: "#FFFFFF",
    },
    footer: {
      alignItems: "center",
      paddingHorizontal: 8,
      paddingTop: 12,
      gap: 10,
    },
    restoreBtn: {
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    restoreText: {
      fontSize: 14,
      fontWeight: "600",
      color: resolvedScheme === "dark" ? "#34D399" : "#059669",
    },
    webHint: {
      fontSize: 12,
      color: colors.muted,
      ...tc,
    },
    legal: {
      fontSize: 11,
      lineHeight: 16,
      color: colors.muted,
      ...tc,
      paddingHorizontal: 12,
    },
  });

  // Attach a non-style helper so feature-row icons can read the same color
  // without an extra hook call. Cast through `any` because StyleSheet.create
  // returns a strongly-typed object that doesn't allow extra fields.
  (styles as unknown as { __featureIconColor: string }).__featureIconColor =
    featureIconColor;

  return styles as typeof styles & { __featureIconColor: string };
}

// Avoid an unused-import warning when the env helpers are referenced
// only inside types — TS can't see the inline type narrowing above.
void getPassExtendProductId;
void getPassProductId;
