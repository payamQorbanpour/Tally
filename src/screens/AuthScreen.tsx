import Ionicons from "@expo/vector-icons/Ionicons";
import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { Field } from "../ui/Field";
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";
import { confirmEmailChangeIfDifferent } from "../auth/confirmEmailChange";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { GoogleGIcon } from "../components/GoogleGIcon";
import { isValidOptionalEmail } from "../data/emailValidation";
import { updateLocalUserProfile, getLocalUserProfile } from "../data/tallyRepo";
import {
  OFFLINE_ERROR_CODE,
  isTransportNetworkError,
  shouldSkipDueToOffline,
} from "../core/networkGuard";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { useOnboarding } from "../providers/OnboardingContext";
import { isAppleAuthEnabled, isGoogleAuthEnabled } from "../sync/authRedirect";
import { useTheme } from "../theme/ThemeContext";
import type { ShadowStyle, ThemeColors } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";
import { landOnFirstScreen } from "../navigation/firstRunRouting";
import { ConfirmEmailOverlay } from "./ConfirmEmailOverlay";

type AuthMode = "signin" | "signup";

function isOfflineLikeError(err: Error | null | undefined): boolean {
  if (!err) return false;
  const code = (err as { code?: string }).code;
  if (code === OFFLINE_ERROR_CODE) return true;
  return isTransportNetworkError(err);
}

