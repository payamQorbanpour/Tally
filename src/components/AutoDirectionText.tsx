import { Platform, Text, type TextProps } from "react-native";

/** Strong RTL scripts (Arabic/Persian block, Hebrew, etc.). */
const RTL_CHAR = /[\u0590-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectTextDirection(text: string): "ltr" | "rtl" {
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (RTL_CHAR.test(ch)) return "rtl";
    if (/[A-Za-z\u00C0-\u024F0-9]/.test(ch)) return "ltr";
  }
  return "ltr";
}

type Props = TextProps & { children: string };

/**
 * Renders text with alignment matching first strong character (mixed RTL/LTR in lists).
 * On web, `dir="auto"` improves browser bidi; native uses textAlign + writingDirection.
 */
export function AutoDirectionText({ children, style, ...rest }: Props) {
  const dir = detectTextDirection(children);
  const webDir = Platform.OS === "web" ? ({ dir: "auto" as const } as const) : {};

  return (
    <Text
      {...rest}
      {...webDir}
      style={[
        style,
        { textAlign: dir === "rtl" ? "right" : "left" },
        Platform.OS !== "web" && { writingDirection: dir },
      ]}
    >
      {children}
    </Text>
  );
}
