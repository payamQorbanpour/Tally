import Ionicons from "@expo/vector-icons/Ionicons";
import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";
import { useLocale } from "../i18n/LocaleContext";
import { useOnboarding } from "../providers/OnboardingContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";

type Page = {
  key: string;
  title: string;
  body: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
};

const PAGE_COUNT = 4;

export function OnboardingScreen() {
  const navigation =
    useNavigation<NavigationProp<RootStackParamList>>();
  const { markOnboardingDone } = useOnboarding();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = Dimensions.get("window");
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  /**
   * "Use locally" — persist the done-flag and hop to the home tabs. Auth stays
   * optional; the user can sign in later from the Account tab.
   */
  const finishLocal = useCallback(() => {
    void (async () => {
      await markOnboardingDone();
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    })();
  }, [markOnboardingDone, navigation]);

  /**
   * "Sign in or create account" — push the dedicated auth page. We do NOT
   * mark onboarding done here; pressing back from Auth should return here,
   * and only a successful sign-in (or explicit "Use locally") commits.
   */
  const goToAuth = useCallback(() => {
    navigation.navigate("Auth");
  }, [navigation]);
  const scrollRef = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);

  const pages: Page[] = useMemo(
    () => [
      {
        key: "welcome",
        title: t("onboarding.page1Title"),
        body: t("onboarding.page1Body"),
        icon: "people-circle-outline",
        accent: colors.primary,
      },
      {
        key: "log",
        title: t("onboarding.page2Title"),
        body: t("onboarding.page2Body"),
        icon: "flash-outline",
        accent: colors.owed,
      },
      {
        key: "simplify",
        title: t("onboarding.page3Title"),
        body: t("onboarding.page3Body"),
        icon: "git-merge-outline",
        accent: colors.primary,
      },
      {
        key: "start",
        title: t("onboarding.page4Title"),
        body: t("onboarding.page4Body"),
        icon: "sparkles-outline",
        accent: colors.primary,
      },
    ],
    [t, colors],
  );

  const scrollToPage = useCallback(
    (p: number) => {
      const clamped = Math.max(0, Math.min(PAGE_COUNT - 1, p));
      scrollRef.current?.scrollTo({
        x: clamped * screenWidth,
        animated: true,
      });
      setPage(clamped);
    },
    [screenWidth],
  );

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const p = Math.round(x / screenWidth);
    if (p !== page) setPage(p);
  };

  const isLast = page === PAGE_COUNT - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/favicon.png")}
            style={styles.brandLogo}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.brand}>Tally</Text>
        </View>
        <View style={{ minWidth: 40 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={styles.pager}
        contentContainerStyle={{ flexDirection: "row" }}
      >
        {pages.map((p) => (
          <View
            key={p.key}
            style={[styles.page, { width: screenWidth }]}
          >
            <View style={[styles.iconWrap, { backgroundColor: colors.owedSoft }]}>
              <Ionicons name={p.icon} size={68} color={p.accent} />
            </View>
            <Text style={styles.title}>{p.title}</Text>
            <Text style={styles.body}>{p.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.dotsRow}>
        {pages.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === page && { backgroundColor: colors.primary, width: 22 },
            ]}
          />
        ))}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        {!isLast ? (
          <AppButton
            variant="primary"
            fullWidth
            label={t("onboarding.next")}
            onPress={() => scrollToPage(page + 1)}
          />
        ) : (
          <View style={{ gap: 10 }}>
            <AppButton
              variant="primary"
              fullWidth
              label={t("onboarding.authCta")}
              onPress={goToAuth}
            />
            <AppButton
              variant="secondary"
              fullWidth
              label={t("onboarding.useLocally")}
              onPress={finishLocal}
            />
          </View>
        )}
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: "center" as const };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    brandRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
    },
    brandLogo: { width: 28, height: 28, borderRadius: 6 },
    brand: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.primary,
      letterSpacing: -0.5,
    },
    pager: { flex: 1 },
    page: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 28,
    },
    iconWrap: {
      width: 136,
      height: 136,
      borderRadius: 68,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 32,
    },
    title: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 12,
      ...te,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      maxWidth: 360,
      ...te,
    },
    dotsRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 12,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 8,
    },
  });
}
