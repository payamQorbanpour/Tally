import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Text } from "./AppText";

export type AppButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive";

export type AppButtonSize = "sm" | "md";

type Props = Omit<PressableProps, "style" | "children"> & {
  label: string;
  variant?: AppButtonVariant;
  size?: AppButtonSize;
  fullWidth?: boolean;
  left?: ReactNode;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function AppButton({
  label,
  variant = "primary",
  size = "md",
  fullWidth = false,
  left,
  right,
  disabled,
  style,
  textStyle,
  ...pressableProps
}: Props) {
  const { colors, resolvedScheme } = useTheme();

  const styles = useMemo(
    () =>
      makeStyles({
        colors,
        resolvedScheme,
        size,
        variant,
        fullWidth,
      }),
    [colors, resolvedScheme, size, variant, fullWidth],
  );

  return (
    <Pressable
      {...pressableProps}
      disabled={disabled}
      style={(state) => {
        const hovered = "hovered" in state && !!state.hovered;
        return [
          styles.base,
          state.pressed && !disabled && styles.pressed,
          (disabled || ("disabled" in state && (state as any).disabled)) && styles.disabled,
          Platform.OS === "web" && hovered && !disabled && styles.hovered,
          style,
        ];
      }}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
    >
      <View style={styles.inner}>
        {left ? <View style={styles.iconLeft}>{left}</View> : null}
        <Text style={[styles.label, textStyle]} numberOfLines={1}>
          {label}
        </Text>
        {right ? <View style={styles.iconRight}>{right}</View> : null}
      </View>
    </Pressable>
  );
}

function makeStyles({
  colors,
  resolvedScheme,
  size,
  variant,
  fullWidth,
}: {
  colors: ReturnType<typeof useTheme>["colors"];
  resolvedScheme: ReturnType<typeof useTheme>["resolvedScheme"];
  size: AppButtonSize;
  variant: AppButtonVariant;
  fullWidth: boolean;
}) {
  const padY = size === "sm" ? 10 : 14;
  const padX = size === "sm" ? 14 : 16;
  const radius = size === "sm" ? 10 : 12;

  const bg =
    variant === "primary"
      ? colors.primary
      : variant === "secondary"
        ? colors.surface
        : variant === "destructive"
          ? colors.destructive
          : "transparent";

  const borderWidth =
    variant === "outline" ? 1.5 : variant === "secondary" ? StyleSheet.hairlineWidth : 0;
  const borderColor =
    variant === "outline"
      ? colors.border
      : variant === "secondary"
        ? colors.border
        : "transparent";

  const textColor =
    variant === "primary" || variant === "destructive"
      ? "#fff"
      : variant === "ghost"
        ? colors.primary
        : colors.text;

  const shadow =
    variant === "primary" && resolvedScheme === "dark"
      ? {
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 8,
          elevation: 2,
        }
      : null;

  return StyleSheet.create({
    base: {
      ...(fullWidth ? { alignSelf: "stretch", width: "100%" } : { alignSelf: "flex-start" }),
      backgroundColor: bg,
      borderRadius: radius,
      paddingVertical: padY,
      paddingHorizontal: padX,
      borderWidth,
      borderColor,
      minHeight: size === "sm" ? 40 : 48,
      justifyContent: "center",
      ...(shadow ?? {}),
    } as ViewStyle,
    inner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      minWidth: 0,
    },
    label: {
      color: textColor,
      fontSize: size === "sm" ? 15 : 16,
      fontWeight: "700",
      textAlign: "center",
      minWidth: 0,
      ...Platform.select({
        android: { includeFontPadding: false } as const,
        default: {},
      }),
    },
    iconLeft: { marginRight: 2 },
    iconRight: { marginLeft: 2 },
    pressed: { opacity: 0.88 },
    hovered: Platform.OS === "web" ? ({ transform: [{ scale: 0.99 }] } as ViewStyle) : ({} as ViewStyle),
    disabled: { opacity: 0.5 },
  });
}

