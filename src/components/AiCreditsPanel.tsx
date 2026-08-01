import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import type { RootStackParamList } from "../navigation/types";
import { useAiCredits } from "../premium/AiCreditsContext";
import { useTheme } from "../theme/ThemeContext";
import { AppButton } from "../ui/AppButton";

/**
 * Shown when a non-premium user runs out of AI credits.
 *
 * Two shapes, driven by whether an ad provider exists: watch-an-ad on mobile,
 * and a pass upsell on web (no rewarded-ad SDK runs in a browser, so web
 * users spend their signup grant and cannot earn more).
 */
export function AiCreditsPanel({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { t } = useLocale();
  const { colors } = useTheme();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { adsAvailable, busy, watchAdForCredits } = useAiCredits();
  const [notice, setNotice] = useState<string | null>(null);

  const styles = buildStyles(colors);

  const onWatch = async () => {
    setNotice(null);
    const result = await watchAdForCredits();
    switch (result) {
      case "granted":
        onClose();
        return;
      case "pending":
        setNotice(t("aiCredits.pending"));
        return;
      case "dismissed":
        setNotice(t("aiCredits.dismissed"));
        return;
      case "failed":
      case "unavailable":
        setNotice(t("aiCredits.failed"));
        return;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>
            {adsAvailable ? t("aiCredits.title") : t("aiCredits.noAdsTitle")}
          </Text>
          <Text style={styles.body}>
            {adsAvailable
              ? t("aiCredits.body").replace("{{count}}", "3")
              : t("aiCredits.noAdsBody")}
          </Text>

          {notice ? <Text style={styles.notice}>{notice}</Text> : null}

          {adsAvailable ? (
            <AppButton
              variant="primary"
              label={busy ? t("aiCredits.watchBusy") : t("aiCredits.watchCta")}
              onPress={() => void onWatch()}
              disabled={busy}
              accessibilityLabel={t("aiCredits.watchCta")}
            />
          ) : null}

          {busy ? <ActivityIndicator style={styles.spinner} color={colors.primary} /> : null}

          <AppButton
            variant="secondary"
            label={t("aiCredits.passCta")}
            onPress={() => {
              onClose();
              navigation.navigate("Plans");
            }}
            accessibilityLabel={t("aiCredits.passCta")}
          />

          <Pressable onPress={onClose} accessibilityRole="button">
            <Text style={styles.close}>{t("aiCredits.close")}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function buildStyles(colors: { bg: string; text: string; muted: string; primary: string }) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
    },
    card: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.bg,
      borderRadius: 20,
      padding: 20,
      gap: 12,
    },
    title: { fontSize: 20, fontWeight: "700", color: colors.text },
    body: { fontSize: 15, color: colors.muted, lineHeight: 21 },
    notice: { fontSize: 14, color: colors.primary },
    spinner: { marginVertical: 4 },
    close: { fontSize: 15, color: colors.muted, textAlign: "center", paddingVertical: 8 },
  });
}
