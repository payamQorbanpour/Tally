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
  Text,
  TextInput,
  View,
} from "react-native";
import { CURRENCY_OPTIONS, currencyLabel, isValidCurrencyCode } from "../data/currencies";
import { isValidOptionalEmail } from "../data/emailValidation";
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
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import type { AppearancePref } from "../theme/ThemeContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

function buildAccountStyles(colors: ThemeColors, isRTL: boolean) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    scroll: { flex: 1 },
    scrollContent: { padding: 24, paddingBottom: 48, alignItems: isRTL ? "flex-end" : "flex-start" },
    kicker: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.6,
      marginBottom: 4,
      width: "100%",
      ...te,
    },
    title: {
      fontSize: 22,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 8,
      width: "100%",
      ...te,
    },
    body: {
      fontSize: 16,
      color: colors.muted,
      lineHeight: 24,
      marginBottom: 28,
      width: "100%",
      ...te,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 10,
      width: "100%",
      ...te,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
      marginBottom: 6,
      marginTop: 12,
    },
    input: {
      width: "100%",
      maxWidth: "100%",
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      backgroundColor: colors.surface,
      color: colors.text,
    },
    inputInvalid: {
      borderColor: colors.destructive,
      borderWidth: 1,
    },
    fieldError: {
      fontSize: 13,
      color: colors.destructive,
      marginTop: 6,
      lineHeight: 18,
      width: "100%",
      ...te,
    },
    primaryBtn: {
      alignSelf: "stretch",
      width: "100%",
      maxWidth: "100%",
      marginTop: 16,
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    primaryBtnText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 22,
      textAlign: "center",
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    outlineBtn: {
      alignSelf: "stretch",
      width: "100%",
      maxWidth: "100%",
      marginTop: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 48,
    },
    outlineBtnText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: "600",
      lineHeight: 22,
      textAlign: "center",
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.88 },
    hint: { fontSize: 13, color: colors.muted, marginTop: 8, lineHeight: 20 },
    pickerField: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    pickerChevron: { fontSize: 15, color: colors.muted, fontWeight: "600" },
    appearanceRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    appearanceChip: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    appearanceChipOn: {
      borderColor: colors.primary,
      backgroundColor: colors.owedSoft,
    },
    appearanceChipText: { fontSize: 14, fontWeight: "600", color: colors.text },
    appearanceChipTextOn: { color: colors.primary },
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
      marginBottom: 12,
    },
    modalTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
    modalDone: { fontSize: 17, color: colors.primary, fontWeight: "600" },
    row: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowSelected: { backgroundColor: colors.owedSoft },
    rowCode: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.text,
      width: 44,
      fontVariant: ["tabular-nums"],
    },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text },
    empty: { padding: 24, textAlign: "center", color: colors.muted, fontSize: 15 },
    currencyFlatList: { flex: 1 },
    pickerText: { flex: 1, fontSize: 16, color: colors.text },
    switchRow: {
      width: "100%",
      marginTop: 4,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    switchTextWrap: { flex: 1, ...te },
    syncStatusRow: {
      width: "100%",
      marginTop: 8,
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
    },
    syncStatusText: { flex: 1, fontSize: 13, color: colors.muted, lineHeight: 20, ...te },
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
  const { colors, appearance, setAppearance } = useTheme();
  const { locale, setLocale, t, isRTL } = useLocale();
  const styles = useMemo(() => buildAccountStyles(colors, isRTL), [colors, isRTL]);

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

  const cloudSyncDetailHint = useMemo(() => {
    if (cloudSyncBuildDisabled) return t("account.cloudSyncBuildDisabled");
    if (!cloudSyncCanBeUsed) return t("account.cloudSyncNotConfigured");
    return t("account.cloudSyncHint");
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
        <Text style={styles.kicker}>{t("account.kicker")}</Text>
        <Text style={styles.title}>{t("account.title")}</Text>
        <Text style={styles.body}>{t("account.body")}</Text>

        <Text style={[styles.sectionLabel, { marginTop: 8 }]}>
          {t("account.cloudSyncTitle")}
        </Text>
        <View style={styles.switchRow}>
          <View style={styles.switchTextWrap}>
            <Text
              style={[styles.fieldLabel, { marginTop: 0, marginBottom: 0, fontSize: 15 }]}
            >
              {t("account.cloudSyncRowLabel")}
            </Text>
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
            trackColor={{ false: colors.border, true: colors.primary + "80" }}
            thumbColor={cloudSyncUserEnabled ? colors.primary : "#f4f3f4"}
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
        <Text style={styles.hint}>{cloudSyncDetailHint}</Text>
        {cloudSyncCanBeUsed && !cloudSyncBuildDisabled && !localUserHasProfileEmail && (
          <Text style={styles.hint}>{t("account.cloudSyncEmailRequired")}</Text>
        )}

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>{t("account.exportTitle")}</Text>
        <Text style={styles.hint}>{t("account.exportHint")}</Text>
        <Pressable
          style={({ pressed }) => [
            styles.outlineBtn,
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

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>{t("account.language")}</Text>
        <Text style={styles.hint}>{t("account.languageHint")}</Text>
        <View style={styles.appearanceRow}>
          {languageOptions.map(({ code, label }) => (
            <Pressable
              key={code}
              style={[
                styles.appearanceChip,
                locale === code && styles.appearanceChipOn,
              ]}
              onPress={() => void setLocale(code)}
            >
              <Text
                style={[
                  styles.appearanceChipText,
                  locale === code && styles.appearanceChipTextOn,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
          {t("account.profile")}
        </Text>
        <Text style={styles.fieldLabel}>{t("account.displayName")}</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder={t("account.displayNamePlaceholder")}
          placeholderTextColor={colors.muted}
          autoCapitalize="words"
          editable={!profileBusy}
        />
        <Text style={styles.fieldLabel}>{t("account.emailOptional")}</Text>
        <TextInput
          style={[styles.input, profileEmailInvalid && styles.inputInvalid]}
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
            {profileBusy ? t("account.saving") : t("account.saveProfile")}
          </Text>
        </Pressable>
        <Text style={styles.hint}>{t("account.profileHint")}</Text>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
          {t("account.defaultCurrency")}
        </Text>
        <Text style={styles.hint}>{t("account.defaultCurrencyHint")}</Text>
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
        >
          <Text style={styles.pickerText}>{currencyLabel(defaultCurrency)}</Text>
          <Text style={styles.pickerChevron}>{t("account.choose")}</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>
          {t("account.appearance")}
        </Text>
        <Text style={styles.hint}>{t("account.appearanceHint")}</Text>
        <View style={styles.appearanceRow}>
          {appearanceOptions.map(({ value, label }) => (
            <Pressable
              key={value}
              style={[
                styles.appearanceChip,
                appearance === value && styles.appearanceChipOn,
              ]}
              onPress={() => void setAppearance(value)}
            >
              <Text
                style={[
                  styles.appearanceChipText,
                  appearance === value && styles.appearanceChipTextOn,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
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
