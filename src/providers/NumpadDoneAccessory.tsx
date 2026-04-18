import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInputProps,
} from "react-native";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/** Shared across the app so any `decimal-pad` / `number-pad` field can show Done (iOS accessory + Android strip). */
export const NUMPAD_DONE_ACCESSORY_ID = "TallyNumpadDone";

type NumpadDoneCtx = {
  onNumpadFieldFocus: () => void;
  onNumpadFieldBlur: () => void;
};

const NumpadDoneContext = createContext<NumpadDoneCtx | null>(null);

export type NumpadDoneInputOpts = {
  onFocus?: TextInputProps["onFocus"];
  onBlur?: TextInputProps["onBlur"];
};

export function useNumpadDoneAccessoryContext(): NumpadDoneCtx | null {
  return useContext(NumpadDoneContext);
}

/** Use inside lists / loops where `useNumpadDoneInputProps` cannot run per row. */
export function buildNumpadDoneInputProps(
  ctx: NumpadDoneCtx | null,
  { onFocus: userOnFocus, onBlur: userOnBlur }: NumpadDoneInputOpts = {},
): Partial<TextInputProps> {
  const base: Partial<TextInputProps> = {
    inputAccessoryViewID:
      Platform.OS === "ios" ? NUMPAD_DONE_ACCESSORY_ID : undefined,
    returnKeyType: "done",
    blurOnSubmit: true,
    onSubmitEditing: () => {
      if (Platform.OS !== "web") Keyboard.dismiss();
    },
  };

  if (Platform.OS === "web" || !ctx) {
    return {
      ...base,
      onFocus: userOnFocus,
      onBlur: userOnBlur,
    };
  }

  if (Platform.OS === "ios") {
    return {
      ...base,
      onFocus: userOnFocus,
      onBlur: userOnBlur,
    };
  }

  return {
    ...base,
    onFocus: (e) => {
      ctx.onNumpadFieldFocus();
      userOnFocus?.(e);
    },
    onBlur: (e) => {
      ctx.onNumpadFieldBlur();
      userOnBlur?.(e);
    },
  };
}

function buildStyles(colors: ThemeColors) {
  return StyleSheet.create({
    accessoryBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      backgroundColor: colors.surface,
    },
    floatingWrap: {
      position: "absolute",
      left: 0,
      right: 0,
      zIndex: 10000,
      elevation: 10,
    },
    doneText: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.primary,
    },
  });
}

function NumpadDoneProviderInner({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const blurClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ctxValue = useMemo<NumpadDoneCtx>(
    () => ({
      onNumpadFieldFocus: () => {
        if (blurClearTimerRef.current) {
          clearTimeout(blurClearTimerRef.current);
          blurClearTimerRef.current = null;
        }
        setOpen(true);
      },
      onNumpadFieldBlur: () => {
        blurClearTimerRef.current = setTimeout(() => {
          setOpen(false);
          blurClearTimerRef.current = null;
        }, 120);
      },
    }),
    [],
  );

  useEffect(() => {
    if (Platform.OS === "ios") return;
    const show = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardInset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  useEffect(
    () => () => {
      if (blurClearTimerRef.current) {
        clearTimeout(blurClearTimerRef.current);
      }
    },
    [],
  );

  return (
    <NumpadDoneContext.Provider value={ctxValue}>
      <View style={{ flex: 1 }} collapsable={false} pointerEvents="box-none">
        {children}
        {Platform.OS === "ios" ? (
          <InputAccessoryView nativeID={NUMPAD_DONE_ACCESSORY_ID}>
            <View style={styles.accessoryBar}>
              <Pressable
                onPress={() => Keyboard.dismiss()}
                hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t("groupDetail.done")}
              >
                <Text style={styles.doneText}>{t("groupDetail.done")}</Text>
              </Pressable>
            </View>
          </InputAccessoryView>
        ) : null}
        {Platform.OS !== "ios" &&
        open &&
        keyboardInset > 0 &&
        Platform.OS !== "web" ? (
          <View
            style={[
              styles.accessoryBar,
              styles.floatingWrap,
              { bottom: keyboardInset },
            ]}
          >
            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel={t("groupDetail.done")}
            >
              <Text style={styles.doneText}>{t("groupDetail.done")}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </NumpadDoneContext.Provider>
  );
}

/** Wraps the app so every screen can use `useNumpadDoneInputProps` on numeric keypads. */
export function NumpadDoneProvider({ children }: { children: ReactNode }) {
  return <NumpadDoneProviderInner>{children}</NumpadDoneProviderInner>;
}

/**
 * Props for `TextInput` with `keyboardType` `decimal-pad` or `number-pad`.
 * Pass your own `onFocus` / `onBlur` (e.g. caret-to-end); they are merged on all platforms.
 */
export function useNumpadDoneInputProps(
  opts: NumpadDoneInputOpts = {},
): Partial<TextInputProps> {
  const ctx = useContext(NumpadDoneContext);
  const { onFocus: userOnFocus, onBlur: userOnBlur } = opts;
  return useMemo(
    () => buildNumpadDoneInputProps(ctx, { onFocus: userOnFocus, onBlur: userOnBlur }),
    [ctx, userOnFocus, userOnBlur],
  );
}
