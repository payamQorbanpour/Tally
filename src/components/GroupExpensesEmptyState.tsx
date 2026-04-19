import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { Text } from "../ui/AppText";
import type { ThemeColors } from "../theme/tokens";

type Props = {
  colors: ThemeColors;
  title: string;
  subtitle: string;
  ctaLabel: string;
  onPress: () => void;
};

/**
 * Fintech-style empty state (illustration built with layered surfaces — no SVG dep).
 */
export function GroupExpensesEmptyState({
  colors,
  title,
  subtitle,
  ctaLabel,
  onPress,
}: Props) {
  return (
    <View
      style={[styles.root, { borderColor: colors.cardRim, backgroundColor: colors.surface }]}
    >
      <View
        style={[styles.illus, { backgroundColor: colors.inputSurface, borderColor: colors.border }]}
        accessibilityRole="image"
        accessibilityLabel=""
      >
        <View
          style={[styles.illusBase, { backgroundColor: colors.bg, borderColor: colors.border }]}
        >
          <View style={styles.illusRow}>
            <View
              style={[styles.pill, { backgroundColor: colors.owedSoft, borderColor: colors.border }]}
            />
            <View
              style={[styles.pillSm, { backgroundColor: colors.oweSoft, borderColor: colors.border }]}
            />
          </View>
          <View style={styles.illusRow}>
            <View
              style={[
                styles.pill,
                { backgroundColor: colors.owedSoft, borderColor: colors.border },
                { width: 72 } as ViewStyle,
              ]}
            />
            <View
              style={[
                styles.coin,
                { borderColor: colors.primary, backgroundColor: colors.owedSoft },
              ]}
            />
          </View>
          <View
            style={[styles.spark, { backgroundColor: colors.border, overflow: "hidden" }]}
            accessibilityLabel=""
          >
            <View
              style={[
                styles.sparkFill,
                { width: "42%", backgroundColor: colors.primary },
              ]}
            />
          </View>
        </View>
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.sub, { color: colors.muted }]}>{subtitle}</Text>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.cta,
          { backgroundColor: colors.primary, opacity: pressed ? 0.92 : 1 },
        ]}
        accessibilityRole="button"
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginTop: 12,
    marginHorizontal: 0,
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
  },
  illus: {
    width: "100%",
    maxWidth: 200,
    aspectRatio: 1.15,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  illusBase: {
    width: "80%",
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
  },
  illusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  pill: {
    height: 6,
    borderRadius: 3,
    width: 56,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pillSm: { height: 4, width: 28, borderRadius: 2, borderWidth: StyleSheet.hairlineWidth },
  coin: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
  },
  spark: {
    height: 3,
    borderRadius: 1,
    width: "100%",
    marginTop: 4,
  },
  sparkFill: { height: "100%", borderRadius: 1 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  sub: { fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 20 },
  cta: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, minWidth: 200, alignItems: "center" },
  ctaText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
