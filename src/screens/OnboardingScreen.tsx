import Ionicons from "@expo/vector-icons/Ionicons";
import type { NavigationProp } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "../ui/AppButton";
import { TextInput } from "../ui/AppTextInput";
import { Text } from "../ui/AppText";
import { useDatabase } from "../db/DatabaseContext";
import {
  getLocalUserProfile,
  updateLocalUserProfile,
} from "../data/tallyRepo";
import { useLocale } from "../i18n/LocaleContext";
import { useOnboarding } from "../providers/OnboardingContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";
import type { RootStackParamList } from "../navigation/types";

/**
 * Single-intent onboarding: name + "Add your first expense" + sign-in link.
 *
 * Replaces the old 4-page swipe carousel. The job-to-be-done is "log a
 * shared cost," so we collapse everything else (debt-simplification pitch,
 * cross-device sync framing) until the user has experienced the core flow.
 * Sign-in stays available as a tertiary link for returning users.
 */
export function OnboardingScreen() {
  const navigation =
    useNavigation<NavigationProp<RootStackParamList>>();
  const { markOnboardingDone } = useOnboarding();
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const insets = useSafeAreaInsets();
  const db = useDatabase();
  const styles = useMemo(() => buildStyles(colors, isRTL), [colors, isRTL]);

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Pre-fill the name field if a profile already exists (e.g. user re-runs
  // onboarding after the flag was reset). Default seed name is "You" — drop
  // it so the placeholder shows instead of nudging the user to keep "You".
  useEffect(() => {
    void (async () => {
      const me = await getLocalUserProfile(db);
      if (me.name && me.name.trim() && me.name.trim() !== "You") {
        setName(me.name.trim());
      }
    })();
  }, [db]);

  const onPrimary = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const trimmed = name.trim();
      if (trimmed) {
        await updateLocalUserProfile(db, { name: trimmed });
      }
      await markOnboardingDone();
      // Drop the user straight into Main — the global FAB / GroupsScreen
      // FAB is the next call to action.
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    } finally {
      setSubmitting(false);
    }
  }, [db, markOnboardingDone, name, navigation, submitting]);

  const goToAuth = useCallback(() => {
    navigation.navigate("Auth");
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 24 }]}>
        <View style={styles.brandRow}>
          <Image
            source={require("../../assets/favicon.png")}
            style={styles.brandLogo}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.brand}>Tally</Text>
        </View>

        <View style={styles.heroBlock}>
          <View
            style={[styles.iconWrap, { backgroundColor: colors.owedSoft }]}
          >
            <Ionicons
              name="sparkles-outline"
              size={56}
              color={colors.primary}
            />
          </View>
          <Text style={styles.title}>{t("onboarding.intentTitle")}</Text>
          <Text style={styles.body}>{t("onboarding.intentBody")}</Text>
        </View>

        <View style={styles.formBlock}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={t("onboarding.namePlaceholder")}
            placeholderTextColor={colors.muted}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="go"
            onSubmitEditing={() => void onPrimary()}
            editable={!submitting}
          />
        </View>

        <View
          style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}
        >
          <AppButton
            variant="primary"
            fullWidth
            label={t("onboarding.primaryCta")}
            onPress={() => void onPrimary()}
            disabled={submitting}
          />
          <Pressable
            onPress={goToAuth}
            disabled={submitting}
            hitSlop={10}
            style={({ pressed }) => [
              styles.signInLink,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="link"
            accessibilityLabel={t("onboarding.signInLink")}
          >
            <Text style={styles.signInLinkText}>
              {t("onboarding.signInLink")}
            </Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function buildStyles(colors: ThemeColors, isRTL: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    inner: { flex: 1, paddingHorizontal: 24 },
    brandRow: {
      flexDirection: isRTL ? "row-reverse" : "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 28,
    },
    brandLogo: { width: 28, height: 28, borderRadius: 6 },
    brand: {
      fontSize: 20,
      fontWeight: "800",
      color: colors.primary,
      letterSpacing: -0.5,
    },
    heroBlock: {
      alignItems: "center",
      marginTop: 12,
      marginBottom: 32,
    },
    iconWrap: {
      width: 96,
      height: 96,
      borderRadius: 48,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: "800",
      color: colors.text,
      textAlign: "center",
      marginBottom: 8,
    },
    body: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      textAlign: "center",
      maxWidth: 360,
    },
    formBlock: { flex: 1 },
    nameInput: {
      fontSize: 17,
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.inputSurface,
      color: colors.text,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    footer: {
      paddingTop: 8,
      gap: 12,
    },
    signInLink: {
      alignItems: "center",
      paddingVertical: 8,
    },
    signInLinkText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: "600",
    },
  });
}
