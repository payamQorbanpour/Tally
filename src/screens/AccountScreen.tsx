import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";
import { AppSwitch } from "../ui/AppSwitch";
import { TextInput } from "../ui/AppTextInput";
import { CloudSyncGateOverlay } from "../components/CloudSyncGateOverlay";
import { CURRENCY_OPTIONS, isValidCurrencyCode } from "../data/currencies";
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
  pickProfileAvatar,
  deletePersistedProfilePhotoFile,
} from "../core/pickProfileAvatar";
import {
  uploadAvatarToStorage,
  deleteAvatarFromStorage,
  ensureCachedAvatarLocalPath,
  readCachedAvatarLocalPath,
  setCachedAvatarLocalPathForUrl,
  clearCachedAvatarLocalPath,
} from "../core/avatarStorage";
import { usePremium } from "../premium/PremiumContext";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { performLocalSignOutCleanup } from "../auth/localAuthCleanup";
import {
  hydrateLocalProfileFromCloud,
  pushLocalProfileToCloud,
} from "../auth/postSignInBootstrap";
import { pushProfilePrefs } from "../sync/profilePrefsSync";
import { softDeleteRemoteAccount } from "../sync/softDeleteRemoteAccount";
import { captureError } from "../observability/sentry";
// eslint-disable-next-line import/no-unresolved -- resolves after npm install
import * as SentrySdk from "@sentry/react-native";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

