import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Text } from "./AppText";

export type SettingsGroupItem = {
  /** Stable id used for `key`. Required. */
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  /** Right-aligned secondary text. */
  value?: string;
  /** When `true`, the leading icon tile uses primary bg + white icon. */
  accent?: boolean;
  /** When provided, replaces the default chevron-forward affordance. */
  trailing?: ReactNode;
  /** Optional press handler — when omitted the row is non-interactive. */
  onPress?: () => void;
  /** When `true`, the label renders in `colors.owe` (e.g. destructive row). */
  destructive?: boolean;
  accessibilityLabel?: string;
};

type Props = {
  /** Uppercase eyebrow above the card. Defaults to "" (no header). */
  title?: string;
  items: SettingsGroupItem[];
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * Card-grouped settings list with hairline dividers, mirroring the kit's
 * `SettingsGroup`. Used by Account, GroupDetail header sheet, etc.
 */
export function SettingsGroup({ title, items, containerStyle }: Props) {
  const { colors, shadows } = useTheme();
  return (
    <View style={[{ marginTop: 22 }, containerStyle]}>
      {title ? (
        <Text
          style={[styles.eyebrow, { color: colors.muted }]}
          accessibilityRole="text"
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.cardRim,
            ...shadows.card,
          },
        ]}
      >
        {items.map((it, i) => {
          const tileBg = it.accent ? colors.primary : colors.owedSoft;
          const tileFg = it.accent ? "#fff" : colors.primary;
          const labelColor = it.destructive ? colors.owe : colors.text;
          const content = (
            <View
              style={[
                styles.row,
                i === 0
                  ? null
                  : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
              ]}
            >
              <View
                style={[
                  styles.iconTile,
                  { backgroundColor: tileBg },
                ]}
              >
                <Ionicons name={it.icon} size={16} color={tileFg} />
              </View>
              <Text
                style={[styles.label, { color: labelColor }]}
                numberOfLines={1}
              >
                {it.label}
              </Text>
              {it.value ? (
                <Text
                  style={[styles.value, { color: colors.muted }]}
                  numberOfLines={1}
                >
                  {it.value}
                </Text>
              ) : null}
              {it.trailing !== undefined ? (
                it.trailing
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={16}
                  color={colors.muted}
                />
              )}
            </View>
          );
          if (it.onPress) {
            return (
              <Pressable
                key={it.id}
                onPress={it.onPress}
                accessibilityRole="button"
                accessibilityLabel={it.accessibilityLabel ?? it.label}
                style={({ pressed }) => [pressed && styles.pressed]}
              >
                {content}
              </Pressable>
            );
          }
          return (
            <View key={it.id} accessibilityLabel={it.accessibilityLabel ?? it.label}>
              {content}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    marginBottom: 8,
    paddingLeft: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  iconTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
  },
  value: {
    fontSize: 13,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.85,
  },
});
