import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { AppSwitch } from "../ui/AppSwitch";
import { TextInput, type AppTextInputRef } from "../ui/AppTextInput";
import { KeyboardDismissButton } from "../ui/KeyboardDismissButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { CURRENCY_OPTIONS, currencyLabel, isValidCurrencyCode } from "../data/currencies";
import { isValidOptionalEmail } from "../data/emailValidation";
import { isSyncConfigured } from "../sync/config";
import {
  getLocalUserProfile,
  createUserFeedback,
  getSetting,
  setSetting,
  SETTINGS_KEYS,
  updateLocalUserProfile,
} from "../data/tallyRepo";
import { useSyncStatusDisplay } from "../components/SyncStatusPill";
import { markPendingAccountDeletion } from "../core/clearAppStorage";
import {
  OFFLINE_ERROR_CODE,
  isTransportNetworkError,
  shouldSkipDueToOffline,
} from "../core/networkGuard";
import {
  pickProfileAvatar,
  deletePersistedProfilePhotoFile,
} from "../core/pickProfileAvatar";
import {
  uploadAvatarToStorage,
  deleteAvatarFromStorage,
} from "../core/avatarStorage";
import { usePremium } from "../premium/PremiumContext";
import { PremiumRequiredPanel } from "../components/PremiumRequiredPanel";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { performLocalSignOutCleanup } from "../auth/localAuthCleanup";
import { pushLocalProfileToCloud } from "../auth/postSignInBootstrap";
import { pushProfilePrefs } from "../sync/profilePrefsSync";
import { deleteRemoteAccountData } from "../sync/deleteRemoteAccount";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import type { AppearancePref } from "../theme/ThemeContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

const SETTINGS_EMERALD = "#10b981";
const SETTINGS_EMERALD_LIGHT = "#059669";

/**
 * True if an auth error looks like a transport/offline failure (including our
 * `TALLY_AUTH_REQUEST_TIMED_OUT` wrapper, Supabase's `AuthRetryableFetchError`,
 * native "Network request failed / timed out", and the guard's `OfflineError`).
 */
function isOfflineLikeError(err: Error | null | undefined): boolean {
  if (!err) return false;
  const code = (err as { code?: string }).code;
  if (code === OFFLINE_ERROR_CODE) return true;
  return isTransportNetworkError(err);
}

/**
 * Best-effort offline precheck before kicking off an auth request: the module
 * cooldown catches recent transport failures, and on web `navigator.onLine`
 * catches a cold-start offline.
 */
function isDeviceLikelyOffline(): boolean {
  if (shouldSkipDueToOffline()) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return false;
}

function buildAccountStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const emerald = resolvedScheme === "dark" ? SETTINGS_EMERALD : SETTINGS_EMERALD_LIGHT;
  const cardBorder =
    resolvedScheme === "dark" ? "rgba(255, 255, 255, 0.06)" : "rgba(15, 23, 42, 0.06)";
  const cardShadow =
    resolvedScheme === "dark"
      ? {
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.16,
          shadowRadius: 8,
          elevation: 3,
        }
      : {
          shadowColor: colors.shadow,
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.05,
          shadowRadius: 4,
          elevation: 1,
        };

  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 32,
      paddingBottom: 64,
      alignItems: "center",
    },
    column: {
      width: "100%",
      maxWidth: 640,
    },
    card: {
      width: "100%",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: cardBorder,
      borderRadius: 16,
      padding: 20,
      marginBottom: 20,
      ...cardShadow,
    },
    cardHeaderRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 18,
    },
    cardTitle: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      flex: 1,
      ...te,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      marginTop: 16,
      ...te,
    },
    fieldLabelFirst: {
      marginTop: 0,
    },
    helper: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.muted,
      opacity: 0.88,
      marginBottom: 12,
      width: "100%",
      ...te,
    },
    input: {
      width: "100%",
      maxWidth: "100%",
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
      borderColor: emerald,
      backgroundColor: resolvedScheme === "dark" 
        ? "rgba(16, 185, 129, 0.04)"
        : "rgba(5, 150, 105, 0.04)",
    },
    inputInvalid: {
      borderColor: colors.destructive,
      borderWidth: 1.5,
    },
    fieldError: {
      fontSize: 12,
      color: colors.destructive,
      marginTop: 6,
      lineHeight: 18,
      fontWeight: "500",
      width: "100%",
      ...te,
    },
    /** Spacing for shared `AppButton` (visuals live in the component). */
    btnFull: { marginTop: 20, width: "100%", alignSelf: "stretch" },
    btnOutlineStack: { marginTop: 12 },
    btnText: {
      fontSize: 15,
      lineHeight: 20,
      letterSpacing: 0.3,
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    disabled: { opacity: 0.5 },
    pressed: { opacity: 0.85 },
    pickerField: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    switchRow: {
      width: "100%",
      marginTop: 12,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 14,
      paddingVertical: 4,
    },
    switchTextWrap: { flex: 1, ...te },
    syncLabelRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
    },
    syncDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    syncDotOn: {
      backgroundColor: SETTINGS_EMERALD,
      ...Platform.select({
        ios: {
          shadowColor: SETTINGS_EMERALD,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 4,
        },
        android: { elevation: 2 },
        default: {},
      }),
    },
    syncDotOff: {
      backgroundColor: colors.muted,
      opacity: 0.35,
    },
    syncStatusRow: {
      width: "100%",
      marginTop: 14,
      paddingHorizontal: 10,
      paddingVertical: 10,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(255, 255, 255, 0.03)"
        : "rgba(15, 23, 42, 0.03)",
      borderRadius: 10,
    },
    syncStatusText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 20, fontWeight: "500", ...te },
    modalRoot: {
      flex: 1,
      paddingTop: 56,
      paddingHorizontal: 16,
      backgroundColor: colors.bg,
    },
    modalHeader: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      marginBottom: 20,
    },
    modalTitle: { flex: 1, fontSize: 22, fontWeight: "800", color: colors.text, textAlign: "center" },
    modalDone: { fontSize: 17, color: emerald, fontWeight: "700" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowSelected: { 
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.12)"
        : "rgba(5, 150, 105, 0.08)",
    },
    rowCode: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      width: 50,
      fontVariant: ["tabular-nums"],
    },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "500" },
    empty: { padding: 32, textAlign: "center", color: colors.muted, fontSize: 15, fontWeight: "500" },
    currencyFlatList: { flex: 1 },
    pickerText: { flex: 1, fontSize: 16, color: colors.text, fontWeight: "600" },
    authFieldLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      marginTop: 16,
      ...te,
    },
    sectionDivider: {
      height: 1,
      backgroundColor: cardBorder,
      marginVertical: 18,
      opacity: 0.5,
    },
    passwordInputWrapper: {
      position: "relative",
      width: "100%",
    },
    passwordToggleBtn: {
      position: "absolute",
      right: isRTL ? "auto" : 12,
      left: isRTL ? 12 : "auto",
      top: 0,
      bottom: 0,
      width: 48,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 10,
    },
    /* — Inline-editable display name next to avatar — */
    identityNameInput: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      padding: 0,
      margin: 0,
      paddingVertical: 0,
      borderWidth: 0,
      backgroundColor: "transparent",
      textAlign: isRTL ? "right" : "left",
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    identityNameUnderline: {
      height: 1,
      backgroundColor: colors.border,
      marginTop: 2,
      opacity: 0.5,
    },
    identityNameUnderlineFocused: {
      backgroundColor: emerald,
      opacity: 1,
      height: 1.5,
    },
    /* — Identity status pill (next to display name) — */
    statusPill: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      alignSelf: isRTL ? "flex-end" : "flex-start",
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
      marginTop: 4,
    },
    statusPillSignedIn: {
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.14)"
        : "rgba(5, 150, 105, 0.10)",
    },
    statusPillLocal: {
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(255, 255, 255, 0.06)"
        : "rgba(15, 23, 42, 0.06)",
    },
    statusPillText: {
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    /* — Signed-out hero on the Cloud card — */
    heroWrap: {
      width: "100%",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 4,
      marginBottom: 6,
    },
    heroIconCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.14)"
        : "rgba(5, 150, 105, 0.10)",
      marginBottom: 14,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      letterSpacing: -0.3,
      marginBottom: 6,
    },
    heroSubtitle: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.muted,
      textAlign: "center",
      marginBottom: 18,
      maxWidth: 320,
    },
    benefitsList: {
      alignSelf: "stretch",
      marginBottom: 6,
    },
    benefitRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 6,
    },
    benefitIconBg: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.18)"
        : "rgba(5, 150, 105, 0.12)",
    },
    benefitText: {
      flex: 1,
      fontSize: 14,
      lineHeight: 20,
      color: colors.text,
      fontWeight: "500",
      ...te,
    },
    forgotPasswordBtn: {
      alignSelf: "center",
      marginTop: 14,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    forgotPasswordText: {
      fontSize: 14,
      fontWeight: "600",
      color: emerald,
      textAlign: "center",
    },
    /* — Signed-in dashboard sync tile — */
    syncTile: {
      width: "100%",
      borderRadius: 14,
      padding: 14,
      marginTop: 4,
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.08)"
        : "rgba(5, 150, 105, 0.06)",
      borderWidth: 1,
      borderColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.22)"
        : "rgba(5, 150, 105, 0.18)",
    },
    syncTileOff: {
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(255, 255, 255, 0.04)"
        : "rgba(15, 23, 42, 0.04)",
      borderColor: cardBorder,
    },
    syncTileHeader: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
    },
    syncTileTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      ...te,
    },
    syncTileSubtitle: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.muted,
      marginTop: 6,
      paddingLeft: isRTL ? 0 : 20,
      paddingRight: isRTL ? 20 : 0,
      ...te,
    },
  });
}

