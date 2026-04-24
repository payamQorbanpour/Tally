import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useMemo, useState } from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../ui/AppButton";
import { Text } from "../ui/AppText";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/**
 * Full-screen "confirm your email" card. Shown on top of the main app
 * whenever the user is signed in with an unverified email and hasn't yet
 * dismissed it via "Use locally" for this session.
 *
 * Visually mirrors the last page of `OnboardingScreen` — same header, icon,
 * title/body layout, button stack — so it reads as a continuation of the
 * sign-up flow rather than a modal error.
 *
 * `onEditEmail` is optional: the main-app overlay (signed-in but unverified)
 * has no edit affordance because Supabase already owns the auth row. The
 * sign-up flow on `AuthScreen` supplies it so a user who mistyped their
 * address (`gmai.com`) can retreat to the form and resubmit with the right
 * one instead of being stranded on the confirm screen.
 *
 * `onContinue` is the cross-device escape hatch — when the user taps the
 * confirmation link on a different device than the app (e.g. clicks it on
 * their laptop while signed up on iOS), the app has no way to detect the
 * verification automatically. The callback retries the verification check
 * (sign-in retry / `getUser()` refresh, depending on caller) and resolves
 * `true` when the email is now confirmed.
 */
export function ConfirmEmailOverlay({
  email,
  onUseLocally,
  onResend,
  onEditEmail,
  onContinue,
}: {
  email: string;
  onUseLocally: () => void;
  onResend: () => Promise<void> | void;
  onEditEmail?: () => void;
  onContinue?: () => Promise<boolean>;
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [continueBusy, setContinueBusy] = useState(false);
  const [continueFailed, setContinueFailed] = useState(false);

  const runResend = useCallback(() => {
    if (busy) return;
    void (async () => {
      setBusy(true);
      try {
        await onResend();
        setSent(true);
        setTimeout(() => setSent(false), 3000);
      } finally {
        setBusy(false);
      }
    })();
  }, [busy, onResend]);

  const runContinue = useCallback(() => {
    if (continueBusy || !onContinue) return;
    void (async () => {
      setContinueBusy(true);
      setContinueFailed(false);
      try {
        const ok = await onContinue();
        if (!ok) {
          setContinueFailed(true);
          setTimeout(() => setContinueFailed(false), 3000);
        }
      } finally {
        setContinueBusy(false);
      }
    })();
  }, [continueBusy, onContinue]);

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
      </View>

      <View style={styles.page}>
        <View style={[styles.iconWrap, { backgroundColor: colors.owedSoft }]}>
          <Ionicons name="mail-unread-outline" size={68} color={colors.primary} />
        </View>
        <Text style={styles.title}>
          {t("onboarding.confirmEmailTitle")}
        </Text>
        <Text style={styles.body}>
          {t("onboarding.confirmEmailBody", { email })}
        </Text>
        <Text style={[styles.hint, { color: colors.muted }]}>
          {t("onboarding.confirmEmailHint")}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={{ gap: 10 }}>
          {onContinue ? (
            <AppButton
              variant="primary"
              fullWidth
              disabled={continueBusy}
              label={
                continueFailed
                  ? t("onboarding.confirmEmailContinueFailed")
                  : continueBusy
                    ? t("onboarding.confirmEmailContinueBusy")
                    : t("onboarding.confirmEmailContinueCta")
              }
              onPress={runContinue}
            />
          ) : null}
          <AppButton
            variant={onContinue ? "secondary" : "primary"}
            fullWidth
            disabled={busy}
            label={
              sent
                ? t("onboarding.confirmEmailResendSent")
                : busy
                  ? t("onboarding.confirmEmailResending")
                  : t("onboarding.confirmEmailResendCta")
            }
            onPress={runResend}
          />
          {onEditEmail ? (
            <AppButton
              variant="secondary"
              fullWidth
              label={t("onboarding.confirmEmailEditCta")}
              onPress={onEditEmail}
            />
          ) : null}
          <AppButton
            variant="secondary"
            fullWidth
            label={t("onboarding.useLocally")}
            onPress={onUseLocally}
          />
        </View>
      </View>
    </View>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: "center" as const };
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.bg,
      ...(Platform.OS === "web" ? { minHeight: "100vh" as unknown as number } : {}),
    },
    header: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
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
      color: colors.text,
      marginBottom: 10,
      maxWidth: 360,
      ...te,
    },
    hint: {
      fontSize: 13,
      lineHeight: 19,
      maxWidth: 340,
      ...te,
    },
    footer: {
      paddingHorizontal: 20,
      paddingTop: 8,
    },
  });
}
