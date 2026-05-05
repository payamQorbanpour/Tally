import Ionicons from "@expo/vector-icons/Ionicons";
import { forwardRef, useMemo, type Ref } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import { Text } from "./AppText";

type Props = {
  /** Pressed when the user taps the mic half. Required. */
  onMicPress: () => void;
  /** Pressed when the user taps the plus half. Required. */
  onPlusPress: () => void;
  /** Whether a tab bar sits below the FAB. When `true` the FAB lifts above it. */
  withTabBar?: boolean;
  /** Custom bottom override (in pt). When set, ignores `withTabBar`. */
  bottom?: number;
  /** Accessibility label for the mic half. */
  micA11yLabel?: string;
  /** Accessibility label for the plus half. */
  plusA11yLabel?: string;
  /** Forwarded onLayout for tour anchoring. */
  onLayout?: (e: LayoutChangeEvent) => void;
  containerStyle?: StyleProp<ViewStyle>;
};

const TAB_BAR_BASE = 50;
const FAB_BOTTOM_NO_TAB = 28;

/**
 * Dual-half pill FAB — mic on the leading side, plus on the trailing side.
 * Mirrors `ui_kits/tally_app/Primitives.jsx::FabPill` and the existing
 * `MainTabs.GlobalFab` implementation, factored so any screen can drop it
 * in without re-implementing the geometry.
 *
 * Halves are always pinned to ltr-end (right): in RTL the visual order is
 * mic-then-plus reading right-to-left, matching the design.
 */
export const FabPill = forwardRef<View, Props>(function FabPill(
  {
    onMicPress,
    onPlusPress,
    withTabBar = true,
    bottom,
    micA11yLabel,
    plusA11yLabel,
    onLayout,
    containerStyle,
  }: Props,
  ref: Ref<View>,
) {
  const { colors, shadows } = useTheme();
  const { isRTL } = useLocale();
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => buildStyles(isRTL), [isRTL]);

  const bottomPx =
    bottom ??
    (withTabBar ? Math.max(72, TAB_BAR_BASE + insets.bottom + 12) : FAB_BOTTOM_NO_TAB);

  return (
    <View
      ref={ref}
      onLayout={onLayout}
      collapsable={false}
      style={[
        styles.pill,
        {
          backgroundColor: colors.primary,
          bottom: bottomPx,
          ...shadows.fab,
        },
        containerStyle,
      ]}
    >
      <Pressable
        onPress={onMicPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={micA11yLabel ?? "Voice receipt"}
        style={({ pressed }) => [styles.half, pressed && styles.pressed]}
      >
        <Ionicons name="mic" size={22} color="#fff" />
      </Pressable>
      <View style={styles.divider} pointerEvents="none" />
      <Pressable
        onPress={onPlusPress}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={plusA11yLabel ?? "Add expense"}
        style={({ pressed }) => [styles.half, pressed && styles.pressed]}
      >
        <Text style={styles.plus}>+</Text>
      </Pressable>
    </View>
  );
});

function buildStyles(isRTL: boolean) {
  const pill: ViewStyle = {
    position: "absolute",
    right: 20,
    flexDirection: isRTL ? "row-reverse" : "row",
    alignItems: "center",
    borderRadius: 28,
    height: 56,
    overflow: "hidden",
    zIndex: 5,
  };
  const half: ViewStyle = {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
  };
  const divider: ViewStyle = {
    width: StyleSheet.hairlineWidth,
    height: 28,
    backgroundColor: "rgba(255,255,255,0.35)",
  };
  const plus: TextStyle = {
    color: "#fff",
    fontSize: 32,
    fontWeight: "300",
    marginTop: -2,
    includeFontPadding: false,
  };
  const pressed: ViewStyle = { opacity: 0.8 };
  return { pill, half, divider, plus, pressed };
}