export function AccountScreen() {
  const db = useDatabase();
  const {
    setCloudSyncUserEnabled,
    cloudSyncUserEnabled,
    cloudSyncUserPrefReady,
    cloudSyncCanBeUsed,
    cloudSyncBuildDisabled,
    localUserHasProfileEmail,
    revalidateLocalUserForSync,
    dataRevision,
  } = useTallyData();
  const { colors, appearance, setAppearance, resolvedScheme } = useTheme();
  const { locale, setLocale, t, isRTL } = useLocale();
  const { isPremium } = usePremium();
  const styles = useMemo(
    () => buildAccountStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
  );
  const emerald = resolvedScheme === "dark" ? SETTINGS_EMERALD : SETTINGS_EMERALD_LIGHT;

  const appearanceOptions = useMemo(
    () =>
      (["light", "dark", "system"] as const).map((value) => ({
        value: value as AppearancePref,
        label:
          value === "light"
            ? t("account.appearanceLight")
            : value === "dark"
              ? t("account.appearanceDark")
              : t("account.appearanceSystem"),
      })),
    [t],
  );

  const languageOptions: { code: AppLocale; label: string }[] = useMemo(
    () => [
      { code: "en", label: t("account.languageEnglish") },
      { code: "fa", label: t("account.languageFarsi") },
      { code: "es", label: t("account.languageSpanish") },
    ],
    [t],
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const authEmailInputRef = useRef<AppTextInputRef>(null);
  const authPasswordInputRef = useRef<AppTextInputRef>(null);
  const scrollRef = useRef<ScrollView>(null);
  const scrollToEndSoon = useCallback(() => {
    // Only Android needs the manual scroll — iOS uses
    // `automaticallyAdjustKeyboardInsets` (animating up on its own; a manual
    // scroll on top caused jitter), and web has a real cursor / no on-screen
    // keyboard occluding the input, so scrolling just yanks the page.
    if (Platform.OS !== "android") return;
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 250);
  }, []);
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authForgotBusy, setAuthForgotBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerConfirmOpen, setDangerConfirmOpen] = useState(false);
  const [dangerConfirmText, setDangerConfirmText] = useState("");
  const [focusField, setFocusField] = useState<
    "name" | "email" | "authEmail" | "authPassword" | null
  >(null);
  const [initialProfile, setInitialProfile] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });

  const {
    user: authUser,
    loading: authSessionLoading,
    signInWithPassword,
    signUpWithPassword,
    resetPasswordForEmail,
    resendEmailConfirmation,
    refreshUser,
    signOut,
  } = useSupabaseSession();

  const load = useCallback(async () => {
    const p = await getLocalUserProfile(db);
    setName(p.name);
    setEmail(p.email ?? "");
    setAvatarUri(p.avatarUri ?? null);
    setInitialProfile({ name: p.name ?? "", email: (p.email ?? "").trim() });
    setAuthEmail((prev) => (prev.trim() ? prev : p.email ?? ""));
    const cur = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (cur && isValidCurrencyCode(cur)) setDefaultCurrency(cur);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
      // When the user returns to this tab after clicking the email
      // confirmation link, re-read the user so the "Not verified" badge
      // flips to "Verified" without requiring sign-out / sign-in.
      if (authUser && !authUser.email_confirmed_at) {
        void refreshUser();
      }
    }, [load, authUser, refreshUser]),
  );

  useEffect(() => {
    void load();
  }, [load, locale, dataRevision]);

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return [...CURRENCY_OPTIONS];
    return CURRENCY_OPTIONS.filter(
      (x) =>
        x.code.toLowerCase().includes(q) ||
        x.label.toLowerCase().includes(q),
    );
  }, [currencySearch]);

  const saveProfile = async () => {
    if (profileBusy) return;
    const emailTrim = email.trim();
    if (!isValidOptionalEmail(emailTrim)) {
      Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
      return;
    }
    setProfileBusy(true);
    try {
      await updateLocalUserProfile(db, {
        name,
        email: emailTrim ? emailTrim : null,
      });
      await revalidateLocalUserForSync();
      if (authUser?.id) {
        await pushLocalProfileToCloud(db);
      }
      await load();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setProfileBusy(false);
    }
  };

  const applyPickedAvatar = async (source: "library" | "camera") => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      const res = await pickProfileAvatar(source);
      if (res.kind === "cancelled") return;
      if (res.kind === "permissionDenied") {
        Alert.alert(
          res.reason === "camera"
            ? t("account.photoCameraPermissionTitle")
            : t("account.photoPermissionTitle"),
          res.reason === "camera"
            ? t("account.photoCameraPermissionBody")
            : t("account.photoPermissionBody"),
        );
        return;
      }
      // 1. Show the image immediately using the local file URI.
      await updateLocalUserProfile(db, { avatarUri: res.uri });
      setAvatarUri(res.uri);
      await revalidateLocalUserForSync();
      // 2. If signed in, upload the file to Supabase Storage and switch the
      //    stored URI to the returned public URL so other devices can load it.
      if (authUser?.id) {
        const publicUrl = await uploadAvatarToStorage(res.uri);
        if (publicUrl) {
          await updateLocalUserProfile(db, { avatarUri: publicUrl });
          setAvatarUri(publicUrl);
        }
        await pushLocalProfileToCloud(db);
      }
    } finally {
      setAvatarBusy(false);
    }
  };

  const clearAvatar = async () => {
    if (avatarBusy) return;
    setAvatarBusy(true);
    try {
      await updateLocalUserProfile(db, { avatarUri: null });
      await revalidateLocalUserForSync();
      if (authUser?.id) {
        await deleteAvatarFromStorage();
        await pushLocalProfileToCloud(db);
      }
      await deletePersistedProfilePhotoFile();
      setAvatarUri(null);
    } finally {
      setAvatarBusy(false);
    }
  };

  const onAvatarPress = () => {
    if (avatarBusy) return;
    const hasPhoto = !!avatarUri;
    if (Platform.OS === "web") {
      void applyPickedAvatar("library");
      return;
    }
    const options: { text: string; onPress?: () => void; style?: "cancel" | "destructive" }[] = [
      { text: t("account.photoTakePhoto"), onPress: () => void applyPickedAvatar("camera") },
      { text: t("account.photoChoose"), onPress: () => void applyPickedAvatar("library") },
    ];
    if (hasPhoto) {
      options.push({
        text: t("account.photoRemove"),
        onPress: () => void clearAvatar(),
        style: "destructive",
      });
    }
    options.push({ text: t("account.cancel"), style: "cancel" });
    Alert.alert(t("account.photoMenuTitle"), undefined, options);
  };

  const pickDefaultCurrency = async (code: string) => {
    setDefaultCurrency(code);
    setCurrencyPickerOpen(false);
    await setSetting(db, SETTINGS_KEYS.defaultCurrency, code);
    void pushProfilePrefs({ defaultCurrency: code });
  };

  const sendFeedback = async () => {
    if (feedbackBusy) return;
    if (!feedbackMessage.trim()) {
      Alert.alert(t("account.feedbackMissingTitle"), t("account.feedbackMissingBody"));
      return;
    }
    setFeedbackBusy(true);
    try {
      await createUserFeedback(db, {
        title: feedbackTitle.trim() ? feedbackTitle.trim() : null,
        message: feedbackMessage,
      });
      setFeedbackTitle("");
      setFeedbackMessage("");
      Alert.alert(t("account.feedbackSentTitle"), t("account.feedbackSentBody"));
    } catch (e) {
      Alert.alert(
        t("account.feedbackFailedTitle"),
        e instanceof Error ? e.message : t("account.feedbackFailedBody"),
      );
    } finally {
      setFeedbackBusy(false);
    }
  };

  /**
   * Unified sign-in / sign-up. Tries sign-in first; on "invalid credentials"
   * falls through to sign-up. If sign-up then reports the user already exists,
   * we know the password was wrong on sign-in — surface that clearly and point
   * the user at Forgot password.
   */
  // react-native-web's `Alert.alert` is a no-op in 0.21. Fall back to the
  // browser's `window.alert` / `window.confirm` on web so the user actually
  // sees auth failures in Firefox / Safari / Chrome.
  const showAuthAlert = (title: string, body: string) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      window.alert(`${title}\n\n${body}`);
      return;
    }
    Alert.alert(title, body);
  };
  const showAuthConfirm = (
    title: string,
    body: string,
    confirmLabel: string,
    onConfirm: () => void,
  ) => {
    if (Platform.OS === "web" && typeof window !== "undefined") {
      if (window.confirm(`${title}\n\n${body}`)) onConfirm();
      return;
    }
    Alert.alert(title, body, [
      { text: t("account.cancel"), style: "cancel" },
      { text: confirmLabel, onPress: onConfirm },
    ]);
  };

  const continueAuth = async () => {
    if (authBusy) return;
    const em = authEmail.trim();
    if (!isValidOptionalEmail(em) || !em) {
      showAuthAlert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
      return;
    }
    if (authPassword.length < 6) {
      showAuthAlert(t("account.authErrorTitle"), t("account.authPasswordTooShort"));
      return;
    }
    if (isDeviceLikelyOffline()) {
      showAuthAlert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    setAuthBusy(true);
    try {
      const { error: signInErr } = await signInWithPassword(em, authPassword);
      if (!signInErr) {
        setAuthPassword("");
        const p = await getLocalUserProfile(db);
        if (!p.email?.trim()) {
          await updateLocalUserProfile(db, { email: em });
        }
        await revalidateLocalUserForSync();
        await load();
        return;
      }
      if (isOfflineLikeError(signInErr)) {
        showAuthAlert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
        return;
      }
      const notConfirmed = /email.*not.*confirm|email_not_confirmed/i.test(
        signInErr.message,
      );
      if (notConfirmed) {
        showAuthConfirm(
          t("account.authEmailNotConfirmedTitle"),
          t("account.authEmailNotConfirmedBody"),
          t("account.authResendConfirmation"),
          () => {
            void (async () => {
              if (isDeviceLikelyOffline()) {
                showAuthAlert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
                return;
              }
              const { error: resendErr } = await resendEmailConfirmation(em);
              if (resendErr) {
                if (isOfflineLikeError(resendErr)) {
                  showAuthAlert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
                  return;
                }
                showAuthAlert(t("account.authErrorTitle"), resendErr.message);
                return;
              }
              showAuthAlert(
                t("account.authResendConfirmationSentTitle"),
                t("account.authResendConfirmationSentBody"),
              );
            })();
          },
        );
        return;
      }
      const invalidCreds = /invalid login credentials|invalid.*password/i.test(
        signInErr.message,
      );
      if (!invalidCreds) {
        showAuthAlert(t("account.authErrorTitle"), signInErr.message);
        return;
      }
      const { error: signUpErr, newAccount } = await signUpWithPassword(
        em,
        authPassword,
      );
      if (signUpErr) {
        if (isOfflineLikeError(signUpErr)) {
          showAuthAlert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
          return;
        }
        const alreadyExists = /already registered|already exists|user.*exists/i.test(
          signUpErr.message,
        );
        if (alreadyExists) {
          // Existing (confirmed) account — the earlier sign-in failure was a
          // wrong password, not a missing user.
          showAuthAlert(
            t("account.authWrongPasswordTitle"),
            t("account.authWrongPasswordBody"),
          );
          return;
        }
        showAuthAlert(t("account.authErrorTitle"), signUpErr.message);
        return;
      }
      // signUp returned without an error. With Supabase's email enumeration
      // protection on, that still means "account exists" when identities is
      // empty (newAccount === false) — so we must show wrong-password, NOT a
      // bogus "confirmation sent" message.
      if (!newAccount) {
        showAuthAlert(
          t("account.authWrongPasswordTitle"),
          t("account.authWrongPasswordBody"),
        );
        return;
      }
      setAuthPassword("");
      showAuthAlert(t("account.authTitle"), t("account.authWelcomeNewAccount"));
    } finally {
      setAuthBusy(false);
    }
  };

  const handleForgotPassword = async () => {
    if (authForgotBusy) return;
    const em = authEmail.trim();
    if (!isValidOptionalEmail(em) || !em) {
      Alert.alert(t("account.invalidEmailTitle"), t("account.authForgotPasswordNoEmail"));
      return;
    }
    if (isDeviceLikelyOffline()) {
      Alert.alert(t("account.authOfflineTitle"), t("account.authOfflineBody"));
      return;
    }
    setAuthForgotBusy(true);
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
      setAuthForgotBusy(false);
    }
  };

  const canSaveProfile =
    name.trim().length > 0 && isValidOptionalEmail(email.trim());
  const profileEmailInvalid = !isValidOptionalEmail(email.trim());
  const isProfileDirty =
    name.trim() !== initialProfile.name.trim() || email.trim() !== initialProfile.email.trim();

  const cloudSyncDetailHint = useMemo((): string | null => {
    if (cloudSyncBuildDisabled) return t("account.cloudSyncBuildDisabled");
    if (!cloudSyncCanBeUsed) return t("account.cloudSyncNotConfigured");
    return null;
  }, [t, cloudSyncBuildDisabled, cloudSyncCanBeUsed]);

  const syncStatus = useSyncStatusDisplay();

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View style={styles.column}>
          {/* Account */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="person-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.sectionAccount")}</Text>
            </View>

            <View
              style={[
                {
                  flexDirection: isRTL ? "row-reverse" : "row",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 14,
                },
              ]}
            >
              <Pressable
                onPress={onAvatarPress}
                disabled={avatarBusy}
                accessibilityRole="button"
                accessibilityLabel={t("account.avatarA11y")}
                hitSlop={6}
                style={({ pressed }) => [
                  {
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: colors.inputSurface,
                    borderWidth: StyleSheet.hairlineWidth,
                    borderColor: colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                    opacity: pressed || avatarBusy ? 0.8 : 1,
                  },
                ]}
              >
                {avatarUri ? (
                  <Image
                    source={{ uri: avatarUri }}
                    style={{ width: 56, height: 56 }}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text }}>
                    {(name.trim().slice(0, 1) || "•").toUpperCase()}
                  </Text>
                )}
              </Pressable>
              <View style={{ flex: 1, minWidth: 0 }}>
                <TextInput
                  style={styles.identityNameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t("account.displayNamePlaceholder")}
                  placeholderTextColor={colors.muted}
                  autoCapitalize="words"
                  editable={!profileBusy}
                  onFocus={() => setFocusField("name")}
                  onBlur={() => setFocusField(null)}
                  returnKeyType="done"
                  accessibilityLabel={t("account.displayName")}
                  numberOfLines={1}
                />
                <View
                  style={[
                    styles.identityNameUnderline,
                    focusField === "name" && styles.identityNameUnderlineFocused,
                  ]}
                />
                <View
                  style={{
                    flexDirection: isRTL ? "row-reverse" : "row",
                    alignItems: "center",
                    gap: 4,
                    marginTop: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color: colors.muted,
                      flexShrink: 1,
                      textAlign: isRTL ? "right" : "left",
                    }}
                    numberOfLines={1}
                  >
                    {authUser?.email || email.trim() || t("account.emailOptional")}
                  </Text>
                  {authUser?.email ? (
                    authUser.email_confirmed_at ? (
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color={emerald}
                        accessibilityLabel={t("account.authEmailVerified")}
                      />
                    ) : (
                      <Ionicons
                        name="alert-circle"
                        size={14}
                        color={colors.owe}
                        accessibilityLabel={t("account.authEmailUnverified")}
                      />
                    )
                  ) : null}
                </View>
                <View
                  style={[
                    styles.statusPill,
                    cloudSyncUserEnabled ? styles.statusPillSignedIn : styles.statusPillLocal,
                  ]}
                  accessible
                  accessibilityRole="text"
                >
                  <Ionicons
                    name={cloudSyncUserEnabled ? "cloud-done-outline" : "phone-portrait-outline"}
                    size={12}
                    color={cloudSyncUserEnabled ? emerald : colors.muted}
                  />
                  <Text
                    style={[
                      styles.statusPillText,
                      { color: cloudSyncUserEnabled ? emerald : colors.muted },
                    ]}
                  >
                    {cloudSyncUserEnabled
                      ? t("account.syncStatusOn")
                      : t("account.syncStatusLocalOnly")}
                  </Text>
                </View>
              </View>
            </View>

            {isProfileDirty ? (
              <AppButton
                variant="primary"
                fullWidth
                style={styles.btnFull}
                textStyle={styles.btnText}
                label={
                  profileBusy
                    ? t("account.saving")
                    : profileSaved
                      ? "✓ " + t("account.saveProfile")
                      : t("account.saveProfile")
                }
                onPress={() => void saveProfile()}
                disabled={!canSaveProfile || profileBusy}
              />
            ) : null}
          </View>

          {/* Cloud sync & backup — hero (signed-out) or dashboard (signed-in) */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="cloud-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.sectionSync")}</Text>
            </View>

            {!isSyncConfigured() || cloudSyncBuildDisabled ? (
              <Text style={[styles.helper, { marginBottom: 0 }]}>
                {cloudSyncDetailHint}
              </Text>
            ) : authSessionLoading ? (
              <Text style={[styles.helper, { marginBottom: 0 }]}>{t("account.authBusy")}</Text>
            ) : authUser?.email ? (
              /* ——— SIGNED-IN DASHBOARD ——— */
              <>

                {!isPremium ? (
                  <PremiumRequiredPanel
                    title={t("premium.gateSyncTitle")}
                    body={t("premium.gateSyncBody")}
                  />
                ) : (
                <View
                  style={[
                    styles.syncTile,
                    !cloudSyncUserEnabled && styles.syncTileOff,
                  ]}
                >
                  <View style={styles.syncTileHeader}>
                    <View
                      style={[
                        styles.syncDot,
                        cloudSyncUserEnabled ? styles.syncDotOn : styles.syncDotOff,
                      ]}
                    />
                    <Text style={styles.syncTileTitle}>
                      {cloudSyncUserEnabled
                        ? t("account.syncStatusOn")
                        : t("account.syncStatusOff")}
                    </Text>
                    <AppSwitch
                      value={cloudSyncUserEnabled}
                      onValueChange={(v) => {
                        void (async () => {
                          if (v) {
                            const fromForm = email.trim();
                            if (!isValidOptionalEmail(fromForm)) {
                              Alert.alert(
                                t("account.invalidEmailTitle"),
                                t("account.invalidEmail"),
                              );
                              return;
                            }
                            if (fromForm) {
                              const p = await getLocalUserProfile(db);
                              if (!p.email?.trim()) {
                                try {
                                  await updateLocalUserProfile(db, { email: fromForm });
                                  await revalidateLocalUserForSync();
                                } catch {
                                  Alert.alert(
                                    t("account.cloudSyncAlertNoEmailTitle"),
                                    t("account.cloudSyncAlertNoEmailBody"),
                                  );
                                  return;
                                }
                              }
                            }
                            const ok = await setCloudSyncUserEnabled(true);
                            if (!ok) {
                              Alert.alert(
                                t("account.cloudSyncAlertNoEmailTitle"),
                                t("account.cloudSyncAlertNoEmailBody"),
                              );
                            } else {
                              await load();
                            }
                          } else {
                            await setCloudSyncUserEnabled(false);
                          }
                        })();
                      }}
                      disabled={!cloudSyncUserPrefReady}
                    />
                  </View>
                  <View
                    style={{
                      flexDirection: isRTL ? "row-reverse" : "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 8,
                    }}
                    accessible
                    accessibilityRole="text"
                    accessibilityLabel={syncStatus.text}
                  >
                    <Ionicons
                      name={syncStatus.icon}
                      size={14}
                      color={colors.muted}
                      importantForAccessibility="no"
                    />
                    <Text style={[styles.syncStatusText, { marginLeft: 0 }]}>
                      {syncStatus.text}
                    </Text>
                  </View>
                </View>
                )}

                {isPremium && cloudSyncCanBeUsed && !localUserHasProfileEmail ? (
                  <Text style={[styles.helper, { marginTop: 12, marginBottom: 0 }]}>
                    {t("account.cloudSyncEmailRequired")}
                  </Text>
                ) : null}

                <View style={styles.sectionDivider} />

                <AppButton
                  variant="secondary"
                  fullWidth
                  style={{ marginTop: 0 }}
                  textStyle={styles.btnText}
                  label={authBusy ? t("account.authBusy") : t("account.authSignOut")}
                  onPress={() => {
                    void (async () => {
                      setAuthBusy(true);
                      try {
                        await signOut();
                        await performLocalSignOutCleanup(db);
                        setAuthEmail("");
                        setAuthPassword("");
                        await revalidateLocalUserForSync();
                        await load();
                      } finally {
                        setAuthBusy(false);
                      }
                    })();
                  }}
                  disabled={authBusy}
                  accessibilityLabel={t("account.authSignOut")}
                />
              </>
            ) : (
              /* ——— SIGNED-OUT HERO ——— */
              <>
                <View style={styles.heroWrap}>
                  <View style={styles.heroIconCircle}>
                    <Ionicons name="cloud-upload-outline" size={32} color={emerald} />
                  </View>
                  <Text style={styles.heroTitle}>{t("account.authHeroTitle")}</Text>
                  <Text style={styles.heroSubtitle}>{t("account.authHeroSubtitle")}</Text>
                </View>

                {!isPremium ? (
                  <PremiumRequiredPanel
                    title={t("premium.gateSyncTitle")}
                    body={t("premium.gateSyncBody")}
                  />
                ) : null}

                <View style={styles.sectionDivider} />

                <Pressable
                  onPress={() => authEmailInputRef.current?.focus()}
                  accessibilityRole="text"
                >
                  <Text style={[styles.authFieldLabel, styles.fieldLabelFirst]}>
                    {t("account.authEmailLabel")}
                  </Text>
                </Pressable>
                <TextInput
                  ref={authEmailInputRef}
                  style={[
                    styles.input,
                    focusField === "authEmail" && styles.inputFocused,
                  ]}
                  value={authEmail}
                  onChangeText={setAuthEmail}
                  placeholder={t("account.emailPlaceholder")}
                  placeholderTextColor={colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  importantForAutofill="yes"
                  editable={!authBusy}
                  onFocus={() => {
                    setFocusField("authEmail");
                    scrollToEndSoon();
                  }}
                  onBlur={() => setFocusField(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => authPasswordInputRef.current?.focus()}
                  clearable
                />
                <Pressable
                  onPress={() => authPasswordInputRef.current?.focus()}
                  accessibilityRole="text"
                >
                  <Text style={[styles.authFieldLabel]}>
                    {t("account.authPasswordLabel")}
                  </Text>
                </Pressable>
                <View style={styles.passwordInputWrapper}>
                  <TextInput
                    ref={authPasswordInputRef}
                    style={[
                      styles.input,
                      focusField === "authPassword" && styles.inputFocused,
                      { paddingRight: 48 },
                    ]}
                    value={authPassword}
                    onChangeText={setAuthPassword}
                    placeholder="••••••••"
                    placeholderTextColor={colors.muted}
                    secureTextEntry={!authPasswordVisible}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType="password"
                    editable={!authBusy}
                    onFocus={() => {
                      setFocusField("authPassword");
                      scrollToEndSoon();
                    }}
                    onBlur={() => setFocusField(null)}
                    returnKeyType="go"
                    onSubmitEditing={() => void continueAuth()}
                  />
                  <Pressable
                    style={styles.passwordToggleBtn}
                    onPress={() => setAuthPasswordVisible(!authPasswordVisible)}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={
                      authPasswordVisible
                        ? t("account.hidePassword")
                        : t("account.showPassword")
                    }
                  >
                    <Ionicons
                      name={authPasswordVisible ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={colors.muted}
                    />
                  </Pressable>
                </View>

                <AppButton
                  variant="primary"
                  fullWidth
                  style={styles.btnFull}
                  textStyle={styles.btnText}
                  label={authBusy ? t("account.authContinueBusy") : t("account.authContinue")}
                  onPress={() => void continueAuth()}
                  disabled={authBusy}
                  accessibilityLabel={t("account.authContinue")}
                />

                <Pressable
                  onPress={() => void handleForgotPassword()}
                  style={({ pressed }) => [
                    styles.forgotPasswordBtn,
                    pressed && styles.pressed,
                  ]}
                  disabled={authForgotBusy || authBusy}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t("account.authForgotPassword")}
                >
                  <Text style={styles.forgotPasswordText}>
                    {authForgotBusy
                      ? t("account.authForgotPasswordBusy")
                      : t("account.authForgotPassword")}
                  </Text>
                </Pressable>
              </>
            )}
          </View>

          {/* Preferences: language + currency */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="settings-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.sectionPreferences")}</Text>
            </View>
            <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>{t("account.language")}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.input,
                styles.pickerField,
                pressed && styles.pressed,
              ]}
              onPress={() => setLanguagePickerOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={t("account.language")}
            >
              <Text style={styles.pickerText}>
                {languageOptions.find((o) => o.code === locale)?.label ?? locale}
              </Text>
              <Ionicons name="chevron-down" size={20} color={colors.muted} />
            </Pressable>
            <Text style={styles.fieldLabel}>{t("account.defaultCurrency")}</Text>
            <Pressable
              style={({ pressed }) => [
                styles.input,
                styles.pickerField,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                setCurrencySearch("");
                setCurrencyPickerOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel={t("account.defaultCurrency")}
            >
              <Text style={styles.pickerText}>{currencyLabel(defaultCurrency)}</Text>
              <Ionicons name="chevron-down" size={20} color={colors.muted} />
            </Pressable>
            <Text style={styles.fieldLabel}>{t("account.appearance")}</Text>
            <SegmentedControl
              options={appearanceOptions}
              value={appearance}
              onChange={(v) => void setAppearance(v)}
              activeBg={emerald}
              activeTextColor="#fff"
              inactiveTextColor={colors.muted}
              trackBg={
                resolvedScheme === "dark"
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(15,23,42,0.06)"
              }
            />
          </View>

          {/* Danger zone */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="warning-outline" size={20} color={colors.destructive} />
              <Text style={styles.cardTitle}>{t("account.dangerZone")}</Text>
            </View>
            <View
              style={[
                {
                  width: "100%",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor:
                    resolvedScheme === "dark"
                      ? "rgba(239, 68, 68, 0.35)"
                      : "rgba(239, 68, 68, 0.22)",
                  backgroundColor:
                    resolvedScheme === "dark"
                      ? "rgba(239, 68, 68, 0.08)"
                      : "rgba(239, 68, 68, 0.06)",
                  padding: 14,
                },
              ]}
            >
              <Text style={[styles.helper, { marginBottom: 12 }]}>
                {t("account.deleteAccountHint")}
              </Text>
              <AppButton
                variant="outline"
                fullWidth
                style={{ marginTop: 0, borderColor: colors.destructive, backgroundColor: "transparent" }}
                textStyle={[styles.btnText, { color: colors.destructive }]}
                label={dangerBusy ? t("account.authBusy") : t("account.deleteAccount")}
                onPress={() => {
                  setDangerConfirmText("");
                  setDangerConfirmOpen(true);
                }}
                disabled={dangerBusy}
                accessibilityLabel={t("account.deleteAccount")}
              />
            </View>
          </View>

          {/* Feedback */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={colors.muted} />
              <Text style={styles.cardTitle}>{t("account.sectionFeedback")}</Text>
            </View>
            <Text style={[styles.helper, { marginBottom: 12 }]}>
              {t("account.feedbackHint")}
            </Text>
            <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>
              {t("account.feedbackTitleLabel")}
            </Text>
            <TextInput
              style={styles.input}
              value={feedbackTitle}
              onChangeText={setFeedbackTitle}
              placeholder={t("account.feedbackTitlePlaceholder")}
              placeholderTextColor={colors.muted}
              editable={!feedbackBusy}
              clearable
            />
            <Text style={styles.fieldLabel}>{t("account.feedbackMessageLabel")}</Text>
            <TextInput
              style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
              value={feedbackMessage}
              onChangeText={setFeedbackMessage}
              placeholder={t("account.feedbackMessagePlaceholder")}
              placeholderTextColor={colors.muted}
              editable={!feedbackBusy}
              multiline
            />
            <AppButton
              variant="primary"
              fullWidth
              style={styles.btnFull}
              textStyle={styles.btnText}
              label={feedbackBusy ? t("account.feedbackSending") : t("account.feedbackSend")}
              onPress={() => void sendFeedback()}
              disabled={feedbackBusy}
              accessibilityLabel={t("account.feedbackSend")}
            />
          </View>
        </View>
      </ScrollView>

      <Modal
        visible={dangerConfirmOpen}
        animationType="slide"
        onRequestClose={() => setDangerConfirmOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setDangerConfirmOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.deleteAccountTitle")}</Text>
            <Pressable onPress={() => setDangerConfirmOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
          </View>
          <Text style={[styles.helper, { marginBottom: 12 }]}>
            {t("account.deleteAccountConfirmBody")}
          </Text>
          <TextInput
            style={styles.input}
            value={dangerConfirmText}
            onChangeText={setDangerConfirmText}
            placeholder={t("account.deleteAccountTypeToConfirm")}
            placeholderTextColor={colors.muted}
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!dangerBusy}
            clearable
          />
          <AppButton
            variant="destructive"
            fullWidth
            style={styles.btnFull}
            textStyle={styles.btnText}
            label={t("account.deleteAccountConfirmCta")}
            disabled={dangerConfirmText.trim().toUpperCase() !== "DELETE" || dangerBusy}
            onPress={() => {
              void (async () => {
                if (dangerBusy) return;
                setDangerBusy(true);
                try {
                  /**
                   * Strategy: do NO DB / sync work before the reload. We only
                   * (a) stop future sync from firing, (b) best-effort sign out
                   * so the server is notified, and (c) mark a "pending wipe"
                   * flag in AsyncStorage. The actual DB file delete + storage
                   * clear happens on the next cold boot via
                   * `applyPendingAccountDeletionIfAny`, with no live SQLite
                   * handle or running effects to race against.
                   */
                  try {
                    await setCloudSyncUserEnabled(false);
                  } catch {
                    /* best-effort */
                  }
                  // Wipe this user's remote data (profile, groups they
                  // solo-owned, their expenses/splits/settlements) BEFORE the
                  // signOut call — after signOut the access token is gone and
                  // RLS will reject these deletes.
                  if (authUser?.id) {
                    try {
                      await deleteRemoteAccountData(authUser.id);
                    } catch {
                      /* best-effort */
                    }
                  }
                  try {
                    if (isSyncConfigured()) {
                      await signOut();
                    }
                  } catch {
                    /* best-effort */
                  }
                  await markPendingAccountDeletion();
                  setDangerConfirmOpen(false);
                  if (Platform.OS === "web") {
                    if (typeof window !== "undefined") window.location.reload();
                  } else {
                    try {
                      const { reloadAppAsync } = await import("expo");
                      await reloadAppAsync("account-deleted");
                    } catch {
                      // If reload is unavailable (bare expo-updates config),
                      // tell the user to restart manually — the flag is set so
                      // the next launch will complete the wipe.
                      Alert.alert(
                        t("account.deleteAccountDoneTitle"),
                        t("account.deleteAccountDoneBody"),
                      );
                    }
                  }
                } catch (e) {
                  Alert.alert(
                    t("account.authErrorTitle"),
                    e instanceof Error ? e.message : t("account.exportFailedBody"),
                  );
                } finally {
                  setDangerBusy(false);
                }
              })();
            }}
          />
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={currencyPickerOpen}
        animationType="slide"
        onRequestClose={() => setCurrencyPickerOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setCurrencyPickerOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.currencyModalTitle")}</Text>
            <Pressable onPress={() => setCurrencyPickerOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={currencySearch}
            onChangeText={setCurrencySearch}
            placeholder={t("account.currencySearchPlaceholder")}
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            clearable
          />
          <KeyboardDismissButton colors={colors} isRTL={isRTL} style={{ marginBottom: 12 }} />
          <FlatList
            style={styles.currencyFlatList}
            data={filteredCurrencies}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  item.code === defaultCurrency && styles.rowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => void pickDefaultCurrency(item.code)}
              >
                <Text style={styles.rowCode}>{item.code}</Text>
                <Text style={styles.rowLabel}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>{t("account.currencyEmpty")}</Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={languagePickerOpen}
        animationType="slide"
        onRequestClose={() => setLanguagePickerOpen(false)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setLanguagePickerOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.language")}</Text>
            <Pressable onPress={() => setLanguagePickerOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
          </View>
          <FlatList
            style={styles.currencyFlatList}
            data={languageOptions}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  item.code === locale && styles.rowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void setLocale(item.code);
                  setLanguagePickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === locale }}
              >
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.code === locale ? (
                  <Ionicons name="checkmark" size={20} color={emerald} />
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