function isDeviceLikelyOffline(): boolean {
  if (shouldSkipDueToOffline()) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

/**
 * Dedicated sign-in / create-account page. Pushed from onboarding's single
 * "Sign in or create account" CTA. The underlying flow stays unified — the
 * mode toggle just changes the title and CTA label; on submit we still try
 * sign-in first and fall through to sign-up on "invalid credentials".
 */
export function AuthScreen() {
  const navigation =
    useNavigation<NavigationProp<RootStackParamList>>();
  const { colors, shadows } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const { markOnboardingDone } = useOnboarding();
  const { revalidateLocalUserForSync } = useTallyData();
  const {
    session,
    signInWithPassword,
    signUpWithPassword,
    resetPasswordForEmail,
    resendEmailConfirmation,
    signInWithGoogle,
    signInWithApple,
  } = useSupabaseSession();

  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  type AuthErrorField = "email" | "password" | "both";
  const [authError, setAuthError] = useState<
    { message: string; field: AuthErrorField } | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [appleBusy, setAppleBusy] = useState(false);
  const googleAuthEnabled = isGoogleAuthEnabled();
  const appleAuthEnabled = isAppleAuthEnabled();
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const pendingPasswordRef = useRef<string>("");
  const emailRef = useRef<AppTextInputRef>(null);
  const passwordRef = useRef<AppTextInputRef>(null);
  // Set when the user taps "Continue with Google" so the deep-link round
  // trip can find its way back. The OAuth dance hands control to the
  // system browser and returns via `onAuthStateChange`; we use this flag
  // to know that the resulting session belongs to *this* sign-in attempt
  // (versus a session that was already in place when the screen mounted)
  // and pop the screen so the user lands back on AccountScreen.
  const googleAttemptRef = useRef(false);

  const styles = useMemo(
    () => buildStyles(colors, isRTL, shadows.segment),
    [colors, isRTL, shadows.segment],
  );

  const completeToMain = async () => {
    await markOnboardingDone();
    await landOnFirstScreen(db, navigation, t("onboarding.defaultGroupName"));
  };

  useEffect(() => {
    if (!googleAttemptRef.current) return;
    if (!session) return;
    googleAttemptRef.current = false;
    void (async () => {
      await markOnboardingDone();
      await revalidateLocalUserForSync();
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      }
    })();
  }, [session, markOnboardingDone, navigation, revalidateLocalUserForSync]);

  const dismiss = () => {
    if (awaitingEmail !== null) {
      setAwaitingEmail(null);
      return;
    }
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    }
  };

  const cacheEmailLocally = async (em: string) => {
    try {
      const p = await getLocalUserProfile(db);
      if (!p.email?.trim()) {
        await updateLocalUserProfile(db, { email: em });
      }
      await revalidateLocalUserForSync();
    } catch {
      /* best-effort */
    }
  };

  const onContinue = async () => {
    if (busy) return;
    setAuthError(null);
    const em = email.trim();
    if (!isValidOptionalEmail(em) || !em) {
      setAuthError({ message: t("account.invalidEmail"), field: "email" });
      return;
    }
    if (password.length < 6) {
      setAuthError({
        message: t("account.authPasswordTooShort"),
        field: "password",
      });
      return;
    }
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    const okToProceed = await confirmEmailChangeIfDifferent(db, em, t);
    if (!okToProceed) return;
    setBusy(true);
    try {
      const { error: signInErr, emailConfirmed: signInEmailConfirmed } =
        await signInWithPassword(em, password);
      if (!signInErr) {
        try {
          const p = await getLocalUserProfile(db);
          if (!p.email?.trim()) {
            await updateLocalUserProfile(db, { email: em });
          }
        } catch {
          /* best-effort */
        }
        await revalidateLocalUserForSync();
        if (!signInEmailConfirmed) {
          pendingPasswordRef.current = password;
          await cacheEmailLocally(em);
          setPassword("");
          setAwaitingEmail(em);
          return;
        }
        setPassword("");
        await completeToMain();
        return;
      }
      if (isOfflineLikeError(signInErr)) {
        Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
        return;
      }
      const notConfirmed = /email.*not.*confirm|email_not_confirmed/i.test(
        signInErr.message,
      );
      if (notConfirmed) {
        pendingPasswordRef.current = password;
        await cacheEmailLocally(em);
        setPassword("");
        setAwaitingEmail(em);
        return;
      }
      const invalidCreds = /invalid login credentials|invalid.*password/i.test(
        signInErr.message,
      );
      if (!invalidCreds) {
        setAuthError({ message: signInErr.message, field: "both" });
        return;
      }
      // Sign-in failed with "invalid credentials" → try sign-up. If Supabase
      // then says the user already exists, the password on sign-in was wrong.
      const { error: signUpErr, newAccount } = await signUpWithPassword(
        em,
        password,
      );
      if (signUpErr) {
        if (isOfflineLikeError(signUpErr)) {
          Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
          return;
        }
        const alreadyExists = /already registered|already exists|user.*exists/i.test(
          signUpErr.message,
        );
        if (alreadyExists) {
          setAuthError({
            message: t("account.authWrongPasswordBody"),
            field: "password",
          });
          return;
        }
        setAuthError({ message: signUpErr.message, field: "both" });
        return;
      }
      if (!newAccount) {
        setAuthError({
          message: t("account.authWrongPasswordBody"),
          field: "password",
        });
        return;
      }
      pendingPasswordRef.current = password;
      await cacheEmailLocally(em);
      setPassword("");
      setAwaitingEmail(em);
    } finally {
      setBusy(false);
    }
  };

  const onResendConfirmation = async () => {
    if (!awaitingEmail) return;
    const { error } = await resendEmailConfirmation(awaitingEmail);
    if (error && !/already|already registered/i.test(error.message)) {
      throw error;
    }
  };

  const onContinueAfterConfirm = async (): Promise<boolean> => {
    if (!awaitingEmail) return false;
    const pwd = pendingPasswordRef.current;
    if (!pwd) return false;
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return false;
    }
    const { error, emailConfirmed } = await signInWithPassword(
      awaitingEmail,
      pwd,
    );
    if (error) {
      if (isOfflineLikeError(error)) {
        Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
        return false;
      }
      const notConfirmed = /email.*not.*confirm|email_not_confirmed/i.test(
        error.message,
      );
      if (notConfirmed) return false;
      Alert.alert(t("account.authErrorTitle"), error.message);
      return false;
    }
    if (!emailConfirmed) return false;
    pendingPasswordRef.current = "";
    await completeToMain();
    return true;
  };

  const onConfirmUseLocally = async () => {
    await markOnboardingDone();
    await landOnFirstScreen(db, navigation, t("onboarding.defaultGroupName"));
  };

  const onContinueWithGoogle = async () => {
    if (googleBusy || busy) return;
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    setGoogleBusy(true);
    googleAttemptRef.current = true;
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        googleAttemptRef.current = false;
        if (isOfflineLikeError(error)) {
          Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
          return;
        }
        const msg = error.message ?? "";
        if (/provider.*not.*enabled|validation_failed/i.test(msg)) {
          Alert.alert(
            t("account.authGoogleProviderDisabledTitle"),
            t("account.authGoogleProviderDisabledBody"),
          );
          return;
        }
        Alert.alert(t("account.authErrorTitle"), error.message);
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const onContinueWithApple = async () => {
    if (appleBusy || busy) return;
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    setAppleBusy(true);
    try {
      const { error } = await signInWithApple();
      if (error) {
        if (isOfflineLikeError(error)) {
          Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
          return;
        }
        const msg = error.message ?? "";
        if (/provider.*not.*enabled|validation_failed/i.test(msg)) {
          Alert.alert(
            t("account.authAppleProviderDisabledTitle"),
            t("account.authAppleProviderDisabledBody"),
          );
          return;
        }
        Alert.alert(t("account.authErrorTitle"), error.message);
      }
    } finally {
      setAppleBusy(false);
    }
  };

  const onForgotPassword = async () => {
    if (forgotBusy) return;
    const em = email.trim();
    if (!isValidOptionalEmail(em) || !em) {
      setAuthError({
        message: t("account.authForgotPasswordNoEmail"),
        field: "email",
      });
      return;
    }
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    setForgotBusy(true);
    try {
      const { error } = await resetPasswordForEmail(em);
      if (error) {
        if (isOfflineLikeError(error)) {
          Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
          return;
        }
        Alert.alert(t("account.authForgotPasswordFailedTitle"), error.message);
        return;
      }
      Alert.alert(
        t("account.authForgotPasswordSentTitle"),
        t("account.authForgotPasswordSentBody"),
      );
    } finally {
      setForgotBusy(false);
    }
  };

  if (awaitingEmail !== null) {
    return (
      <View style={styles.root}>
        <ConfirmEmailOverlay
          email={awaitingEmail}
          onResend={onResendConfirmation}
          onContinue={onContinueAfterConfirm}
          onUseLocally={() => void onConfirmUseLocally()}
          onEditEmail={() => {
            setEmail(awaitingEmail);
            setAwaitingEmail(null);
            pendingPasswordRef.current = "";
          }}
        />
        <View
          style={[
            styles.floatingBackWrap,
            {
              top: Math.max(insets.top, 8) + 4,
              left: isRTL ? undefined : 8,
              right: isRTL ? 8 : undefined,
            },
          ]}
        >
          <Pressable
            onPress={dismiss}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t("nav.back")}
            style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
          >
            <Ionicons
              name={isRTL ? "chevron-forward" : "chevron-back"}
              size={18}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  const isSignIn = mode === "signin";
  const titleText = isSignIn
    ? t("account.authWelcomeBackTitle")
    : t("account.authCreateAccountTitle");
  const subtitleText = isSignIn
    ? t("account.authWelcomeBackSubtitle")
    : t("account.authCreateAccountSubtitle");
  const ctaLabel = busy
    ? t("account.authContinueBusy")
    : t("account.authContinue");
  const showSocialRow = googleAuthEnabled || appleAuthEnabled;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) }]}>
        <Pressable
          onPress={dismiss}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t("nav.back")}
          style={({ pressed }) => [styles.backBtn, pressed && styles.pressed]}
        >
          <Ionicons
            name={isRTL ? "chevron-forward" : "chevron-back"}
            size={18}
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
        {/* Brand mark — kit's compact T tile + Tally wordmark. */}
        <View style={styles.brandRow}>
          <View style={styles.brandTile}>
            <Text style={styles.brandTileLetter}>T</Text>
          </View>
          <Text style={styles.brandWord}>Tally</Text>
        </View>

        <Text style={styles.heroTitle}>{titleText}</Text>
        <Text style={styles.heroSubtitle}>{subtitleText}</Text>

        {/* Mode toggle (Sign in / Create account). Switches title + CTA
            label only — the underlying submit flow is unified below. */}
        <View style={styles.modeTrack}>
          {(["signin", "signup"] as const).map((m) => {
            const on = mode === m;
            return (
              <Pressable
                key={m}
                onPress={() => {
                  setMode(m);
                  setAuthError(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={({ pressed }) => [
                  styles.modeSegment,
                  on && styles.modeSegmentOn,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.modeSegmentLabel,
                    on && styles.modeSegmentLabelOn,
                  ]}
                >
                  {m === "signin"
                    ? t("account.authModeSignIn")
                    : t("account.authModeCreate")}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field
          label={t("account.authEmailLabel")}
          topGap={18}
          error={
            !!authError &&
            (authError.field === "email" || authError.field === "both")
          }
          hint={
            authError &&
            (authError.field === "email" || authError.field === "both")
              ? authError.message
              : undefined
          }
        >
          <TextInput
            ref={emailRef}
            style={[
              styles.fieldInput,
              authError &&
              (authError.field === "email" || authError.field === "both")
                ? styles.fieldInputError
                : null,
            ]}
            value={email}
            onChangeText={(v) => {
              setEmail(v);
              if (authError) setAuthError(null);
            }}
            placeholder={t("account.emailPlaceholder")}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
            editable={!busy}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            clearable
          />
        </Field>

        <Field
          label={t("account.authPasswordLabel")}
          error={
            !!authError &&
            (authError.field === "password" || authError.field === "both")
          }
          hint={
            authError &&
            (authError.field === "password" || authError.field === "both")
              ? authError.message
              : undefined
          }
        >
          <View style={styles.passwordWrapper}>
            <TextInput
              ref={passwordRef}
              style={[
                styles.fieldInput,
                authError &&
                (authError.field === "password" ||
                  authError.field === "both")
                  ? styles.fieldInputError
                  : null,
                { paddingRight: 48 },
              ]}
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                if (authError) setAuthError(null);
              }}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              editable={!busy}
              returnKeyType="go"
              onSubmitEditing={() => void onContinue()}
            />
            <Pressable
              onPress={() => setPasswordVisible((v) => !v)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={
                passwordVisible
                  ? t("account.hidePassword")
                  : t("account.showPassword")
              }
              style={[
                styles.passwordToggleBtn,
                isRTL ? { left: 12, right: undefined } : null,
              ]}
            >
              <Ionicons
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.muted}
              />
            </Pressable>
          </View>
        </Field>

        {isSignIn ? (
          <View style={styles.forgotRow}>
            <Pressable
              onPress={() => void onForgotPassword()}
              disabled={forgotBusy || busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t("account.authForgotPassword")}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text style={styles.forgotText}>
                {forgotBusy
                  ? t("account.authForgotPasswordBusy")
                  : t("account.authForgotPassword")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        <AppButton
          variant="primary"
          fullWidth
          label={isSignIn ? ctaLabel : (busy ? ctaLabel : t("account.authContinue"))}
          right={<Ionicons name="arrow-forward" size={18} color="#fff" />}
          onPress={() => void onContinue()}
          disabled={busy}
          style={styles.primaryCta}
          accessibilityLabel={t("account.authContinue")}
        />

        {showSocialRow ? (
          <>
            <View style={styles.orRow}>
              <View style={styles.orLine} />
              <Text style={styles.orLabel}>{t("account.authOrDivider")}</Text>
              <View style={styles.orLine} />
            </View>
            <View style={styles.socialRow}>
              {appleAuthEnabled ? (
                <AppButton
                  variant="secondary"
                  fullWidth
                  label={
                    appleBusy
                      ? t("account.authAppleBusy")
                      : t("account.authContinueWithApple")
                  }
                  left={<Ionicons name="logo-apple" size={18} color={colors.text} />}
                  onPress={() => void onContinueWithApple()}
                  disabled={appleBusy || googleBusy || busy}
                  accessibilityLabel={t("account.authContinueWithApple")}
                />
              ) : null}
              {googleAuthEnabled ? (
                <AppButton
                  variant="secondary"
                  fullWidth
                  label={
                    googleBusy
                      ? t("account.authGoogleBusy")
                      : t("account.authContinueWithGoogle")
                  }
                  left={<GoogleGIcon size={18} />}
                  onPress={() => void onContinueWithGoogle()}
                  disabled={googleBusy || appleBusy || busy}
                  accessibilityLabel={t("account.authContinueWithGoogle")}
                />
              ) : null}
            </View>
          </>
        ) : null}

        <Pressable
          onPress={() => void onConfirmUseLocally()}
          hitSlop={10}
          accessibilityRole="link"
          accessibilityLabel={t("account.authUseLocallyLink")}
          style={({ pressed }) => [styles.useLocally, pressed && styles.pressed]}
        >
          <Text style={styles.useLocallyText}>
            {t("account.authUseLocallyLink")}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  segmentShadow: ShadowStyle,
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    topBar: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingBottom: 4,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      alignItems: "center",
      justifyContent: "center",
    },
    floatingBackWrap: {
      position: "absolute",
      zIndex: 10,
    },
    scrollContent: {
      paddingHorizontal: 22,
      paddingTop: 14,
    },

    /* ── Brand mark + hero copy ─────────────────────────────────── */
    brandRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      marginTop: 8,
    },
    brandTile: {
      width: 44,
      height: 44,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    brandTileLetter: {
      fontSize: 22,
      fontWeight: "800",
      color: "#fff",
      letterSpacing: -1,
    },
    brandWord: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.4,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: "800",
      color: colors.text,
      letterSpacing: -0.5,
      marginTop: 26,
      ...te,
    },
    heroSubtitle: {
      fontSize: 14,
      color: colors.muted,
      marginTop: 6,
      lineHeight: 20,
      ...te,
    },

    /* ── Mode toggle (segmented) ────────────────────────────────── */
    modeTrack: {
      flexDirection: isRTL ? "row-reverse" : "row",
      backgroundColor: colors.inputSurface,
      borderRadius: 12,
      padding: 4,
      marginTop: 22,
    },
    modeSegment: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
    },
    modeSegmentOn: {
      backgroundColor: colors.surface,
      ...segmentShadow,
    },
    modeSegmentLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.muted,
    },
    modeSegmentLabelOn: { color: colors.text },

    /* ── Filled-mint Field input ────────────────────────────────── */
    fieldInput: {
      width: "100%",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      backgroundColor: colors.inputSurface,
      color: colors.text,
      borderWidth: 1,
      borderColor: "transparent",
      fontWeight: "600",
    },
    fieldInputError: {
      borderColor: colors.owe,
      borderWidth: 1.5,
    },
    passwordWrapper: {
      position: "relative",
      width: "100%",
    },
    passwordToggleBtn: {
      position: "absolute",
      right: 12,
      top: 0,
      bottom: 0,
      width: 40,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },

    /* ── Forgot password row ────────────────────────────────────── */
    forgotRow: {
      marginTop: 12,
      alignItems: isRTL ? "flex-start" : "flex-end",
    },
    forgotText: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.primary,
    },

    /* ── Primary CTA + social row ───────────────────────────────── */
    primaryCta: {
      marginTop: 22,
    },
    orRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      marginTop: 22,
    },
    orLine: {
      flex: 1,
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
    },
    orLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
    },
    socialRow: {
      gap: 10,
      marginTop: 14,
    },

    /* ── Use locally tertiary link ──────────────────────────────── */
    useLocally: {
      alignSelf: "center",
      marginTop: 26,
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

    pressed: { opacity: 0.65 },
  });
}
