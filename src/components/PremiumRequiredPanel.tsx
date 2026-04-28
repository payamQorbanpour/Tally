import { useNavigation } from "@react-navigation/native";
import type { NavigationProp } from "@react-navigation/native";
import { StyleSheet, View } from "react-native";
import { usePremium } from "../premium/PremiumContext";
import { useLocale } from "../i18n/LocaleContext";
import type { RootStackParamList } from "../navigation/types";
import { AppButton } from "../ui/AppButton";

export function PremiumRequiredPanel({ children }: { children?: React.ReactNode }) {
  const { isPremium } = usePremium();
  const { t } = useLocale();
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();

  if (isPremium) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <View style={styles.dim} pointerEvents="none">
        {children}
      </View>
      <View style={styles.overlay} pointerEvents="box-none">
        <AppButton
          variant="primary"
          label={t("premium.gateCta")}
          onPress={() => navigation.navigate("Plans")}
          accessibilityLabel={t("premium.gateCta")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "relative" },
  dim: { opacity: 0.35 },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
});
