import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useMemo, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
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
 * Kit-aligned: compact 64×64 mint icon tile, centered title + body (with the
 * email rendered in bold), and a stack of two-to-four CTAs followed by a
 * "Use locally for now" tertiary text-link with a dashed underline.
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

  // Body template carries `{{email}}`; split it so we can bold the email
  // substring inline (kit pattern).
  const bodyParts = useMemo(() => {
    const raw = t("onboarding.confirmEmailBody", { email });
    const idx = raw.indexOf(email);
    if (idx < 0) return { before: raw, after: "" };
    return {
      before: raw.slice(0, idx),
      after: raw.slice(idx + email.length),
    };
  }, [email, t]);

  // Icon tile flips from mail-outline (idle) to a green-fill checkmark on
  // `sent`, matching the kit's "Email sent ✓" success state.
  const iconBg = sent ? colors.primary : colors.owedSoft;
  const iconFg = sent ? "#fff" : colors.primary;
  const iconName: keyof typeof Ionicons.glyphMap = sent
    ? "checkmark"
    : "mail-outline";

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>
      <View style={styles.brandRow}>
        <View style={styles.brandTile}>
          <Text style={styles.brandTileLetter}>T</Text>
        </View>
        <Text style={styles.brand}>Tally</Text>
      </View>

      <View style={styles.page}>
        <View style={[styles.iconTile, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={32} color={iconFg} />
        </View>
        <Text style={styles.title}>
          {sent
            ? t("onboarding.confirmEmailResendSent")
            : t("onboarding.confirmEmailTitle")}
        </Text>
        <Text style={styles.body}>
          {bodyParts.before}
          <Text style={styles.bodyEmphasis}>{email}</Text>
          {bodyParts.after}
        </Text>
        <Text style={styles.hint}>{t("onboarding.confirmEmailHint")}</Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.ctaCol}>
          {onContinue ? (
            <AppButton
              variant="primary"
              fullWidth
              disabled={continueBusy}
              right={
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              }
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
            disabled={busy || sent}
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
        </View>

        {/* Tertiary text-link — "Use locally for now" with dashed underline. */}
        <Pressable
          onPress={onUseLocally}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel={t("onboarding.useLocally")}
          style={({ pressed }) => [
            styles.useLocallyLink,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.useLocallyText}>
            {t("onboarding.useLocally")}
          </Text>
        </Pressable>
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
      ...(Platform.OS === "web" ? { minHeight: "100vh" as unknown as number } : {}),
    },

    /* ── Brand mark ──────────────────────────────────────────────── */
    brandRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 22,
      paddingVertical: 8,
    },
    brandTile: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    brandTileLetter: {
      fontSize: 18,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: -0.6,
    },
    brand: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.4,
    },

    /* ── Centered hero ───────────────────────────────────────────── */
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
      marginBottom: 6,
      maxWidth: 360,
      ...tc,
    },
    bodyEmphasis: {
      color: colors.text,
      fontWeight: "700",
    },
    hint: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.muted,
      maxWidth: 340,
      marginTop: 6,
      ...tc,
    },

    /* ── Footer (CTAs + tertiary link) ───────────────────────────── */
    footer: {
      paddingHorizontal: 22,
      paddingTop: 8,
    },
    ctaCol: {
      gap: 10,
    },
    useLocallyLink: {
      alignSelf: "center",
      marginTop: 18,
      paddingVertical: 6,
      paddingHorizontal: 4,
    },
    useLocallyText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.muted,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
      paddingBottom: 1,
    },
    pressed: { opacity: 0.7 },
  });
}
