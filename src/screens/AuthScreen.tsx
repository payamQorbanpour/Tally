import Ionicons from "@expo/vector-icons/Ionicons";
import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { useRef, useState } from "react";
import {
  Alert,
  Image,
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
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
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
import { useTheme } from "../theme/ThemeContext";
import type { RootStackParamList } from "../navigation/types";
import { ConfirmEmailOverlay } from "./ConfirmEmailOverlay";

/** True if the error looks like a transport/offline failure. Mirrors the
 * check inside `AccountScreen`'s auth flow so behavior is consistent. */
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
 * "Sign in or create account" CTA. One form, one Continue button; sign-in
 * is attempted first and falls through to sign-up on "invalid credentials",
 * matching the combined-auth flow on the Account tab.
 */
export function AuthScreen() {
  const navigation =
    useNavigation<NavigationProp<RootStackParamList>>();
  const { colors, resolvedScheme } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const { markOnboardingDone } = useOnboarding();
  const { revalidateLocalUserForSync } = useTallyData();
  const {
    signInWithPassword,
    signUpWithPassword,
    resetPasswordForEmail,
    resendEmailConfirmation,
  } = useSupabaseSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [focusField, setFocusField] = useState<"email" | "password" | null>(null);
  /**
   * When set, renders `ConfirmEmailOverlay` instead of the form. Triggered
   * by a successful sign-up (Supabase returns no session until the user taps
   * the confirmation link) or by a sign-in that fails with
   * `email_not_confirmed`. The email is what we prompt the user to open.
   */
  const [awaitingEmail, setAwaitingEmail] = useState<string | null>(null);
  const emailRef = useRef<AppTextInputRef>(null);
  const passwordRef = useRef<AppTextInputRef>(null);

  const emerald = resolvedScheme === "dark" ? "#10b981" : "#059669";

  /**
   * Used after a successful sign-in or sign-up: commit the onboarding flag
   * (since the user has now made a real choice) and replace the stack with
   * `Main`, so back no longer pops back into Auth or Onboarding.
   */
  const completeToMain = async () => {
    await markOnboardingDone();
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

  /**
   * Back chevron — when the confirm-email overlay is showing, returning
   * the user to the form feels more intentional than unwinding two screens.
   * Otherwise pop to whatever was underneath (Onboarding when this was
   * pushed from the onboarding flow, otherwise whatever else). We do NOT
   * mark onboarding done here; the user hasn't committed yet.
   */
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

  const onContinue = async () => {
    if (busy) return;
    const em = email.trim();
    if (!isValidOptionalEmail(em) || !em) {
      Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
      return;
    }
    if (password.length < 6) {
      Alert.alert(t("account.authErrorTitle"), t("account.authPasswordTooShort"));
      return;
    }
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    setBusy(true);
    try {
      const { error: signInErr, emailConfirmed: signInEmailConfirmed } =
        await signInWithPassword(em, password);
      if (!signInErr) {
        // Cache the email locally if the profile didn't have one yet, so the
        // sync flow has an email to work with immediately.
        try {
          const p = await getLocalUserProfile(db);
          if (!p.email?.trim()) {
            await updateLocalUserProfile(db, { email: em });
          }
        } catch {
          /* best-effort */
        }
        await revalidateLocalUserForSync();
        setPassword("");
        // Even when Supabase issues a session, gate Main behind a confirmed
        // email — projects with "Confirm email" off would otherwise let an
        // unverified user straight into the home page.
        if (!signInEmailConfirmed) {
          await cacheEmailLocally(em);
          setAwaitingEmail(em);
          return;
        }
        await completeToMain();
        return;
      }
      if (isOfflineLikeError(signInErr)) {
        Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
        return;
      }
      // Sign-in succeeded against Supabase but the user hasn't confirmed
      // their email yet — skip the invalid-credentials retry dance and drop
      // straight onto the "waiting for confirmation" overlay.
      const notConfirmed = /email.*not.*confirm|email_not_confirmed/i.test(
        signInErr.message,
      );
      if (notConfirmed) {
        await cacheEmailLocally(em);
        setPassword("");
        setAwaitingEmail(em);
        return;
      }
      const invalidCreds = /invalid login credentials|invalid.*password/i.test(
        signInErr.message,
      );
      if (!invalidCreds) {
        Alert.alert(t("account.authErrorTitle"), signInErr.message);
        return;
      }
      // Sign-in failed with "invalid credentials" → try sign-up. If Supabase
      // then says the user already exists, the password on sign-in was wrong.
      const { error: signUpErr } = await signUpWithPassword(em, password);
      if (!signUpErr) {
        // Sign-up succeeds WITHOUT a session (Supabase requires email
        // confirmation first). Don't navigate to Main — stay here and show
        // the dedicated waiting-for-confirmation overlay.
        await cacheEmailLocally(em);
        setPassword("");
        setAwaitingEmail(em);
        return;
      }
      if (isOfflineLikeError(signUpErr)) {
        Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
        return;
      }
      Alert.alert(t("account.authErrorTitle"), signInErr.message);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Copy the email into the local user profile so it survives a "Use
   * locally" exit and the Account tab can display it with a "Not verified"
   * badge until the user confirms via the email link.
   */
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

  const onResendConfirmation = async () => {
    if (!awaitingEmail) return;
    const { error } = await resendEmailConfirmation(awaitingEmail);
    if (error && !/already|already registered/i.test(error.message)) {
      // Swallow "already registered" from Supabase enumeration protection;
      // surface genuine transport / rate-limit failures.
      throw error;
    }
  };

  const onConfirmUseLocally = async () => {
    await markOnboardingDone();
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

  const onForgotPassword = async () => {
    if (forgotBusy) return;
    const em = email.trim();
    if (!isValidOptionalEmail(em) || !em) {
      Alert.alert(
        t("account.invalidEmailTitle"),
        t("account.authForgotPasswordNoEmail"),
      );
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

  const styles = buildStyles(colors, isRTL, resolvedScheme);

  if (awaitingEmail !== null) {
    // Waiting-for-confirmation view. Reuses the shared `ConfirmEmailOverlay`
    // (same one the main app uses for signed-in-but-unverified users), with
    // a floating back chevron overlaid so the user can retreat to the form.
    return (
      <View style={styles.root}>
        <ConfirmEmailOverlay
          email={awaitingEmail}
          onResend={onResendConfirmation}
          onUseLocally={() => void onConfirmUseLocally()}
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
              size={26}
              color={colors.text}
            />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { paddingTop: Math.max(insets.top, 12) }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.topBar}>
        <Pressable
          onPress={dismiss}
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
        <View style={styles.heroCard} accessibilityRole="image" accessible accessibilityLabel="Tally">
          <Image
            source={require("../../assets/Tally-Slogan.png")}
            style={styles.heroImage}
            resizeMode="contain"
            accessibilityIgnoresInvertColors
          />
        </View>

        <View style={styles.formWrap}>
          <Pressable onPress={() => emailRef.current?.focus()}>
            <Text style={styles.fieldLabel}>{t("account.authEmailLabel")}</Text>
          </Pressable>
          <TextInput
            ref={emailRef}
            style={[
              styles.input,
              focusField === "email" && styles.inputFocused,
            ]}
            value={email}
            onChangeText={setEmail}
            placeholder={t("account.emailPlaceholder")}
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            importantForAutofill="yes"
            editable={!busy}
            onFocus={() => setFocusField("email")}
            onBlur={() => setFocusField(null)}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            clearable
          />

          <Pressable onPress={() => passwordRef.current?.focus()}>
            <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
              {t("account.authPasswordLabel")}
            </Text>
          </Pressable>
          <View style={styles.passwordWrapper}>
            <TextInput
              ref={passwordRef}
              style={[
                styles.input,
                focusField === "password" && styles.inputFocused,
                { paddingRight: 48 },
              ]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.muted}
              secureTextEntry={!passwordVisible}
              autoCapitalize="none"
              autoCorrect={false}
              textContentType="password"
              editable={!busy}
              onFocus={() => setFocusField("password")}
              onBlur={() => setFocusField(null)}
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
              style={styles.passwordToggleBtn}
            >
              <Ionicons
                name={passwordVisible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={colors.muted}
              />
            </Pressable>
          </View>

          <AppButton
            variant="primary"
            fullWidth
            label={busy ? t("account.authContinueBusy") : t("account.authContinue")}
            onPress={() => void onContinue()}
            disabled={busy}
            style={{ marginTop: 20 }}
            accessibilityLabel={t("account.authContinue")}
          />

          <Pressable
            onPress={() => void onForgotPassword()}
            disabled={forgotBusy || busy}
            style={({ pressed }) => [
              styles.forgotBtn,
              pressed && styles.pressed,
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t("account.authForgotPassword")}
          >
            <Text style={[styles.forgotText, { color: emerald }]}>
              {forgotBusy
                ? t("account.authForgotPasswordBusy")
                : t("account.authForgotPassword")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function buildStyles(
  colors: ReturnType<typeof useTheme>["colors"],
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
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
    /** Absolute-positioned wrapper used on the confirmation overlay so the
     * back chevron floats over the ConfirmEmailOverlay's own brand header. */
    floatingBackWrap: {
      position: "absolute",
      zIndex: 10,
    },
    scrollContent: {
      paddingHorizontal: 20,
      paddingTop: 8,
      alignItems: "center",
    },
    heroCard: {
      width: 240,
      height: 240,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 28,
    },
    heroImage: {
      width: "100%",
      height: "100%",
    },
    formWrap: {
      width: "100%",
      maxWidth: 420,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      ...te,
    },
    input: {
      width: "100%",
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 16,
      backgroundColor: colors.inputSurface,
      color: colors.text,
    },
    inputFocused: {
      borderWidth: 2,
      borderColor: resolvedScheme === "dark" ? "#10b981" : "#059669",
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.04)"
        : "rgba(5, 150, 105, 0.04)",
    },
    passwordWrapper: {
      position: "relative",
      width: "100%",
    },
    passwordToggleBtn: {
      position: "absolute",
      right: isRTL ? "auto" : 12,
      left: isRTL ? 12 : "auto",
      top: 0,
      bottom: 0,
      width: 40,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    forgotBtn: {
      alignSelf: "center",
      marginTop: 16,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    forgotText: {
      fontSize: 14,
      fontWeight: "600",
      textAlign: "center",
    },
    pressed: { opacity: 0.65 },
  });
}
