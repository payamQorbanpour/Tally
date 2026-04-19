import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from "react-native";
import { Text } from "../ui/AppText";
import { TextInput } from "../ui/AppTextInput";
import { SegmentedControl } from "../components/SegmentedControl";
import { CURRENCY_OPTIONS, currencyLabel, isValidCurrencyCode } from "../data/currencies";
import { isValidOptionalEmail } from "../data/emailValidation";
import { isSupabaseSyncConfigured } from "../sync/config";
import {
  getLocalUserProfile,
  getSetting,
  setSetting,
  SETTINGS_KEYS,
  updateLocalUserProfile,
} from "../data/tallyRepo";
import { useSyncStatusDisplay } from "../components/SyncStatusPill";
import { buildTallyExportPayload, stringifyTallyExport } from "../core/exportTallyData";
import { shareOrDownloadTallyExport } from "../core/shareTallyExport";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
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
    kicker: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 8,
      width: "100%",
      ...te,
    },
    title: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 32,
      width: "100%",
      lineHeight: 34,
      ...te,
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
    primaryBtn: {
      alignSelf: "flex-end",
      marginTop: 20,
      backgroundColor: emerald,
      paddingVertical: 13,
      paddingHorizontal: 28,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
      minWidth: 160,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 20,
      textAlign: "center",
      letterSpacing: 0.3,
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    outlineBtn: {
      alignSelf: "stretch",
      width: "100%",
      marginTop: 12,
      backgroundColor: colors.inputSurface,
      borderWidth: 1.5,
      borderColor: colors.border,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    outlineBtnText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "700",
      lineHeight: 20,
      textAlign: "center",
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
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 20,
    },
    modalTitle: { fontSize: 22, fontWeight: "800", color: colors.text },
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
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [focusField, setFocusField] = useState<"name" | "email" | "authPassword" | null>(
    null,
  );

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
      await shareOrDownloadTallyExport(json, `tally-export-${stamp}.json`);
    } catch (e) {
      Alert.alert(
        t("account.exportFailedTitle"),
        e instanceof Error ? e.message : t("account.exportFailedBody"),
      );
    } finally {
      setExportBusy(false);
    }
  };

  const canSaveProfile =
    name.trim().length > 0 && isValidOptionalEmail(email.trim());
  const profileEmailInvalid = !isValidOptionalEmail(email.trim());

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
          <Text style={styles.kicker}>{t("account.kicker")}</Text>
          <Text style={styles.title}>{t("account.title")}</Text>

          {/* Account & sync */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="person-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.sectionAccountSync")}</Text>
            </View>

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
              onBlur={() => setFocusField(null)}
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
            <Pressable
              style={({ pressed }) => [
                styles.primaryBtn,
                (!canSaveProfile || profileBusy) && styles.disabled,
                pressed && canSaveProfile && !profileBusy && styles.pressed,
              ]}
              onPress={() => void saveProfile()}
              disabled={!canSaveProfile || profileBusy}
            >
              <Text style={styles.primaryBtnText}>
                {profileBusy ? t("account.saving") : profileSaved ? "✓ " + t("account.saveProfile") : t("account.saveProfile")}
              </Text>
            </Pressable>

            {isSupabaseSyncConfigured() ? (
              <View style={{ marginTop: 20 }}>
                {authSessionLoading ? (
                  <Text style={styles.helper}>{t("account.authBusy")}</Text>
                ) : authUser?.email ? (
                  <>
                    <Text style={[styles.helper, { marginBottom: 14 }]}>
                      {t("account.authSignedInAs", { email: authUser.email })}
                    </Text>
                    <Pressable
                      style={(s) => {
                        const hovered = "hovered" in s && s.hovered ? s.hovered : false;
                        return [
                          styles.outlineBtn,
                          authBusy && styles.disabled,
                          (s.pressed || (Platform.OS === "web" && hovered)) &&
                            !authBusy &&
                            styles.pressed,
                        ];
                      }}
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
                      accessibilityRole="button"
                      accessibilityLabel={t("account.authSignOut")}
                    >
                      <Text style={styles.outlineBtnText}>
                        {authBusy ? t("account.authBusy") : t("account.authSignOut")}
                      </Text>
                    </Pressable>
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
                      />
                      <Pressable
                        style={styles.passwordToggleBtn}
                        onPress={() => setAuthPasswordVisible(!authPasswordVisible)}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={authPasswordVisible ? t("account.hidePassword") : t("account.showPassword")}
                      >
                        <Ionicons
                          name={authPasswordVisible ? "eye-off-outline" : "eye-outline"}
                          size={20}
                          color={colors.muted}
                        />
                      </Pressable>
                    </View>
                    <Pressable
                      style={({ pressed }) => [
                        styles.primaryBtn,
                        { alignSelf: "stretch", width: "100%" },
                        authBusy && styles.disabled,
                        pressed && !authBusy && styles.pressed,
                      ]}
                      onPress={() => {
                        void (async () => {
                          const em = email.trim();
                          if (!isValidOptionalEmail(em) || !em) {
                            Alert.alert(
                              t("account.invalidEmailTitle"),
                              t("account.invalidEmail"),
                            );
                            return;
                          }
                          if (authPassword.length < 6) {
                            Alert.alert(
                              t("account.authErrorTitle"),
                              t("account.authPasswordTooShort"),
                            );
                            return;
                          }
                          setAuthBusy(true);
                          try {
                            const { error } = await signInWithPassword(em, authPassword);
                            if (error) {
                              Alert.alert(t("account.authErrorTitle"), error.message);
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
                      accessibilityRole="button"
                      accessibilityLabel={t("account.authSignIn")}
                    >
                      <Text style={styles.primaryBtnText}>
                        {authBusy ? t("account.authBusy") : t("account.authSignIn")}
                      </Text>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [
                        styles.outlineBtn,
                        authBusy && styles.disabled,
                        pressed && !authBusy && styles.pressed,
                      ]}
                      onPress={() => {
                        void (async () => {
                          const em = email.trim();
                          if (!isValidOptionalEmail(em) || !em) {
                            Alert.alert(
                              t("account.invalidEmailTitle"),
                              t("account.invalidEmail"),
                            );
                            return;
                          }
                          if (authPassword.length < 6) {
                            Alert.alert(
                              t("account.authErrorTitle"),
                              t("account.authPasswordTooShort"),
                            );
                            return;
                          }
                          setAuthBusy(true);
                          try {
                            const { error } = await signUpWithPassword(em, authPassword);
                            if (error) {
                              Alert.alert(t("account.authErrorTitle"), error.message);
                              return;
                            }
                            setAuthPassword("");
                            Alert.alert(
                              t("account.authTitle"),
                              t("account.authCheckEmail"),
                            );
                          } finally {
                            setAuthBusy(false);
                          }
                        })();
                      }}
                      disabled={authBusy}
                      accessibilityRole="button"
                      accessibilityLabel={t("account.authSignUp")}
                    >
                      <Text style={styles.outlineBtnText}>
                        {authBusy ? t("account.authBusy") : t("account.authSignUp")}
                      </Text>
                    </Pressable>
                  </>
                )}
              </View>
            ) : null}

            {cloudSyncDetailHint ? (
              <Text style={[styles.helper, { marginTop: 12, marginBottom: 12 }]}>{cloudSyncDetailHint}</Text>
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
              <Switch
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
                trackColor={{ false: colors.border, true: emerald + "99" }}
                thumbColor={cloudSyncUserEnabled ? emerald : "#f4f3f4"}
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
          </View>

          {/* Appearance */}
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <Ionicons name="color-palette-outline" size={22} color={emerald} />
              <Text style={styles.cardTitle}>{t("account.appearance")}</Text>
            </View>
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
            <Pressable
              style={({ pressed }) => [
                styles.outlineBtn,
                { marginTop: 0 },
                exportBusy && styles.disabled,
                pressed && !exportBusy && styles.pressed,
              ]}
              onPress={() => void runExport()}
              disabled={exportBusy}
              accessibilityRole="button"
              accessibilityLabel={t("account.exportButton")}
            >
              <Text style={styles.outlineBtnText}>
                {exportBusy ? t("account.exportExporting") : t("account.exportButton")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>

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
    </KeyboardAvoidingView>
  );
}
