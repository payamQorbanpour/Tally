import Ionicons from "@expo/vector-icons/Ionicons";
import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "./AppText";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  /** Title text. Custom node lets the caller include a chevron or pill. */
  title: ReactNode;
  /** Pressed when the user taps the back chevron. Required. */
  onBack: () => void;
  /** Optional right-side action(s). Rendered flush to the right edge. */
  right?: ReactNode;
  /** A11y label for the back chevron. */
  backAccessibilityLabel?: string;
  /** Disable the back button (e.g. while saving). */
  backDisabled?: boolean;
  /** Style override for the outer container (e.g. zIndex tweaks). */
  containerStyle?: ViewStyle;
};

/**
 * Custom screen header used in place of the native-stack header for
 * screens where we need the title visually centered on screen, the right
 * actions flush to the right edge, and tail-ellipsis when the title
 * overflows. The native iOS 17+ floating-pill header rearranges these
 * slots in ways that don't match the design.
 */
export function ScreenHeader({
  title,
  onBack,
  right,
  backAccessibilityLabel,
  backDisabled,
  containerStyle,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        {
          backgroundColor: colors.bg,
          paddingTop: Math.max(8, insets.top),
          paddingBottom: 6,
          paddingHorizontal: 12,
          zIndex: 2,
        },
        containerStyle,
      ]}
    >
      <View style={styles.row}>
        {/* Title is absolutely positioned + centered so the chevron and
            right actions can grow without shifting the title. `box-none`
            keeps the wrap itself transparent to taps (so it never steals
            from the chevron/right actions) while still letting a
            Pressable passed in via `title` receive its own taps. */}
        <View style={styles.titleAbsoluteWrap} pointerEvents="box-none">
          {typeof title === "string" ? (
            <Text
              style={[styles.titleText, { color: colors.text }]}
              numberOfLines={1}
              ellipsizeMode="tail"
            >
              {title}
            </Text>
          ) : (
            title
          )}
        </View>

        <Pressable
          onPress={onBack}
          disabled={backDisabled}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel ?? "Back"}
          style={({ pressed }) => [
            styles.backBtn,
            { backgroundColor: colors.surface, borderColor: colors.border },
            pressed && { opacity: 0.85 },
            backDisabled && { opacity: 0.4 },
          ]}
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </Pressable>

        <View style={{ flex: 1 }} />

        {right ? <View style={styles.rightWrap}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    position: "relative",
  },
  titleAbsoluteWrap: {
    position: "absolute",
    left: 56,
    right: 56,
    top: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    fontSize: 17,
    fontWeight: "600",
    textAlign: "center",
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  rightWrap: {
    flexDirection: "row",
    alignItems: "center",
  },
});
