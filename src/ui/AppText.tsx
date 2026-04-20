import { type ReactNode, isValidElement, useMemo } from "react";
import { Text as RNText, type TextProps } from "react-native";
import { useOptionalLocale } from "../i18n/useOptionalLocale";
import {
  containsArabicScript,
  mergePersianUiTextStyle,
} from "../theme/typography";

/** Pull plain text from children for Arabic-script font selection (nested Text supported). */
function textFromChildren(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textFromChildren).join("");
  if (isValidElement(node)) {
    const ch = (node.props as { children?: ReactNode }).children;
    if (ch != null) return textFromChildren(ch);
  }
  return "";
}

/** Default `Text`: Vazirmatn for fa locale or any Arabic/Persian script in content (mixed EN UI). */
export function Text(props: TextProps) {
  const locale = useOptionalLocale();
  const usePersianFont =
    locale === "fa" || containsArabicScript(textFromChildren(props.children));
  const style = useMemo(
    () => mergePersianUiTextStyle(props.style, usePersianFont),
    [props.style, usePersianFont],
  );
  return <RNText {...props} style={style} />;
}
