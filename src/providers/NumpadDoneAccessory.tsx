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
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type TextInputProps,
} from "react-native";
import { Text } from "../ui/AppText";
import { useLocale } from "../i18n/LocaleContext";
import { useTheme } from "../theme/ThemeContext";
import type { ThemeColors } from "../theme/tokens";

/**
 * One floating bar above the keyboard on iOS + Android (decimal/number pads have no return key).
 * The system decimal pad often has no “.” key; optional {@link NumpadDoneInputOpts.onDecimalInsert}
 * shows a “.” button that runs while the field is focused.
 */
type NumpadDoneCtx = {
  onNumpadFieldFocus: () => void;
  onNumpadFieldBlur: () => void;
  setDecimalInsertHandler: (fn: (() => void) | null) => void;
};

const NumpadDoneContext = createContext<NumpadDoneCtx | null>(null);

export type NumpadDoneInputOpts = {
  onFocus?: TextInputProps["onFocus"];
  onBlur?: TextInputProps["onBlur"];
  /** Shown as a “.” key on the accessory; decimal-pad keyboards often omit it (esp. iOS). */
  onDecimalInsert?: () => void;
};

export function useNumpadDoneAccessoryContext(): NumpadDoneCtx | null {
  return useContext(NumpadDoneContext);
}

/** Use inside lists / loops where `useNumpadDoneInputProps` cannot run per row. */
export function buildNumpadDoneInputProps(
  ctx: NumpadDoneCtx | null,
  {
    onFocus: userOnFocus,
    onBlur: userOnBlur,
    onDecimalInsert,
  }: NumpadDoneInputOpts = {},
): Partial<TextInputProps> {
  const submitDismissProps: Partial<TextInputProps> =
    Platform.OS === "ios"
      ? {}
      : {
          returnKeyType: "done",
          blurOnSubmit: true,
          onSubmitEditing: () => {
            if (Platform.OS !== "web") Keyboard.dismiss();
          },
        };

  if (Platform.OS === "web" || !ctx) {
    return {
      ...submitDismissProps,
      onFocus: userOnFocus,
      onBlur: userOnBlur,
    };
  }

  return {
    ...submitDismissProps,
    onFocus: (e) => {
      ctx.setDecimalInsertHandler(onDecimalInsert ?? null);
      ctx.onNumpadFieldFocus();
      userOnFocus?.(e);
    },
    onBlur: (e) => {
      ctx.setDecimalInsertHandler(null);
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
    decimalKey: {
      fontSize: 22,
      fontWeight: "600",
      color: colors.primary,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    accessoryInner: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
    },
    accessorySpacer: {
      flex: 1,
    },
  });
}

function NumpadDoneProviderInner({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const { t } = useLocale();
  const styles = useMemo(() => buildStyles(colors), [colors]);
  const [open, setOpen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [decimalInsert, setDecimalInsert] = useState<(() => void) | null>(
    null,
  );
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
      setDecimalInsertHandler: setDecimalInsert,
    }),
    [setOpen, setDecimalInsert],
  );

  useEffect(() => {
    if (Platform.OS === "web") return;
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e) => {
      setKeyboardInset(e.endCoordinates.height);
    });
    const hide = Keyboard.addListener(hideEvent, () => {
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
        {Platform.OS !== "web" && open && keyboardInset > 0 ? (
          <View
            style={[
              styles.accessoryBar,
              styles.floatingWrap,
              { bottom: keyboardInset },
            ]}
          >
            <View style={styles.accessoryInner}>
              {decimalInsert != null ? (
                <Pressable
                  onPress={() => decimalInsert()}
                  hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                  accessibilityRole="button"
                  accessibilityLabel={t("groupDetail.decimalSeparator")}
                >
                  <Text style={styles.decimalKey}>.</Text>
                </Pressable>
              ) : null}
              <View style={styles.accessorySpacer} />
              <Pressable
                onPress={() => Keyboard.dismiss()}
                hitSlop={{ top: 10, bottom: 10, left: 12, right: 12 }}
                accessibilityRole="button"
                accessibilityLabel={t("groupDetail.done")}
              >
                <Text style={styles.doneText}>{t("groupDetail.done")}</Text>
              </Pressable>
            </View>
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
  const { onFocus: userOnFocus, onBlur: userOnBlur, onDecimalInsert } = opts;
  return useMemo(
    () =>
      buildNumpadDoneInputProps(ctx, {
        onFocus: userOnFocus,
        onBlur: userOnBlur,
        onDecimalInsert,
      }),
    [ctx, userOnFocus, userOnBlur, onDecimalInsert],
  );
}
