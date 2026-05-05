import type { ReactNode } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { Text } from "./AppText";

type Props = {
  /** Uppercase eyebrow shown above the input. Optional — pass `null` to hide. */
  label?: ReactNode;
  /** Optional supplemental message under the input (e.g. error or hint). */
  hint?: ReactNode;
  /** When true, hint renders in `colors.owe` and uses error styling. */
  error?: boolean;
  /** Extra vertical space before this Field. Defaults to 18 — pass 0 for the top of a form. */
  topGap?: number;
  containerStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Form field wrapper used across Auth / AddExpense / CreateGroup / Plans.
 * Owns the uppercase eyebrow + optional hint row so screens stay declarative.
 *
 * The kit's Field renders the eyebrow at 11px / 700 / 0.5 letter-spacing in
 * `muted`, with 8px breathing room above the control. The hint sits 6px below
 * with the alert-circle icon when `error`.
 */
export function Field({ label, hint, error, topGap = 18, containerStyle, children }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[{ marginTop: topGap }, containerStyle]}>
      {label != null ? (
        <Text
          style={[styles.eyebrow, { color: colors.muted }]}
          accessibilityRole="text"
        >
          {typeof label === "string" ? label.toUpperCase() : label}
        </Text>
      ) : null}
      {children}
      {hint != null ? (
        <Text
          style={[
            styles.hint,
            { color: error ? colors.owe : colors.muted },
          ]}
        >
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingLeft: 2,
  },
  hint: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "600",
    paddingLeft: 2,
  },
});
