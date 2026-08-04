import Ionicons from "@expo/vector-icons/Ionicons";
import { useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import type { LocalOnlyCounts, MergeChoice } from "../sync/postLoginSync";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";

/**
 * Shown before the first sync of a session whenever this device holds groups
 * or expenses the signed-in account doesn't have.
 *
 * This is load-bearing, not a courtesy: `pullAllFromSupabase` deletes local
 * rows absent from the account, and `pushMergedToSupabase` pulls *before* it
 * pushes — so without an answer here, turning sync on destroys local-only data
 * before it is ever uploaded.
 *
 * A full overlay rather than `Alert.alert` because there are three outcomes
 * plus row counts, and `window.confirm` (the web fallback used elsewhere in
 * this codebase) only expresses two.
 */
export function PostLoginSyncMergePrompt({
  email,
  counts,
  onChoose,
}: {
  email: string;
  counts: LocalOnlyCounts;
  onChoose: (choice: MergeChoice) => void;
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  // Bold the email inside the body sentence — same split trick as
  // ConfirmEmailOverlay, which keeps the template a single translatable string.
  const bodyParts = useMemo(() => {
    const raw = t("syncMerge.body", { email });
    const idx = raw.indexOf(email);
    if (idx < 0) return { before: raw, after: "" };
    return { before: raw.slice(0, idx), after: raw.slice(idx + email.length) };
  }, [email, t]);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.page}>
        <View style={styles.iconTile}>
          <Ionicons name="git-merge-outline" size={32} color={colors.primary} />
        </View>
        <Text style={styles.title}>{t("syncMerge.title")}</Text>
        <Text style={styles.body}>
          {bodyParts.before}
          <Text style={styles.bodyEmphasis}>{email}</Text>
          {bodyParts.after}
        </Text>
        <Text style={styles.counts}>
          {t("syncMerge.counts", {
            groups: String(counts.groupCount),
            expenses: String(counts.expenseCount),
          })}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.ctaCol}>
          <AppButton
            variant="primary"
            fullWidth
            label={t("syncMerge.mergeCta")}
            onPress={() => onChoose("merge")}
          />
          <AppButton
            variant="destructive"
            fullWidth
            label={t("syncMerge.cloudOnlyCta")}
            onPress={() => onChoose("cloud-only")}
          />
          <Text style={styles.warning}>{t("syncMerge.cloudOnlyWarning")}</Text>
          <AppButton
            variant="ghost"
            fullWidth
            label={t("syncMerge.dismissCta")}
            onPress={() => onChoose("dismiss")}
          />
        </View>
      </View>
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
    bodyEmphasis: { color: colors.text, fontWeight: "700" },
    counts: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      marginTop: 12,
      ...tc,
    },
    footer: { paddingHorizontal: 22, paddingTop: 8 },
    ctaCol: { gap: 10 },
    warning: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.muted,
      marginTop: -2,
      ...tc,
    },
  });
}
