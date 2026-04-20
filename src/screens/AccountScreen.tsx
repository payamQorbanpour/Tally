import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Image,
  InputAccessoryView,
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
import { TextInput } from "../ui/AppTextInput";
import { KeyboardDismissButton } from "../ui/KeyboardDismissButton";
import { SegmentedControl } from "../components/SegmentedControl";
import { CURRENCY_OPTIONS, currencyLabel, isValidCurrencyCode } from "../data/currencies";
import { isValidOptionalEmail } from "../data/emailValidation";
import { isSupabaseSyncConfigured } from "../sync/config";
import {
  getLocalUserProfile,
  createUserFeedback,
  getSetting,
  setSetting,
  SETTINGS_KEYS,
  updateLocalUserProfile,
} from "../data/tallyRepo";
import { useSyncStatusDisplay } from "../components/SyncStatusPill";
import { buildTallyExportPayload, stringifyTallyExport } from "../core/exportTallyData";
import { buildTallyExportCsv } from "../core/exportTallyCsv";
import { shareTextFile } from "../core/shareExportFile";
import { clearAllAppStorage } from "../core/clearAppStorage";
import {
  deletePersistedProfilePhotoFile,
  pickProfileAvatar,
} from "../core/pickProfileAvatar";
import {
  AUTH_PASSWORD_REQUEST_TIMEOUT_MS,
  TALLY_AUTH_REQUEST_TIMED_OUT,
  useSupabaseSession,
} from "../auth/SupabaseSessionContext";
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import type { AppearancePref } from "../theme/ThemeContext";
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
  } = useTallyData();
  const { colors, appearance, setAppearance, resolvedScheme } = useTheme();
  const { locale, setLocale, t, isRTL } = useLocale();
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
  const [profileBusy, setProfileBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportCsvBusy, setExportCsvBusy] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [dangerBusy, setDangerBusy] = useState(false);
  const [dangerConfirmOpen, setDangerConfirmOpen] = useState(false);
  const [dangerConfirmText, setDangerConfirmText] = useState("");
  const [focusField, setFocusField] = useState<"name" | "email" | "authPassword" | null>(
    null,
  );
  const keyboardAccessoryId = "accountKeyboardAccessory";
  const [initialProfile, setInitialProfile] = useState<{ name: string; email: string }>({
    name: "",
    email: "",
  });

  const {
    user: authUser,
    loading: authSessionLoading,
    signInWithPassword,
    signUpWithPassword,
    signOut,
  } = useSupabaseSession();

  const load = useCallback(async () => {
    const p = await getLocalUserProfile(db);
    setName(p.name);
    setEmail(p.email ?? "");
    setAvatarUri(p.avatarUri);
    setInitialProfile({ name: p.name ?? "", email: (p.email ?? "").trim() });
    const cur = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (cur && isValidCurrencyCode(cur)) setDefaultCurrency(cur);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  useEffect(() => {
    void load();
  }, [load, locale]);

  const nameRef = useRef(name);
  const nameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameSaveToken = useRef(0);
  nameRef.current = name;

  const persistDisplayName = useCallback(async () => {
    const token = ++nameSaveToken.current;
    const n = nameRef.current;
    try {
      await updateLocalUserProfile(db, { name: n });
      await revalidateLocalUserForSync();
      if (token !== nameSaveToken.current) return;
      const p = await getLocalUserProfile(db);
      if (token !== nameSaveToken.current) return;
      setName(p.name);
      setInitialProfile((prev) => ({ name: p.name, email: prev.email }));
    } catch (e) {
      Alert.alert(
        t("account.authErrorTitle"),
        e instanceof Error ? e.message : t("account.exportFailedBody"),
      );
    }
  }, [db, revalidateLocalUserForSync, t]);

  useEffect(() => {
    if (nameDebounceRef.current) {
      clearTimeout(nameDebounceRef.current);
      nameDebounceRef.current = null;
    }
    if (name.trim() === initialProfile.name.trim()) {
      return;
    }
    nameDebounceRef.current = setTimeout(() => {
      nameDebounceRef.current = null;
      void persistDisplayName();
    }, 500);
    return () => {
      if (nameDebounceRef.current) {
        clearTimeout(nameDebounceRef.current);
        nameDebounceRef.current = null;
      }
    };
  }, [name, initialProfile.name, persistDisplayName]);

  const persistDisplayNameRef = useRef(persistDisplayName);
  persistDisplayNameRef.current = persistDisplayName;
  const initialNameForSaveRef = useRef(initialProfile.name);
  useEffect(() => {
    initialNameForSaveRef.current = initialProfile.name;
  }, [initialProfile.name]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (nameDebounceRef.current) {
          clearTimeout(nameDebounceRef.current);
          nameDebounceRef.current = null;
        }
        if (nameRef.current.trim() === initialNameForSaveRef.current.trim()) return;
        void persistDisplayNameRef.current();
      };
    }, []),
  );

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return [...CURRENCY_OPTIONS];
    return CURRENCY_OPTIONS.filter(
      (x) =>
        x.code.toLowerCase().includes(q) ||
        x.label.toLowerCase().includes(q),
    );
  }, [currencySearch]);

  const removeProfilePhoto = useCallback(async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      await deletePersistedProfilePhotoFile();
      await updateLocalUserProfile(db, { avatarUri: null });
      await revalidateLocalUserForSync();
      await load();
    } finally {
      setPhotoBusy(false);
    }
  }, [db, load, photoBusy, revalidateLocalUserForSync]);

  const chooseProfilePhoto = useCallback(async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const r = await pickProfileAvatar("library");
      if (r.kind === "permissionDenied") {
        Alert.alert(
          r.reason === "camera"
            ? t("account.photoCameraPermissionTitle")
            : t("account.photoPermissionTitle"),
          r.reason === "camera"
            ? t("account.photoCameraPermissionBody")
            : t("account.photoPermissionBody"),
        );
        return;
      }
      if (r.kind === "cancelled") return;
      await updateLocalUserProfile(db, { avatarUri: r.uri });
      await revalidateLocalUserForSync();
      await load();
    } finally {
      setPhotoBusy(false);
    }
  }, [db, load, photoBusy, revalidateLocalUserForSync, t]);

  const takeProfilePhoto = useCallback(async () => {
    if (photoBusy) return;
    setPhotoBusy(true);
    try {
      const r = await pickProfileAvatar("camera");
      if (r.kind === "permissionDenied") {
        Alert.alert(
          r.reason === "camera"
            ? t("account.photoCameraPermissionTitle")
            : t("account.photoPermissionTitle"),
          r.reason === "camera"
            ? t("account.photoCameraPermissionBody")
            : t("account.photoPermissionBody"),
        );
        return;
      }
      if (r.kind === "cancelled") return;
      await updateLocalUserProfile(db, { avatarUri: r.uri });
      await revalidateLocalUserForSync();
      await load();
    } finally {
      setPhotoBusy(false);
    }
  }, [db, load, photoBusy, revalidateLocalUserForSync, t]);

  const openProfilePhotoMenu = useCallback(() => {
    if (photoBusy || profileBusy) return;
    const buttons: {
      text: string;
      style?: "destructive" | "cancel";
      onPress?: () => void;
    }[] = [
      { text: t("account.photoChoose"), onPress: () => void chooseProfilePhoto() },
    ];
    if (Platform.OS !== "web") {
      buttons.push({
        text: t("account.photoTakePhoto"),
        onPress: () => void takeProfilePhoto(),
      });
    }
    if (avatarUri) {
      buttons.push({
        text: t("account.photoRemove"),
        style: "destructive",
        onPress: () => void removeProfilePhoto(),
      });
    }
    buttons.push({ text: t("friends.cancel"), style: "cancel" });
    Alert.alert(t("account.photoMenuTitle"), t("account.photoChangeHint"), buttons);
  }, [
    avatarUri,
    chooseProfilePhoto,
    photoBusy,
    profileBusy,
    removeProfilePhoto,
    takeProfilePhoto,
    t,
  ]);

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
      await load();
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } finally {
      setProfileBusy(false);
    }
  };

  const pickDefaultCurrency = async (code: string) => {
    setDefaultCurrency(code);
    setCurrencyPickerOpen(false);
    await setSetting(db, SETTINGS_KEYS.defaultCurrency, code);
  };

  const runExport = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      const payload = await buildTallyExportPayload(db);
      const json = stringifyTallyExport(payload);
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await shareTextFile(json, `tally-export-${stamp}.json`, "application/json", "public.json");
    } catch (e) {
      Alert.alert(
        t("account.exportFailedTitle"),
        e instanceof Error ? e.message : t("account.exportFailedBody"),
      );
    } finally {
      setExportBusy(false);
    }
  };

  const runExportCsv = async () => {
    if (exportCsvBusy) return;
    setExportCsvBusy(true);
    try {
      const payload = await buildTallyExportPayload(db);
      const csv = buildTallyExportCsv(payload);
      const now = new Date();
      const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      await shareTextFile(csv, `tally-export-${stamp}.csv`, "text/csv", "public.comma-separated-values-text");
    } catch (e) {
      Alert.alert(
        t("account.exportFailedTitle"),
        e instanceof Error ? e.message : t("account.exportFailedBody"),
      );
    } finally {
      setExportCsvBusy(false);
    }
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

  const canSaveProfile = isValidOptionalEmail(email.trim());
  const profileEmailInvalid = !isValidOptionalEmail(email.trim());
  const isProfileDirty = email.trim() !== initialProfile.email.trim();

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
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
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
                onPress={() => openProfilePhotoMenu()}
                disabled={photoBusy || profileBusy}
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
                    opacity: pressed ? 0.88 : photoBusy || profileBusy ? 0.55 : 1,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={t("account.avatarA11y")}
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
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: "700",
                    color: colors.text,
                    textAlign: isRTL ? "right" : "left",
                  }}
                  numberOfLines={1}
                >
                  {name.trim() || t("account.displayName")}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: colors.muted,
                    marginTop: 2,
                    textAlign: isRTL ? "right" : "left",
                  }}
                  numberOfLines={1}
                >
                  {email.trim() || t("account.emailOptional")}
                </Text>
              </View>
            </View>
            {!avatarUri ? (
              <Text
                style={{
                  fontSize: 12,
                  color: colors.muted,
                  marginTop: -8,
                  marginBottom: 10,
                  textAlign: isRTL ? "right" : "left",
                }}
              >
                {t("account.photoTapToAdd")}
              </Text>
            ) : null}

            <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>
              {t("account.displayName")}
            </Text>
            <TextInput
              style={[styles.input, focusField === "name" && styles.inputFocused]}
              value={name}
              onChangeText={setName}
              placeholder={t("account.displayNamePlaceholder")}
              placeholderTextColor={colors.muted}
              autoCapitalize="words"
              editable={!profileBusy}
              onFocus={() => setFocusField("name")}
              onBlur={() => {
                setFocusField(null);
                if (nameDebounceRef.current) {
                  clearTimeout(nameDebounceRef.current);
                  nameDebounceRef.current = null;
                }
                if (name.trim() === initialProfile.name.trim()) return;
                void persistDisplayName();
              }}
              inputAccessoryViewID={keyboardAccessoryId}
            />
            <Text style={styles.fieldLabel}>{t("account.emailOptional")}</Text>
            <TextInput
              style={[
                styles.input,
                profileEmailInvalid && styles.inputInvalid,
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
              editable={!profileBusy}
              onFocus={() => setFocusField("email")}
              onBlur={() => setFocusField(null)}
              inputAccessoryViewID={keyboardAccessoryId}
            />
            {profileEmailInvalid ? (
              <Text
                style={styles.fieldError}
                accessibilityRole="alert"
                accessibilityLiveRegion="polite"
              >
                {t("account.invalidEmail")}
              </Text>
            ) : null}
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

          {/* Cloud sync & backup: sign-in + toggle + status */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="cloud-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.sectionSync")}</Text>
            </View>

            {isSupabaseSyncConfigured() && !authSessionLoading && !authUser?.email ? (
              <Text style={[styles.helper, { marginBottom: 14 }]}>
                {t("account.signInBanner")}
              </Text>
            ) : null}

            {isSupabaseSyncConfigured() ? (
              <>
                {authSessionLoading ? (
                  <Text style={[styles.helper, { marginBottom: 14 }]}>{t("account.authBusy")}</Text>
                ) : authUser?.email ? (
                  <>
                    <Text style={[styles.helper, { marginBottom: 14 }]}>
                      {t("account.authSignedInAs", { email: authUser.email })}
                    </Text>
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
                    <View style={styles.sectionDivider} />
                  </>
                ) : (
                  <>
                    <Text style={[styles.authFieldLabel, styles.fieldLabelFirst]}>
                      {t("account.authPasswordLabel")}
                    </Text>
                    <Text style={[styles.helper, { marginBottom: 12 }]}>
                      {t("account.authUsesProfileEmailHint")}
                    </Text>
                    <View style={styles.passwordInputWrapper}>
                      <TextInput
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
                        onFocus={() => setFocusField("authPassword")}
                        onBlur={() => setFocusField(null)}
                        inputAccessoryViewID={keyboardAccessoryId}
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
                      label={authBusy ? t("account.authBusy") : t("account.authSignIn")}
                      onPress={() => {
                        void (async () => {
                          const em = email.trim();
                          if (!isValidOptionalEmail(em) || !em) {
                            Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
                            return;
                          }
                          if (authPassword.length < 6) {
                            Alert.alert(t("account.authErrorTitle"), t("account.authPasswordTooShort"));
                            return;
                          }
                          setAuthBusy(true);
                          try {
                            const { error } = await signInWithPassword(em, authPassword);
                            if (error) {
                              const body =
                                error.message === TALLY_AUTH_REQUEST_TIMED_OUT
                                  ? t("account.authRequestTimeout", {
                                      seconds: String(
                                        Math.max(
                                          1,
                                          Math.floor(
                                            AUTH_PASSWORD_REQUEST_TIMEOUT_MS / 1000,
                                          ),
                                        ),
                                      ),
                                    })
                                  : error.message;
                              Alert.alert(t("account.authErrorTitle"), body);
                              return;
                            }
                            setAuthPassword("");
                            await revalidateLocalUserForSync();
                            await load();
                          } finally {
                            setAuthBusy(false);
                          }
                        })();
                      }}
                      disabled={authBusy}
                      accessibilityLabel={t("account.authSignIn")}
                    />
                    <AppButton
                      variant="secondary"
                      fullWidth
                      style={styles.btnOutlineStack}
                      textStyle={styles.btnText}
                      label={authBusy ? t("account.authBusy") : t("account.authSignUp")}
                      onPress={() => {
                        void (async () => {
                          const em = email.trim();
                          if (!isValidOptionalEmail(em) || !em) {
                            Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
                            return;
                          }
                          if (authPassword.length < 6) {
                            Alert.alert(t("account.authErrorTitle"), t("account.authPasswordTooShort"));
                            return;
                          }
                          setAuthBusy(true);
                          try {
                            const { error } = await signUpWithPassword(em, authPassword);
                            if (error) {
                              const body =
                                error.message === TALLY_AUTH_REQUEST_TIMED_OUT
                                  ? t("account.authRequestTimeout", {
                                      seconds: String(
                                        Math.max(
                                          1,
                                          Math.floor(
                                            AUTH_PASSWORD_REQUEST_TIMEOUT_MS / 1000,
                                          ),
                                        ),
                                      ),
                                    })
                                  : error.message;
                              Alert.alert(t("account.authErrorTitle"), body);
                              return;
                            }
                            setAuthPassword("");
                            Alert.alert(t("account.authTitle"), t("account.authCheckEmail"));
                          } finally {
                            setAuthBusy(false);
                          }
                        })();
                      }}
                      disabled={authBusy}
                      accessibilityLabel={t("account.authSignUp")}
                    />
                    <View style={styles.sectionDivider} />
                  </>
                )}
              </>
            ) : null}

            {cloudSyncDetailHint ? (
              <Text style={[styles.helper, { marginTop: 0, marginBottom: 12 }]}>
                {cloudSyncDetailHint}
              </Text>
            ) : null}

            <View style={styles.switchRow}>
              <View style={styles.switchTextWrap}>
                <View style={styles.syncLabelRow}>
                  <View
                    style={[
                      styles.syncDot,
                      cloudSyncUserEnabled ? styles.syncDotOn : styles.syncDotOff,
                    ]}
                  />
                  <Text
                    style={[
                      styles.fieldLabel,
                      { marginTop: 0, fontSize: 15, color: colors.text, fontWeight: "600" },
                    ]}
                  >
                    {t("account.cloudSyncRowLabel")}
                  </Text>
                </View>
              </View>
              <AppSwitch
                value={cloudSyncUserEnabled}
                onValueChange={(v) => {
                  void (async () => {
                    if (v) {
                      const fromForm = email.trim();
                      if (!isValidOptionalEmail(fromForm)) {
                        Alert.alert(t("account.invalidEmailTitle"), t("account.invalidEmail"));
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
              style={styles.syncStatusRow}
              accessible
              accessibilityRole="text"
              accessibilityLabel={syncStatus.text}
            >
              <Ionicons
                name={syncStatus.icon}
                size={18}
                color={colors.muted}
                importantForAccessibility="no"
              />
              <Text style={styles.syncStatusText}>{syncStatus.text}</Text>
            </View>
            {cloudSyncCanBeUsed && !cloudSyncBuildDisabled && !localUserHasProfileEmail ? (
              <Text style={[styles.helper, { marginTop: 12, marginBottom: 0 }]}>
                {t("account.cloudSyncEmailRequired")}
              </Text>
            ) : null}
          </View>

          {/* Preferences: language + currency */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="settings-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.sectionPreferences")}</Text>
            </View>
            <Text style={[styles.fieldLabel, styles.fieldLabelFirst]}>{t("account.language")}</Text>
            <SegmentedControl
              options={languageOptions.map(({ code, label }) => ({
                value: code,
                label,
              }))}
              value={locale}
              onChange={(code) => void setLocale(code)}
              activeBg={emerald}
              activeTextColor="#fff"
              inactiveTextColor={colors.muted}
              trackBg={
                resolvedScheme === "dark"
                  ? "rgba(255,255,255,0.06)"
                  : "rgba(15,23,42,0.06)"
              }
            />
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

          {/* Data & export — separated from sync */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="archive-outline" size={20} color={colors.muted} />
              <Text style={styles.cardTitle}>{t("account.sectionData")}</Text>
            </View>
            <AppButton
              variant="secondary"
              fullWidth
              style={{ marginTop: 0 }}
              textStyle={styles.btnText}
              label={exportBusy ? t("account.exportExporting") : t("account.exportButton")}
              onPress={() => void runExport()}
              disabled={exportBusy}
              accessibilityLabel={t("account.exportButton")}
            />

            <AppButton
              variant="secondary"
              fullWidth
              style={styles.btnOutlineStack}
              textStyle={styles.btnText}
              label={exportCsvBusy ? t("account.exportExporting") : t("account.exportCsvButton")}
              onPress={() => void runExportCsv()}
              disabled={exportCsvBusy}
              accessibilityLabel={t("account.exportCsvButton")}
            />

            <View style={styles.sectionDivider} />

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
              <Text style={[styles.fieldLabel, styles.fieldLabelFirst, { marginBottom: 6 }]}>
                {t("account.dangerZone")}
              </Text>
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
              inputAccessoryViewID={keyboardAccessoryId}
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
              inputAccessoryViewID={keyboardAccessoryId}
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
            inputAccessoryViewID={keyboardAccessoryId}
          />
          <KeyboardDismissButton colors={colors} isRTL={isRTL} style={{ marginBottom: 16 }} />
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
                    if (isSupabaseSyncConfigured()) {
                      await signOut();
                    }
                  } catch {
                    // best-effort
                  }
                  await clearAllAppStorage();
                  setDangerConfirmOpen(false);
                  Alert.alert(t("account.deleteAccountDoneTitle"), t("account.deleteAccountDoneBody"));
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
            inputAccessoryViewID={keyboardAccessoryId}
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

      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={keyboardAccessoryId}>
          <KeyboardDismissButton colors={colors} isRTL={isRTL} />
        </InputAccessoryView>
      ) : null}
    </KeyboardAvoidingView>
  );
}
