import { forwardRef, useMemo } from "react";
import type { ElementRef } from "react";
import { TextInput as RNTextInput, type TextInputProps } from "react-native";
import { useOptionalLocale } from "../i18n/LocaleContext";
import {
  containsArabicScript,
  mergePersianUiTextStyle,
} from "../theme/typography";

export type AppTextInputRef = ElementRef<typeof RNTextInput>;

export const TextInput = forwardRef<AppTextInputRef, TextInputProps>(
  function TextInput(props, ref) {
    const locale = useOptionalLocale();
    const valueSample =
      typeof props.value === "string"
        ? props.value
        : typeof props.defaultValue === "string"
          ? props.defaultValue
          : "";
    const usePersianFont =
      locale === "fa" || containsArabicScript(valueSample);
    const style = useMemo(
      () => mergePersianUiTextStyle(props.style, usePersianFont),
      [props.style, usePersianFont],
    );
    return <RNTextInput ref={ref} {...props} style={style} />;
  },
);
