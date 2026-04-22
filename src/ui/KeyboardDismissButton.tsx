import { Pressable, Keyboard, View, Platform, StyleSheet, type ViewStyle } from "react-native";
import { Text } from "./AppText";
import type { ThemeColors } from "../theme/tokens";

interface KeyboardDismissButtonProps {
  colors: ThemeColors;
  isRTL: boolean;
  style?: ViewStyle;
}

/**
 * Component that provides a "Done" button for iOS and Android keyboards.
 * On iOS, it appears above the keyboard.
 * On Android, it's typically part of the keyboard's built-in done button.
 */
export function KeyboardDismissButton({ colors, isRTL, style }: KeyboardDismissButtonProps) {
  if (Platform.OS !== "ios") {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        style,
      ]}
    >
      <Pressable
        style={({ pressed }) => [
          styles.button,
          pressed && styles.buttonPressed,
          { flexDirection: isRTL ? "row-reverse" : "row" },
        ]}
        onPress={() => Keyboard.dismiss()}
        hitSlop={12}
      >
        <Text style={[styles.buttonText, { color: colors.text }]}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
  },
  buttonPressed: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
});
