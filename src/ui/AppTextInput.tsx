import Ionicons from "@expo/vector-icons/Ionicons";
import { forwardRef, useMemo } from "react";
import type { ElementRef } from "react";
import {
  I18nManager,
  Pressable,
  TextInput as RNTextInput,
  View,
  type TextInputProps,
} from "react-native";
import { useOptionalLocale } from "../i18n/useOptionalLocale";
import {
  containsArabicScript,
  mergePersianUiTextStyle,
} from "../theme/typography";

export type AppTextInputRef = ElementRef<typeof RNTextInput>;

export type AppTextInputProps = TextInputProps & {
  /**
   * When true, reserves a trailing slot and renders a clear (✕) button while
   * the input has a value. The wrapper View is stable across keystrokes so
   * the underlying RNTextInput never unmounts (the keyboard stays open).
   */
  clearable?: boolean;
};

const CLEAR_BUTTON_SLOT = 36;

export const TextInput = forwardRef<AppTextInputRef, AppTextInputProps>(
  function TextInput({ clearable, ...props }, ref) {
    const locale = useOptionalLocale();
    const valueSample =
      typeof props.value === "string"
        ? props.value
        : typeof props.defaultValue === "string"
          ? props.defaultValue
          : "";
    const usePersianFont =
      locale === "fa" || containsArabicScript(valueSample);
    const isEditable = props.editable !== false;
    const showClear =
      clearable === true && isEditable && valueSample.length > 0;

    const style = useMemo(
      () => mergePersianUiTextStyle(props.style, usePersianFont),
      [props.style, usePersianFont],
    );
    /**
     * Reserve the trailing padding slot whenever `clearable` is set so layout
     * does not jump when the ✕ appears/disappears, and so toggling visibility
     * does not change the style identity on every keystroke.
     */
    const inputStyle = useMemo(() => {
      if (!clearable) return style;
      const pad = I18nManager.isRTL
        ? { paddingLeft: CLEAR_BUTTON_SLOT }
        : { paddingRight: CLEAR_BUTTON_SLOT };
      return [style, pad];
    }, [style, clearable]);

    const rnInput = (
      <RNTextInput
        ref={ref}
        {...props}
        style={inputStyle as TextInputProps["style"]}
      />
    );

    if (!clearable) return rnInput;

    return (
      <View style={{ position: "relative", width: "100%" }}>
        {rnInput}
        {showClear ? (
          <Pressable
            onPress={() => props.onChangeText?.("")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear text"
            style={({ pressed }) => ({
              position: "absolute",
              top: 0,
              bottom: 0,
              right: I18nManager.isRTL ? undefined : 6,
              left: I18nManager.isRTL ? 6 : undefined,
              width: 32,
              justifyContent: "center",
              alignItems: "center",
              opacity: pressed ? 0.5 : 0.75,
            })}
          >
            <Ionicons name="close-circle" size={18} color="#94a3b8" />
          </Pressable>
        ) : null}
      </View>
    );
  },
);
