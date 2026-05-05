import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect } from "@react-navigation/native";
import { useCallback, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
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
import { TextInput } from "../ui/AppTextInput";
import { CURRENCY_OPTIONS, isValidCurrencyCode } from "../data/currencies";
import {
  createUserFeedback,
  getSetting,
  setSetting,
  SETTINGS_KEYS,
} from "../data/tallyRepo";
import { useDatabase } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import type { AppLocale } from "../i18n/translations";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

function buildStyles(
  colors: ThemeColors,
  isRTL: boolean,
  resolvedScheme: "light" | "dark",
) {
  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };
  const emerald = resolvedScheme === "dark" ? "#10b981" : "#059669";

  return StyleSheet.create({
    wrap: { flex: 1, backgroundColor: colors.bg },
    headerAnchor: { backgroundColor: colors.bg, paddingHorizontal: 16 },
    pageTitleRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingTop: 8,
      paddingBottom: 12,
    },
    pageTitleHero: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      ...te,
    },
    scroll: { flex: 1 },
    scrollContent: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 64,
    },
    sectionLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.5,
      marginBottom: 8,
      ...te,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.cardRim,
      overflow: "hidden",
    },
    row: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 14,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowIconWrap: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "600", ...te },
    rowValue: { fontSize: 13, color: colors.muted, fontWeight: "600" },

    /* Pickers (modal) */
    modalRoot: {
      flex: 1,
      backgroundColor: colors.bg,
      paddingHorizontal: 16,
    },
    modalHeader: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 12,
      paddingBottom: 12,
    },
    modalTitle: { flex: 1, fontSize: 18, fontWeight: "800", color: colors.text },
    modalDone: { fontSize: 15, color: emerald, fontWeight: "700" },
    pickerList: { flex: 1 },
    pickerRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    pickerRowSelected: { backgroundColor: colors.owedSoft },
    pickerCode: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.text,
      width: 56,
    },
    pickerLabel: { flex: 1, fontSize: 15, color: colors.text, ...te },
    pickerEmpty: {
      paddingVertical: 24,
      textAlign: "center",
      color: colors.muted,
    },
    helper: { fontSize: 13, color: colors.muted, marginBottom: 8, ...te },
    fieldLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.4,
      marginTop: 8,
      marginBottom: 4,
      ...te,
    },
    input: {
      backgroundColor: colors.inputSurface,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
      borderWidth: 0,
    },
    btnFull: { marginTop: 18 },
    btnText: { fontWeight: "700" },
    pressed: { opacity: 0.85 },
    aboutHero: {
      alignItems: "center",
      paddingVertical: 28,
    },
    aboutLogoBox: {
      width: 72,
      height: 72,
      borderRadius: 18,
      backgroundColor: colors.owedSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
    },
    aboutTitle: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 8,
    },
  });
}

type RowDef = {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
};

