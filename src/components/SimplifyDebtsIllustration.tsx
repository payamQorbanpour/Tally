import { StyleSheet, View } from "react-native";
import { Text } from "../ui/AppText";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { ThemeColors } from "../theme/tokens";

type Props = {
  colors: ThemeColors;
  caption: string;
  simplifyWord: string;
  onePaymentLabel: string;
};

/**
 * Compact “before / after” diagram: many pairwise IOUs vs one combined settlement.
 */
export function SimplifyDebtsIllustration({
  colors,
  caption,
  simplifyWord,
  onePaymentLabel,
}: Props) {
  const s = buildStyles(colors);
  return (
    <View style={s.wrap} accessibilityRole="image" accessibilityLabel={caption}>
      <View style={s.beforeRow}>
        <View style={s.node}>
          <Text style={s.nodeLetter}>A</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.muted} />
        <View style={s.node}>
          <Text style={s.nodeLetter}>B</Text>
        </View>
        <Ionicons name="arrow-forward" size={14} color={colors.muted} />
        <View style={s.node}>
          <Text style={s.nodeLetter}>C</Text>
        </View>
        <Text style={s.messyLabel}>…</Text>
      </View>
      <View style={s.divider}>
        <Ionicons name="arrow-down" size={16} color={colors.primary} />
        <Text style={s.dividerText}>{simplifyWord}</Text>
        <Ionicons name="arrow-down" size={16} color={colors.primary} />
      </View>
      <View style={s.afterRow}>
        <View style={[s.node, s.nodeStrong]}>
          <Text style={[s.nodeLetter, s.nodeLetterOn]}>A</Text>
        </View>
        <Ionicons name="arrow-forward" size={18} color={colors.primary} />
        <View style={[s.node, s.nodeStrong]}>
          <Text style={[s.nodeLetter, s.nodeLetterOn]}>C</Text>
        </View>
        <View style={s.afterBadge}>
          <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
          <Text style={s.afterBadgeText}>{onePaymentLabel}</Text>
        </View>
      </View>
      <Text style={s.caption}>{caption}</Text>
    </View>
  );
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    wrap: {
      marginTop: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: 12,
      backgroundColor: colors.inputSurface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    beforeRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 4,
      flexWrap: "wrap",
    },
    afterRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      flexWrap: "wrap",
    },
    node: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    nodeStrong: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.owedSoft,
    },
    nodeLetter: {
      fontSize: 13,
      fontWeight: "800",
      color: colors.muted,
    },
    nodeLetterOn: { color: colors.primary },
    messyLabel: {
      fontSize: 16,
      color: colors.muted,
      fontWeight: "700",
      marginLeft: 4,
    },
    divider: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginVertical: 10,
    },
    dividerText: {
      fontSize: 11,
      fontWeight: "800",
      color: colors.primary,
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    afterBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      backgroundColor: colors.owedSoft,
    },
    afterBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.primary,
    },
    caption: {
      marginTop: 12,
      fontSize: 12,
      lineHeight: 17,
      color: colors.muted,
      textAlign: "center",
    },
  });
}
