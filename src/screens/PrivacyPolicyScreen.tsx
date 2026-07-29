import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../ui/AppText";
import { ScreenHeader } from "../ui/ScreenHeader";
import { useLocale } from "../i18n/LocaleContext";
import { getPrivacyPolicy } from "../i18n/privacyPolicy";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/**
 * Full privacy-policy text, rendered from the bundled document in
 * {@link ../i18n/privacyPolicy}.
 *
 * Reachable from the sign-up consent row on {@link ./AuthScreen} (before
 * any personal data is entered) and from Settings. Deliberately renders
 * bundled text rather than opening the hosted `privacy.html`, so it works
 * offline and so a store reviewer can read the whole policy without
 * leaving the app.
 */
export function PrivacyPolicyScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const { t, locale, isRTL } = useLocale();
  const insets = useSafeAreaInsets();

  const doc = useMemo(() => getPrivacyPolicy(locale), [locale]);
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  return (
    <View style={styles.root}>
      <ScreenHeader
        title={doc.title}
        onBack={() => navigation.goBack()}
        backAccessibilityLabel={t("nav.back")}
      />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 40 },
        ]}
      >
        <Text style={styles.docTitle}>{doc.title}</Text>
        <Text style={styles.updated}>{doc.lastUpdated}</Text>

        {doc.intro.map((p, i) => (
          <Text key={`intro-${i}`} style={styles.paragraph}>
            {p}
          </Text>
        ))}

        {doc.sections.map((section, si) => (
          <View key={`s-${si}`} style={styles.section}>
            <Text style={styles.heading}>{section.heading}</Text>
            {section.body?.map((p, i) => (
              <Text key={`s-${si}-p-${i}`} style={styles.paragraph}>
                {p}
              </Text>
            ))}
            {section.bullets?.map((b, i) => (
              <View key={`s-${si}-b-${i}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{b}</Text>
              </View>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const writingDirection = (isRTL ? "rtl" : "ltr") as "rtl" | "ltr";
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    content: {
      paddingHorizontal: 22,
      paddingTop: 6,
    },
    docTitle: {
      fontSize: 24,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.4,
      ...te,
      writingDirection,
    },
    updated: {
      fontSize: 13,
      color: colors.muted,
      marginTop: 6,
      marginBottom: 14,
      ...te,
      writingDirection,
    },
    section: { marginTop: 22 },
    heading: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      ...te,
      writingDirection,
    },
    paragraph: {
      fontSize: 14.5,
      lineHeight: 24,
      color: colors.text,
      marginBottom: 10,
      ...te,
      writingDirection,
    },
    bulletRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "flex-start",
      gap: 8,
      marginBottom: 8,
    },
    bulletDot: {
      fontSize: 14.5,
      lineHeight: 24,
      color: colors.primary,
    },
    bulletText: {
      flex: 1,
      fontSize: 14.5,
      lineHeight: 24,
      color: colors.text,
      ...te,
      writingDirection,
    },
  });
}
