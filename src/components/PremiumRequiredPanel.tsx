import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, View } from "react-native";
import { usePremium } from "../premium/PremiumContext";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import { Text } from "../ui/AppText";
import { AppButton } from "../ui/AppButton";

export function PremiumRequiredPanel({
  title,
  body,
}: {
  title?: string;
  body?: string;
}) {
  const { colors } = useTheme();
  const { t, isRTL } = useLocale();
  const { requestUpgrade, busy, iapGatingEnabled } = usePremium();

  const te = { textAlign: (isRTL ? "right" : "left") as "right" | "left" };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.inputSurface,
          borderColor: colors.border,
        },
      ]}
    >
      <View
        style={[
          styles.row,
          { flexDirection: isRTL ? "row-reverse" : "row" },
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: colors.owedSoft }]}>
          <Ionicons name="sparkles-outline" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.title, { color: colors.text, ...te }]}>
            {title ?? t("premium.gateTitle")}
          </Text>
          <Text style={[styles.body, { color: colors.muted, ...te }]}>
            {body ?? t("premium.gateBody")}
          </Text>
        </View>
      </View>
      {iapGatingEnabled ? (
        <AppButton
          variant="primary"
          fullWidth
          style={{ marginTop: 12 }}
          label={busy ? t("premium.gateBusy") : t("premium.gateCta")}
          onPress={() => void requestUpgrade()}
          disabled={busy}
          accessibilityLabel={t("premium.gateCta")}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 4,
  },
  row: { alignItems: "center", gap: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "700" },
  body: { fontSize: 12, marginTop: 2, lineHeight: 17 },
});
