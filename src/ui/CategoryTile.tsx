import Ionicons from "@expo/vector-icons/Ionicons";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  /** Outer square size in points. Default 44 (matches kit). */
  size?: number;
  /** Optional radius override. Defaults to `round(size * 0.32)` (44→14, 46→15). */
  radius?: number;
  /** Optional icon size override. Defaults to `round(size * 0.5)`. */
  iconSize?: number;
  /** When `true` the tile uses primary bg + white icon (selected state). */
  active?: boolean;
  /** Override background. Falls back to `owedSoft` (or `primary` when active). */
  bg?: string;
  /** Override icon color. Falls back to `primary` (or `#fff` when active). */
  fg?: string;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mint-tinted rounded icon tile used in Onboarding feature rows, Account
 * settings rows, AddExpense category strip, AI receipt tiles, etc. Radius
 * is roughly `size * 0.32` — the kit uses 14 for a 44-pt tile.
 */
export function CategoryTile({
  icon,
  size = 44,
  radius,
  iconSize,
  active,
  bg,
  fg,
  style,
}: Props) {
  const { colors } = useTheme();
  const background = bg ?? (active ? colors.primary : colors.owedSoft);
  const foreground = fg ?? (active ? "#fff" : colors.primary);
  const tileRadius = radius ?? Math.round(size * 0.32);
  const glyphSize = iconSize ?? Math.round(size * 0.5);
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: tileRadius,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
        },
        style,
      ]}
    >
      <Ionicons name={icon} size={glyphSize} color={foreground} />
    </View>
  );
}