export function SettingsScreen() {
  const db = useDatabase();
  const insets = useSafeAreaInsets();
  const { colors, resolvedScheme, appearance, setAppearance } = useTheme();
  const { t, locale, setLocale, isRTL } = useLocale();
  const styles = useMemo(
    () => buildStyles(colors, isRTL, resolvedScheme),
    [colors, isRTL, resolvedScheme],
  );
  const emerald = resolvedScheme === "dark" ? "#10b981" : "#059669";

  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  const [currencySearch, setCurrencySearch] = useState("");
  const [languagePickerOpen, setLanguagePickerOpen] = useState(false);
  const [appearancePickerOpen, setAppearancePickerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedbackTitle, setFeedbackTitle] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackBusy, setFeedbackBusy] = useState(false);

  const languageOptions: { code: AppLocale; label: string }[] = useMemo(
    () => [
      { code: "en", label: t("account.languageEnglish") },
      { code: "fa", label: t("account.languageFarsi") },
      { code: "es", label: t("account.languageSpanish") },
    ],
    [t],
  );

  const appearanceOptions: {
    code: "light" | "dark" | "system";
    label: string;
  }[] = useMemo(
    () => [
      { code: "light", label: t("account.appearanceLight") },
      { code: "dark", label: t("account.appearanceDark") },
      { code: "system", label: t("account.appearanceSystem") },
    ],
    [t],
  );

  const load = useCallback(async () => {
    const cur = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (cur && isValidCurrencyCode(cur)) setDefaultCurrency(cur);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filteredCurrencies = useMemo(() => {
    const q = currencySearch.trim().toLowerCase();
    if (!q) return [...CURRENCY_OPTIONS];
    return CURRENCY_OPTIONS.filter(
      (x) =>
        x.code.toLowerCase().includes(q) || x.label.toLowerCase().includes(q),
    );
  }, [currencySearch]);

  const pickDefaultCurrency = useCallback(
    async (code: string) => {
      setDefaultCurrency(code);
      try {
        await setSetting(db, SETTINGS_KEYS.defaultCurrency, code);
      } catch {
        /* best-effort */
      }
      setCurrencyPickerOpen(false);
    },
    [db],
  );

  const sendFeedback = useCallback(async () => {
    const title = feedbackTitle.trim();
    const message = feedbackMessage.trim();
    if (!title || !message) {
      Alert.alert(
        t("account.feedbackEmptyTitle"),
        t("account.feedbackEmptyBody"),
      );
      return;
    }
    setFeedbackBusy(true);
    try {
      await createUserFeedback(db, { title, body: message });
      setFeedbackTitle("");
      setFeedbackMessage("");
      setHelpOpen(false);
      Alert.alert(
        t("account.feedbackSentTitle"),
        t("account.feedbackSentBody"),
      );
    } catch {
      Alert.alert(
        t("account.feedbackFailedTitle"),
        t("account.feedbackFailedBody"),
      );
    } finally {
      setFeedbackBusy(false);
    }
  }, [db, feedbackTitle, feedbackMessage, t]);

  const rows: RowDef[] = [
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
        <View style={styles.pageTitleRow}>
          <Ionicons name="settings-outline" size={22} color={colors.text} />
          <Text style={styles.pageTitleHero}>
            {t("settings.title")}
          </Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionLabel}>
          {t("settings.preferencesSection").toUpperCase()}
        </Text>
        <View style={styles.card}>
          {rows.map((row, i) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              accessibilityRole="button"
              accessibilityLabel={row.label}
              style={({ pressed }) => [
                styles.row,
                i > 0 ? styles.rowDivider : null,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.rowIconWrap}>
                <Ionicons name={row.icon} size={18} color={emerald} />
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>
                {row.label}
              </Text>
              {row.value ? (
                <Text style={styles.rowValue} numberOfLines={1}>
                  {row.value}
                </Text>
              ) : null}
              <Ionicons
                name={isRTL ? "chevron-back" : "chevron-forward"}
                size={16}
                color={colors.muted}
              />
            </Pressable>
          ))}
        </View>
      </ScrollView>

      {/* Language picker */}
      <Modal
        visible={languagePickerOpen}
        animationType="slide"
        onRequestClose={() => setLanguagePickerOpen(false)}
      >
        <View
          style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
        >
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
              <Text style={styles.modalDone}>
                {t("account.currencyModalDone")}
              </Text>
            </Pressable>
          </View>
          <FlatList
            style={styles.pickerList}
            data={languageOptions}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.pickerRow,
                  item.code === locale && styles.pickerRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void setLocale(item.code);
                  setLanguagePickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === locale }}
              >
                <Text style={styles.pickerLabel}>{item.label}</Text>
                {item.code === locale ? (
                  <Ionicons name="checkmark" size={20} color={emerald} />
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* Appearance picker */}
      <Modal
        visible={appearancePickerOpen}
        animationType="slide"
        onRequestClose={() => setAppearancePickerOpen(false)}
      >
        <View
          style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
        >
          <View style={styles.modalHeader}>
            <Pressable
              onPress={() => setAppearancePickerOpen(false)}
              hitSlop={12}
            >
              <Ionicons
                name={isRTL ? "chevron-forward" : "chevron-back"}
                size={24}
                color={colors.text}
              />
            </Pressable>
            <Text style={styles.modalTitle}>{t("account.appearance")}</Text>
            <Pressable
              onPress={() => setAppearancePickerOpen(false)}
              hitSlop={12}
            >
              <Text style={styles.modalDone}>
                {t("account.currencyModalDone")}
              </Text>
            </Pressable>
          </View>
          <FlatList
            style={styles.pickerList}
            data={appearanceOptions}
            keyExtractor={(item) => item.code}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.pickerRow,
                  item.code === appearance && styles.pickerRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  void setAppearance(item.code);
                  setAppearancePickerOpen(false);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: item.code === appearance }}
              >
                <Text style={styles.pickerLabel}>{item.label}</Text>
                {item.code === appearance ? (
                  <Ionicons name="checkmark" size={20} color={emerald} />
                ) : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>

      {/* Currency picker */}
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
            <Text style={styles.modalTitle}>
              {t("account.currencyModalTitle")}
            </Text>
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
            style={styles.pickerList}
            data={filteredCurrencies}
            keyExtractor={(item) => item.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.pickerRow,
                  item.code === defaultCurrency && styles.pickerRowSelected,
                  pressed && styles.pressed,
                ]}
                onPress={() => void pickDefaultCurrency(item.code)}
              >
                <Text style={styles.pickerCode}>{item.code}</Text>
                <Text style={styles.pickerLabel}>{item.label}</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.pickerEmpty}>{t("account.currencyEmpty")}</Text>
            }
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* Help & support */}
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
              <Text style={styles.modalDone}>
                {t("account.currencyModalDone")}
              </Text>
            </Pressable>
          </View>
          <Text style={styles.helper}>{t("account.feedbackHint")}</Text>
          <Text style={styles.fieldLabel}>{t("account.feedbackTitleLabel")}</Text>
          <TextInput
            style={styles.input}
            value={feedbackTitle}
            onChangeText={setFeedbackTitle}
            placeholder={t("account.feedbackTitlePlaceholder")}
            placeholderTextColor={colors.muted}
            editable={!feedbackBusy}
            clearable
          />
          <Text style={styles.fieldLabel}>
            {t("account.feedbackMessageLabel")}
          </Text>
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
            label={
              feedbackBusy
                ? t("account.feedbackSending")
                : t("account.feedbackSend")
            }
            onPress={() => void sendFeedback()}
            disabled={feedbackBusy}
            accessibilityLabel={t("account.feedbackSend")}
          />
        </KeyboardAvoidingView>
      </Modal>

      {/* About */}
      <Modal
        visible={aboutOpen}
        animationType="slide"
        onRequestClose={() => setAboutOpen(false)}
      >
        <View
          style={[styles.modalRoot, { paddingTop: Math.max(24, insets.top + 12) }]}
        >
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
              <Text style={styles.modalDone}>
                {t("account.currencyModalDone")}
              </Text>
            </Pressable>
          </View>
          <View style={styles.aboutHero}>
            <View style={styles.aboutLogoBox}>
              <Ionicons name="wallet-outline" size={36} color={emerald} />
            </View>
            <Text style={styles.aboutTitle}>Tally</Text>
            <Text style={[styles.helper, { textAlign: "center" }]}>
              {t("account.aboutTagline")}
            </Text>
            <Text style={[styles.helper, { textAlign: "center" }]}>
              {t("account.aboutVersion", { version: "1.0.0" })}
            </Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}
