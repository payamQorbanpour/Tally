import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../ui/AppButton";
import { CategoryTile } from "../ui/CategoryTile";
import { Text } from "../ui/AppText";
import { useLocale } from "../i18n/LocaleContext";
import { useOnboarding } from "../providers/OnboardingContext";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";
import { useDatabase } from "../db/DatabaseContext";
import { landOnFirstScreen } from "../navigation/firstRunRouting";

type FeatureKey = "ai" | "simplify" | "sync";

const FEATURE_ICONS: Record<FeatureKey, keyof typeof import("@expo/vector-icons/Ionicons").Ionicons.glyphMap> = {
  ai: "sparkles-outline",
  simplify: "people-outline",
  sync: "cloud-done-outline",
};

export function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const db = useDatabase();
  const { markOnboardingDone } = useOnboarding();
  const { colors, shadows } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(
    () => buildStyles(colors, isRTL, shadows.fab),
    [colors, isRTL, shadows.fab],
  );

  const [submitting, setSubmitting] = useState(false);

  const onPrimary = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await markOnboardingDone();
      await landOnFirstScreen(
        db,
        navigation,
        t("onboarding.defaultGroupName"),
      );
    } finally {
      setSubmitting(false);
    }
  }, [db, markOnboardingDone, navigation, submitting, t]);

  const goToAuth = useCallback(() => {
    navigation.navigate("Auth");
  }, [navigation]);

  const features: { key: FeatureKey; title: string; body: string }[] = [
    {
      key: "ai",
      title: t("onboarding.featureAiTitle"),
      body: t("onboarding.featureAiBody"),
    },
    {
      key: "simplify",
      title: t("onboarding.featureSimplifyTitle"),
      body: t("onboarding.featureSimplifyBody"),
    },
    {
      key: "sync",
      title: t("onboarding.featureSyncTitle"),
      body: t("onboarding.featureSyncBody"),
    },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollInner,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.iconCard}>
          <Image
            source={require("../../assets/Tally.jpg")}
            style={styles.logo}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
        </View>

        <View style={styles.headlineWrap}>
          <Text style={styles.headlineLead}>
            {t("onboarding.welcomeHeadlineLead")}{" "}
            <Text style={styles.headlineAccent}>
              {t("onboarding.welcomeHeadlineAccent")}
            </Text>
          </Text>
        </View>

        <Text style={styles.body}>{t("onboarding.intentBody")}</Text>

        <View style={styles.featureList}>
          {features.map((f) => (
            <View key={f.key} style={styles.featureRow}>
              <CategoryTile icon={FEATURE_ICONS[f.key]} size={44} />
              <View style={styles.featureTextCol}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <AppButton
            variant="primary"
            fullWidth
            label={t("onboarding.welcomeCta")}
            onPress={() => void onPrimary()}
            disabled={submitting}
            style={styles.ctaButton}
          />
          <Text style={styles.footerHint}>
            {t("onboarding.welcomeFooter")}
          </Text>
          <Pressable
            onPress={goToAuth}
            disabled={submitting}
            hitSlop={10}
            style={({ pressed }) => [
              styles.signInLink,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="link"
            accessibilityLabel={t("onboarding.signInLink")}
          >
            <Text style={styles.signInLinkText}>
              {t("onboarding.signInLink")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean, fabShadow: ShadowStyle) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    scrollInner: {
      paddingHorizontal: 28,
      alignItems: "center",
      flexGrow: 1,
    },
    iconCard: {
      width: 96,
      height: 96,
      borderRadius: 26,
      overflow: "hidden",
      marginTop: 24,
      marginBottom: 28,
      ...fabShadow,
    },
    logo: {
      width: "100%",
      height: "100%",
    },
    headlineWrap: {
      width: "100%",
      alignItems: "center",
      marginBottom: 14,
    },
    headlineLead: {
      fontSize: 32,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      lineHeight: 38,
      letterSpacing: -0.6,
    },
    headlineAccent: {
      color: colors.primary,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      textAlign: "center",
      maxWidth: 280,
      marginBottom: 36,
    },
    featureList: {
      width: "100%",
      gap: 14,
      marginBottom: 32,
    },
    featureRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 14,
    },
    featureTextCol: { flex: 1, minWidth: 0 },
    featureTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 2,
      textAlign: isRTL ? "right" : "left",
    },
    featureBody: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
      textAlign: isRTL ? "right" : "left",
    },
    footer: {
      width: "100%",
      marginTop: "auto",
      paddingTop: 12,
      gap: 10,
      alignItems: "center",
    },
    ctaButton: {
      ...fabShadow,
      borderRadius: 14,
    },
    footerHint: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
    },
    signInLink: {
      alignItems: "center",
      paddingVertical: 6,
    },
    signInLinkText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: "600",
    },
  });
}