const SETTINGS_EMERALD = "#10b981";
const SETTINGS_EMERALD_LIGHT = "#059669";

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
      paddingVertical: 8,
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
    /* — Inline-editable email next to / below display name — */
    identityEmailInput: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.muted,
      padding: 0,
      margin: 0,
      paddingVertical: 8,
      borderWidth: 0,
      backgroundColor: "transparent",
      textAlign: isRTL ? "right" : "left",
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    identityEmailRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
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
    cloudIllustrationWrap: {
      width: "100%",
      paddingVertical: 18,
      paddingHorizontal: 4,
      borderRadius: 16,
      backgroundColor: resolvedScheme === "dark"
        ? "rgba(16, 185, 129, 0.10)"
        : "rgba(5, 150, 105, 0.08)",
      alignItems: "center",
      marginBottom: 18,
    },
    cloudIllustrationRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 14,
      marginBottom: 14,
    },
    googleBtn: {
      backgroundColor: resolvedScheme === "dark" ? "#1F2937" : "#FFFFFF",
      borderWidth: 1,
      borderColor: cardBorder,
      marginTop: 18,
    },
    googleBtnText: {
      color: resolvedScheme === "dark" ? "#F8FAFC" : "#1F1F1F",
      fontWeight: "700",
    },
    orRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      marginVertical: 16,
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
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    cloudFooter: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.muted,
      textAlign: "center",
      marginTop: 14,
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
    /* — Cloud-sync gate (overlay sits on top of the dashboard tile when
         the user isn't signed in or doesn't have premium) — */
    gateWrap: {
      position: "relative",
      width: "100%",
    },
    /* The dim block enforces a min-height so the absolutely-positioned
       overlay never overflows its container into the next section
       (Preferences) below. Sized to comfortably hold the gate card
       (~280pt with body + primary CTA + Google button + footer). */
    gateDimmed: {
      opacity: 0.35,
      minHeight: 280,
    },
    /* Horizontal inset keeps the overlay card narrower than the cloud
       sync card behind it, so the parent card's title & edges remain
       visible — without that, the overlay completely masks the card it
       was meant to be hovering over. */
    gateOverlay: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 16,
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
    /* —— New layout (image-#15) ————————————————————————————————— */
    headerAnchor: {
      backgroundColor: colors.bg,
      zIndex: 2,
    },
    pageTitleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 6,
    },
    pageTitleHero: {
      fontSize: 18,
      fontWeight: "700",
      color: colors.text,
      flex: 1,
      ...te,
    },
    profileCard: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 14,
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      padding: 14,
      marginBottom: 14,
    },
    profileTextCol: { flex: 1, minWidth: 0 },
    profileName: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      ...te,
    },
    /** Inline-editable name input — same look as profileName but tappable. */
    profileNameInput: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.text,
      padding: 0,
      margin: 0,
      paddingVertical: 2,
      borderWidth: 0,
      backgroundColor: "transparent",
      textAlign: isRTL ? "right" : "left",
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    profileEmailRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      marginTop: 4,
    },
    profileEmail: {
      fontSize: 13,
      color: colors.muted,
      flexShrink: 1,
      ...te,
    },
    profileEmailInput: {
      flex: 1,
      fontSize: 13,
      color: colors.muted,
      padding: 0,
      margin: 0,
      paddingVertical: 2,
      borderWidth: 0,
      backgroundColor: "transparent",
      textAlign: isRTL ? "right" : "left",
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    /** Save action shown in the page title bar while the profile is dirty. */
    titleSaveBtn: {
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: colors.owedSoft,
    },
    titleSaveLabel: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
    },
    /** Title row used inside the new preferences card. */
    sectionCardTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      paddingHorizontal: 4,
      marginTop: 8,
      marginBottom: 8,
      ...te,
    },
    /** Single rounded card holding the settings rows. */
    listCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      overflow: "hidden",
      marginBottom: 18,
    },
    listRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    listRowIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.owedSoft,
    },
    listRowLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
      color: colors.text,
      ...te,
    },
    listRowValue: {
      fontSize: 13,
      color: colors.muted,
      ...te,
    },
    listRowDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: cardBorder,
      marginLeft: isRTL ? 0 : 60,
      marginRight: isRTL ? 60 : 0,
    },
    /** Sign-out card: full-width red link, single row. */
    signOutCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: cardBorder,
      overflow: "hidden",
      marginBottom: 14,
    },
    signOutRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    signOutIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.oweSoft,
    },
    signOutLabel: {
      flex: 1,
      fontSize: 15,
      fontWeight: "600",
      color: colors.destructive,
      ...te,
    },
    /** Last-synced line on the sync tile (under the "Up to date" line). */
    syncStatusLineRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 6,
      marginTop: 6,
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
    syncState,
  } = useTallyData();
  const { colors, resolvedScheme, appearance, setAppearance } = useTheme();
  const { locale, setLocale, t, isRTL } = useLocale();
  const { isPremium } = usePremium();
  const styles = useMemo(
    () => buildAccountStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
  );
  const emerald = resolvedScheme === "dark" ? SETTINGS_EMERALD : SETTINGS_EMERALD_LIGHT;

  const languageOptions: { code: AppLocale; label: string }[] = useMemo(
    () => [
      { code: "en", label: t("account.languageEnglish") },
      { code: "fa", label: t("account.languageFarsi") },
      { code: "es", label: t("account.languageSpanish") },
    ],
    [t],
  );

  const appearanceOptions: { code: "light" | "dark" | "system"; label: string }[] = useMemo(
    () => [
      { code: "light", label: t("account.appearanceLight") },
      { code: "dark", label: t("account.appearanceDark") },
      { code: "system", label: t("account.appearanceSystem") },
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
  const [appearancePickerOpen, setAppearancePickerOpen] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerConfirmOpen, setDangerConfirmOpen] = useState(false);
  const [dangerConfirmText, setDangerConfirmText] = useState("");
  const [initialProfile, setInitialProfile] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });
  const insets = useSafeAreaInsets();
  const rootNav =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dataExportOpen, setDataExportOpen] = useState(false);

  const {
    user: authUser,
    loading: authSessionLoading,
    refreshUser,
    signOut,
  } = useSupabaseSession();

  const load = useCallback(async () => {
    const p = await getLocalUserProfile(db);
    setName(p.name);
    setEmail(p.email ?? "");
    setInitialProfile({ name: p.name ?? "", email: (p.email ?? "").trim() });
    const cur = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (cur && isValidCurrencyCode(cur)) setDefaultCurrency(cur);

    // Resolve the avatar URI: when DB holds a remote URL, prefer the local
    // cached copy so renders never round-trip the network. Cache miss falls
    // back to the URL while we kick off a background download.
    const raw = p.avatarUri;
    if (raw && /^https?:\/\//i.test(raw)) {
      const cached = await readCachedAvatarLocalPath(db, raw);
      if (cached) {
        setAvatarUri(cached);
      } else {
        setAvatarUri(raw);
        void (async () => {
          const local = await ensureCachedAvatarLocalPath(db, raw);
          if (local) setAvatarUri(local);
        })();
      }
    } else {
      setAvatarUri(raw ?? null);
    }
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
      // Pull latest profile (avatar URL, display name) from the cloud each
      // time the user opens this tab — the regular sync skips the user's
      // own row, so without this an avatar uploaded from another device
      // would never refresh here.
      if (authUser?.id) {
        void (async () => {
          await hydrateLocalProfileFromCloud(db, authUser.id);
          await load();
        })();
      }
    }, [db, load, authUser, refreshUser]),
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

  /**
   * Sign out of the Supabase session and clear cached auth-form state.
   * Profile data (name, avatar, prefs) is intentionally preserved by
   * `performLocalSignOutCleanup` — the only thing that goes is the
   * remap from the seeded local id to the Supabase uid.
   */
  const handleSignOut = useCallback(async () => {
    if (authBusy) return;
    setAuthBusy(true);
    try {
      await signOut();
      await performLocalSignOutCleanup(db);
      await revalidateLocalUserForSync();
      await load();
    } finally {
      setAuthBusy(false);
    }
  }, [authBusy, db, load, revalidateLocalUserForSync, signOut]);

  const saveProfile = async () => {
    if (profileBusy) return;
    const emailTrim = email.trim();
    if (!isValidOptionalEmail(emailTrim)) {
      Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
      return;
    }
    // Clearing the email while signed in: the email is the link between
    // the local profile and the Supabase auth account, so having one
    // without the other is meaningless. Treat "save with empty email"
    // as an implicit sign-out — but also persist the empty email and
    // (if name changed) the new name first, so the user's typed-into-
    // the-form intent isn't lost when handleSignOut re-reads the
    // profile from SQLite on completion.
    if (authUser?.email && !emailTrim) {
      try {
        await updateLocalUserProfile(db, { name, email: null });
        await revalidateLocalUserForSync();
      } catch {
        /* best-effort — sign-out still proceeds */
      }
      await handleSignOut();
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
          // Pre-populate the URL→file cache so future renders (and the next
          // `load()`) resolve straight to the on-disk copy without a
          // download round-trip.
          await setCachedAvatarLocalPathForUrl(db, publicUrl, res.uri);
          await updateLocalUserProfile(db, { avatarUri: publicUrl });
          // Keep the visible image as the local file — `publicUrl` is only
          // canonical for cross-device sync; rendering it here would force
          // a network fetch we already have on disk.
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
      await clearCachedAvatarLocalPath(db);
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

  const canSaveProfile =
    name.trim().length > 0 && isValidOptionalEmail(email.trim());
  const isProfileDirty =
    name.trim() !== initialProfile.name.trim() || email.trim() !== initialProfile.email.trim();

  const cloudSyncDetailHint = useMemo((): string | null => {
    if (cloudSyncBuildDisabled) return t("account.cloudSyncBuildDisabled");
    if (!cloudSyncCanBeUsed) return t("account.cloudSyncNotConfigured");
    return null;
  }, [t, cloudSyncBuildDisabled, cloudSyncCanBeUsed]);

  const syncStatus = useSyncStatusDisplay();

  const lastSyncedText =
    syncState.lastOkAt != null
      ? new Date(syncState.lastOkAt).toLocaleString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          month: "short",
          day: "numeric",
        })
      : null;

  const goToNotifications = () => {
    // Notifications lives inside the Groups stack — go via the parent root.
    try {
      rootNav.navigate("Main", {
        screen: "Groups",
        params: { screen: "Notifications" },
      } as never);
    } catch {
      /* fallback: surface a friendly alert */
      Alert.alert(t("account.rowNotifications"));
    }
  };

  const settingsRows: {
    key: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    onPress: () => void;
  }[] = [
    {
      key: "language",
      icon: "globe-outline",
      label: t("account.language"),
      value:
        languageOptions.find((o) => o.code === locale)?.label ?? locale,
      onPress: () => setLanguagePickerOpen(true),
    },
    {
      key: "appearance",
      icon: "color-palette-outline",
      label: t("account.appearance"),
      value:
        appearanceOptions.find((o) => o.code === appearance)?.label ??
        appearance,
      onPress: () => setAppearancePickerOpen(true),
    },
    {
      key: "currency",
      icon: "stats-chart-outline",
      label: t("account.currencyModalTitle"),
      value: defaultCurrency,
      onPress: () => {
        setCurrencySearch("");
        setCurrencyPickerOpen(true);
      },
    },
    {
      key: "data",
      icon: "download-outline",
      label: t("account.rowDataExport"),
      onPress: () => setDataExportOpen(true),
    },
    {
      key: "notifications",
      icon: "notifications-outline",
      label: t("account.rowNotifications"),
      onPress: goToNotifications,
    },
    {
      key: "help",
      icon: "help-circle-outline",
      label: t("account.rowHelpSupport"),
      onPress: () => setHelpOpen(true),
    },
    {
      key: "about",
      icon: "information-circle-outline",
      label: t("account.rowAboutTally"),
      onPress: () => setAboutOpen(true),
    },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.wrap}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
    >
      <View style={[styles.headerAnchor, { paddingTop: Math.max(8, insets.top) }]}>
        <View style={styles.column}>
          <View style={styles.pageTitleRow}>
            <Ionicons name="person-outline" size={22} color={colors.text} />
            <Text style={styles.pageTitleHero}>
              {t("account.sectionAccount")}
            </Text>
            {isProfileDirty ? (
              <Pressable
                onPress={() => void saveProfile()}
                disabled={!canSaveProfile || profileBusy}
                hitSlop={8}
                style={({ pressed }) => [
                  styles.titleSaveBtn,
                  (!canSaveProfile || profileBusy) && styles.disabled,
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("account.saveProfile")}
              >
                <Text style={styles.titleSaveLabel}>
                  {profileBusy
                    ? t("account.saving")
                    : profileSaved
                      ? "✓ " + t("account.saveProfile")
                      : t("account.saveProfile")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: 12 },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
      >
        <View style={styles.column}>
          {/* Profile card — inline editable name + email; Save shows in title bar when dirty. */}
          <View style={styles.profileCard}>
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
                  flexShrink: 0,
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
                <Text style={{ fontSize: 22, fontWeight: "800", color: colors.text }}>
                  {(name.trim().slice(0, 1) || "•").toUpperCase()}
                </Text>
              )}
            </Pressable>
            <View style={styles.profileTextCol}>
              <TextInput
                style={styles.profileNameInput}
                value={name}
                onChangeText={setName}
                placeholder={t("account.displayNamePlaceholder")}
                placeholderTextColor={colors.muted}
                autoCapitalize="words"
                editable={!profileBusy}
                returnKeyType="done"
                accessibilityLabel={t("account.displayName")}
                numberOfLines={1}
              />
              <View style={styles.profileEmailRow}>
                <TextInput
                  style={styles.profileEmailInput}
                  value={email}
                  onChangeText={setEmail}
                  placeholder={t("account.emailPlaceholder")}
                  placeholderTextColor={colors.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="email"
                  textContentType="emailAddress"
                  editable={!profileBusy}
                  returnKeyType="done"
                  accessibilityLabel={t("account.email")}
                  numberOfLines={1}
                />
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
            </View>
          </View>

          {/* Cloud sync & backup — keeps existing premium gate + toggle. */}
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
              <Text style={[styles.helper, { marginBottom: 0 }]}>
                {t("account.authBusy")}
              </Text>
            ) : (
              (() => {
                const signInGate = !authUser?.email;
                const premiumGate = !signInGate && !isPremium;
                const gated = signInGate || premiumGate;
                return (
                  <View style={styles.gateWrap}>
                    <View
                      style={gated ? styles.gateDimmed : null}
                      pointerEvents={gated ? "none" : "auto"}
                    >
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
                              cloudSyncUserEnabled
                                ? styles.syncDotOn
                                : styles.syncDotOff,
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
                                  if (!isPremium) {
                                    Alert.alert(
                                      t("premium.gateSyncTitle"),
                                      t("premium.gateSyncBody"),
                                    );
                                    return;
                                  }
                                  const fromForm =
                                    email.trim() ||
                                    authUser?.email?.trim() ||
                                    "";
                                  if (
                                    !isValidOptionalEmail(fromForm) ||
                                    !fromForm
                                  ) {
                                    Alert.alert(
                                      t("account.cloudSyncAlertNoEmailTitle"),
                                      t("account.cloudSyncAlertNoEmailBody"),
                                    );
                                    return;
                                  }
                                  const p = await getLocalUserProfile(db);
                                  if (!p.email?.trim()) {
                                    try {
                                      await updateLocalUserProfile(db, {
                                        email: fromForm,
                                      });
                                      await revalidateLocalUserForSync();
                                    } catch {
                                      Alert.alert(
                                        t("account.cloudSyncAlertNoEmailTitle"),
                                        t("account.cloudSyncAlertNoEmailBody"),
                                      );
                                      return;
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
                          style={styles.syncStatusLineRow}
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
                          <Text style={styles.syncStatusText}>
                            {syncStatus.text}
                          </Text>
                        </View>
                        {lastSyncedText ? (
                          <View style={styles.syncStatusLineRow}>
                            <Ionicons
                              name="checkmark-circle-outline"
                              size={14}
                              color={colors.muted}
                              importantForAccessibility="no"
                            />
                            <Text style={styles.syncStatusText}>
                              {t("account.syncLastSynced", { when: lastSyncedText })}
                            </Text>
                          </View>
                        ) : null}
                      </View>

                      {isPremium &&
                      cloudSyncCanBeUsed &&
                      !localUserHasProfileEmail ? (
                        <Text
                          style={[
                            styles.helper,
                            { marginTop: 12, marginBottom: 0 },
                          ]}
                        >
                          {t("account.cloudSyncEmailRequired")}
                        </Text>
                      ) : null}
                    </View>
                    {gated ? (
                      <View style={styles.gateOverlay} pointerEvents="box-none">
                        <CloudSyncGateOverlay
                          mode={signInGate ? "signin" : "premium"}
                        />
                      </View>
                    ) : null}
                  </View>
                );
              })()
            )}
          </View>

          {/* Preferences list */}
          <Text style={styles.sectionCardTitle}>
            {t("account.sectionPreferences")}
          </Text>
          <View style={styles.listCard}>
            {settingsRows.map((row, idx) => {
              const isLast = idx === settingsRows.length - 1;
              return (
                <View key={row.key}>
                  <Pressable
                    style={({ pressed }) => [
                      styles.listRow,
                      pressed && styles.pressed,
                    ]}
                    onPress={row.onPress}
                    accessibilityRole="button"
                    accessibilityLabel={row.label}
                  >
                    <View style={styles.listRowIconWrap}>
                      <Ionicons name={row.icon} size={18} color={emerald} />
                    </View>
                    <Text style={styles.listRowLabel} numberOfLines={1}>
                      {row.label}
                    </Text>
                    {row.value ? (
                      <Text style={styles.listRowValue} numberOfLines={1}>
                        {row.value}
                      </Text>
                    ) : null}
                    <Ionicons
                      name={isRTL ? "chevron-back" : "chevron-forward"}
                      size={18}
                      color={colors.muted}
                    />
                  </Pressable>
                  {isLast ? null : <View style={styles.listRowDivider} />}
                </View>
              );
            })}
          </View>

          {/* Sign out — single-row red action card */}
          {authUser?.email ? (
            <View style={styles.signOutCard}>
              <Pressable
                style={({ pressed }) => [
                  styles.signOutRow,
                  pressed && styles.pressed,
                ]}
                onPress={() => void handleSignOut()}
                disabled={authBusy}
                accessibilityRole="button"
                accessibilityLabel={t("account.authSignOut")}
              >
                <View style={styles.signOutIconWrap}>
                  <Ionicons name="log-out-outline" size={18} color={colors.destructive} />
                </View>
                <Text style={styles.signOutLabel}>
                  {authBusy ? t("account.authBusy") : t("account.authSignOut")}
                </Text>
              </Pressable>
            </View>
          ) : null}

          {/* Danger zone — kept at bottom for destructive actions. */}
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
                {t("account.clearLocalDataHint")}
              </Text>
              <AppButton
                variant="outline"
                fullWidth
                style={{
                  marginTop: 0,
                  marginBottom: 14,
                  borderColor: colors.destructive,
                  backgroundColor: "transparent",
                }}
                textStyle={[styles.btnText, { color: colors.destructive }]}
                label={
                  dangerBusy
                    ? t("account.authBusy")
                    : t("account.clearLocalData")
                }
                onPress={() => {
                  const performClear = async () => {
                    if (dangerBusy) return;
                    setDangerBusy(true);
                    try {
                      try {
                        await setCloudSyncUserEnabled(false);
                      } catch {
                        /* best-effort */
                      }
                      try {
                        if (isSyncConfigured()) {
                          await signOut();
                        }
                      } catch {
                        /* best-effort */
                      }
                      // Reuse the same boot-time wipe path as delete-account
                      // — it runs on a clean handle BEFORE SQLite reopens,
                      // avoiding "database is locked" races. We just don't
                      // call deleteRemoteAccountData first, so the cloud
                      // copy stays intact.
                      await markPendingAccountDeletion();
                      if (Platform.OS === "web") {
                        if (typeof window !== "undefined") window.location.reload();
                      } else {
                        try {
                          const { reloadAppAsync } = await import("expo");
                          await reloadAppAsync("local-data-cleared");
                        } catch {
                          Alert.alert(
                            t("account.deleteAccountDoneTitle"),
                            t("account.deleteAccountDoneBody"),
                          );
                        }
                      }
                    } catch (e) {
                      Alert.alert(
                        t("account.authErrorTitle"),
                        e instanceof Error
                          ? e.message
                          : t("account.exportFailedBody"),
                      );
                    } finally {
                      setDangerBusy(false);
                    }
                  };
                  if (Platform.OS === "web") {
                    if (
                      typeof window !== "undefined" &&
                      window.confirm(t("account.clearLocalDataConfirmBody"))
                    ) {
                      void performClear();
                    }
                    return;
                  }
                  Alert.alert(
                    t("account.clearLocalDataConfirmTitle"),
                    t("account.clearLocalDataConfirmBody"),
                    [
                      { text: t("account.cancel"), style: "cancel" },
                      {
                        text: t("account.clearLocalDataConfirmCta"),
                        style: "destructive",
                        onPress: () => void performClear(),
                      },
                    ],
                  );
                }}
                disabled={dangerBusy}
                accessibilityLabel={t("account.clearLocalData")}
              />
              <Text style={[styles.helper, { marginBottom: 12 }]}>
                {t("account.deleteAccountHint")}
              </Text>
              <AppButton
                variant="outline"
                fullWidth
                style={{
                  marginTop: 0,
                  borderColor: colors.destructive,
                  backgroundColor: "transparent",
                }}
                textStyle={[styles.btnText, { color: colors.destructive }]}
                label={dangerBusy ? t("account.authBusy") : t("account.deleteAccount")}
                onPress={() => {
                  setDangerConfirmText("");
                  setDangerConfirmOpen(true);
                }}
                disabled={dangerBusy}
                accessibilityLabel={t("account.deleteAccount")}
              />
              {__DEV__ ? (
                /* Sentry diagnostic. Wrapped in __DEV__ so the button is
                 * stripped in production bundles. Reports back exactly
                 * what's in the bundle (DSN presence, SDK init state) so
                 * "events don't show up" issues can be pinned to the
                 * right layer (Metro cache, native build, network). */
                <AppButton
                  variant="outline"
                  fullWidth
                  style={{
                    marginTop: 12,
                    borderColor: colors.muted,
                    backgroundColor: "transparent",
                  }}
                  textStyle={[styles.btnText, { color: colors.muted }]}
                  label="Trigger Sentry test events"
                  onPress={() => {
                    const stamp = new Date().toISOString();
                    const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
                    const dsnPresent = !!dsn && dsn.length > 0;
                    const sdkLoaded = typeof SentrySdk.captureException === "function";
                    const client = sdkLoaded ? SentrySdk.getClient?.() : null;
                    const clientReady = !!client;

                    // Path A — direct SDK call. If this lands in Sentry,
                    // the transport works. If it doesn't, the SDK isn't
                    // really initialized.
                    let sdkReturn: unknown = "skipped";
                    if (sdkLoaded) {
                      try {
                        sdkReturn = SentrySdk.captureException(
                          new Error(`Tally Sentry direct — ${stamp}`),
                        );
                      } catch (e) {
                        sdkReturn = `threw: ${e instanceof Error ? e.message : String(e)}`;
                      }
                    }

                    // Path B — through our wrapper (only fires if
                    // initSentry() succeeded earlier).
                    captureError(
                      new Error(`Tally Sentry wrapped — ${stamp}`),
                    );

                    // Path C — async throw, escapes the synthetic event
                    // boundary and reaches the global error handler.
                    setTimeout(() => {
                      throw new Error(`Tally Sentry async — ${stamp}`);
                    }, 0);

                    Alert.alert(
                      "Sentry diagnostic",
                      [
                        `DSN in bundle: ${dsnPresent ? "yes" : "NO — restart Metro with --clear"}`,
                        `SDK loaded: ${sdkLoaded ? "yes" : "NO — run npm install + pod install + rebuild"}`,
                        `SDK client ready: ${clientReady ? "yes" : "NO — Sentry.init didn't complete"}`,
                        `Direct send: ${typeof sdkReturn === "string" ? sdkReturn : "fired (id " + String(sdkReturn) + ")"}`,
                        "",
                        "Three events were attempted. Check Sentry in ~30s.",
                      ].join("\n"),
                    );
                  }}
                  accessibilityLabel="Trigger Sentry test events"
                />
              ) : null}
            </View>
          </View>
        </View>
      </ScrollView>

      {/* —— Help & support modal (existing feedback form) —— */}
      <Modal
        visible={helpOpen}
        animationType="slide"
        onRequestClose={() => setHelpOpen(false)}
      >
        <KeyboardAvoidingView
          style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setHelpOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.rowHelpSupport")}</Text>
            <Pressable onPress={() => setHelpOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* —— About Tally modal —— */}
      <Modal
        visible={aboutOpen}
        animationType="slide"
        onRequestClose={() => setAboutOpen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setAboutOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.aboutTitle")}</Text>
            <Pressable onPress={() => setAboutOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
          </View>
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <View
              style={{
                width: 72,
                height: 72,
                borderRadius: 18,
                backgroundColor: colors.owedSoft,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16,
              }}
            >
              <Ionicons name="wallet-outline" size={36} color={emerald} />
            </View>
            <Text
              style={{
                fontSize: 22,
                fontWeight: "800",
                color: colors.text,
                marginBottom: 8,
              }}
            >
              Tally
            </Text>
            <Text style={[styles.helper, { textAlign: "center", marginBottom: 8 }]}>
              {t("account.aboutTagline")}
            </Text>
            <Text style={[styles.helper, { textAlign: "center", marginBottom: 0 }]}>
              {t("account.aboutVersion", { version: "1.0.0" })}
            </Text>
          </View>
        </View>
      </Modal>

      {/* —— Data & export modal (placeholder) —— */}
      <Modal
        visible={dataExportOpen}
        animationType="slide"
        onRequestClose={() => setDataExportOpen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setDataExportOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.dataExportTitle")}</Text>
            <Pressable onPress={() => setDataExportOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
          </View>
          <Text style={[styles.helper, { marginTop: 12 }]}>
            {t("account.dataExportBody")}
          </Text>
          <Text
            style={[
              styles.helper,
              { marginTop: 12, fontStyle: "italic" },
            ]}
          >
            {t("account.dataExportComingSoon")}
          </Text>
        </View>
      </Modal>

      <Modal
        visible={dangerConfirmOpen}
        animationType="slide"
        onRequestClose={() => setDangerConfirmOpen(false)}
      >
        <KeyboardAvoidingView
          style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
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
                  try {
                    await setCloudSyncUserEnabled(false);
                  } catch {
                    /* best-effort */
                  }
                  if (authUser?.id) {
                    try {
                      // Soft delete: anonymizes the cloud user row and sets
                      // `deleted_at`. Co-owned data (groups, expenses,
                      // settlements) is preserved. The auth.users row stays
                      // intact for the grace window so the user can sign
                      // back in and call `restoreSoftDeletedAccount` to
                      // recover their account.
                      await softDeleteRemoteAccount(authUser.id);
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
          style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
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
        visible={appearancePickerOpen}
        animationType="slide"
        onRequestClose={() => setAppearancePickerOpen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setAppearancePickerOpen(false)} hitSlop={12}>
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.appearance")}</Text>
            <Pressable onPress={() => setAppearancePickerOpen(false)} hitSlop={12}>
              <Text style={styles.modalDone}>{t("account.currencyModalDone")}</Text>
            </Pressable>
          </View>
          <FlatList
            style={styles.currencyFlatList}
            data={appearanceOptions}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.row,
                  item.code === appearance && styles.rowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void setAppearance(item.code);
                  setAppearancePickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === appearance }}
              >
                <Text style={styles.rowLabel}>{item.label}</Text>
                {item.code === appearance ? (
                  <Ionicons name="checkmark" size={20} color={emerald} />
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>

      <Modal
        visible={languagePickerOpen}
        animationType="slide"
        onRequestClose={() => setLanguagePickerOpen(false)}
      >
        <View style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}>
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
