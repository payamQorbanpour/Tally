import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { AppButton } from "./AppButton";
import { Text } from "./AppText";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Single-paragraph helper text under the title. */
  subtitle?: string;
  /** When provided, a primary CTA button is rendered below the subtitle. */
  ctaLabel?: string;
  onCtaPress?: () => void;
  /** Extra UI rendered after the CTA (e.g. secondary link). */
  extra?: ReactNode;
  /** Top spacer — mostly used for centring inside a flex parent. Default 60. */
  topGap?: number;
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Centred empty-state used by Activity / Friends / Notifications and any other
 * "nothing here yet" surface. Mirrors the kit's `EmptyState` (mint icon tile,
 * 20px/800 title, 14px/muted subtitle, primary CTA below).
 */
export function EmptyState({
  icon,
  title,
  subtitle,
  ctaLabel,
  onCtaPress,
  extra,
  topGap = 60,
  containerStyle,
}: Props) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.wrap,
        { marginTop: topGap, paddingHorizontal: 24 },
        containerStyle,
      ]}
    >
      <View
        style={[
          styles.iconTile,
          { backgroundColor: colors.owedSoft },
        ]}
      >
        <Ionicons name={icon} size={38} color={colors.primary} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.muted }]}>{subtitle}</Text>
      ) : null}
      {ctaLabel ? (
        <View style={styles.ctaWrap}>
          <AppButton label={ctaLabel} variant="primary" size="md" onPress={onCtaPress} />
        </View>
      ) : null}
      {extra ? <View style={{ marginTop: 12 }}>{extra}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
  },
  iconTile: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    marginTop: 6,
    lineHeight: 21,
    textAlign: "center",
  },
  ctaWrap: {
    marginTop: 18,
  },
});
