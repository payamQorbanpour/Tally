import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useLayoutEffect,
  useMemo,
} from "react";
import { Platform, StyleSheet, type ViewStyle, Text, TextInput, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocaleProvider, useLocale } from "./src/i18n/LocaleContext";
import { NumpadDoneProvider } from "./src/providers/NumpadDoneAccessory";
import { DatabaseProvider } from "./src/db/DatabaseContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import type { AppLocale } from "./src/i18n/translations";

/** `flex: 1` alone is often 0px tall in browsers unless `html/body/#root` are sized; this makes the app visible. */
const styles = StyleSheet.create({
  // Cast: "100vh" is valid in react-native-web and included in a wider `DimensionValue` in newer RN.
  appRoot: {
    flex: 1,
    ...(Platform.OS === "web" && {
      minHeight: "100vh",
      width: "100%",
    }),
  } as ViewStyle,
});

const INTER_WEB =
  "Inter, system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif";
/** Inter has no Persian glyphs; stack Vazirmatn + system Arabic-capable fonts for fa. */
const FA_WEB =
  "\"Vazirmatn\", Tahoma, \"Noto Naskh Arabic\", \"Segoe UI\", system-ui, sans-serif";

type WebTextWithDefaults = {
  defaultProps?: { style?: unknown; allowFontSizeMultiplier?: boolean };
};

let lastWebTextFontLocale: AppLocale | null = null;

function syncWebDefaultTextFont(locale: AppLocale) {
  if (Platform.OS !== "web") return;
  if (lastWebTextFontLocale === locale) return;
  lastWebTextFontLocale = locale;
  const fontFamily = locale === "fa" ? FA_WEB : INTER_WEB;
  const T = Text as unknown as WebTextWithDefaults;
  const TI = TextInput as unknown as WebTextWithDefaults;
  T.defaultProps = {
    ...T.defaultProps,
    allowFontSizeMultiplier: T.defaultProps?.allowFontSizeMultiplier,
    style: [T.defaultProps?.style, { fontFamily }],
  };
  TI.defaultProps = {
    ...TI.defaultProps,
    style: [TI.defaultProps?.style, { fontFamily }],
  };
}

function ThemedApp() {
  const { colors, resolvedScheme } = useTheme();
  const { isRTL, locale } = useLocale();
  syncWebDefaultTextFont(locale);
  const baseNav = resolvedScheme === "dark" ? DarkTheme : DefaultTheme;
  const nav = useMemo(
    () => ({
      ...baseNav,
      colors: {
        ...baseNav.colors,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        primary: colors.primary,
        notification: colors.owe,
      },
    }),
    [baseNav, colors],
  );

  useLayoutEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (!document.getElementById("tally-font-inter")) {
      const link = document.createElement("link");
      link.id = "tally-font-inter";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
    if (locale === "fa" && !document.getElementById("tally-font-vazirmatn")) {
      const link = document.createElement("link");
      link.id = "tally-font-vazirmatn";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap";
      document.head.appendChild(link);
    }
  }, [locale]);
  return (
    <NumpadDoneProvider>
      <View
        key={isRTL ? "rtl" : "ltr"}
        style={[
          styles.appRoot,
          { direction: isRTL ? "rtl" : "ltr" },
        ]}
      >
        <NavigationContainer
          theme={nav}
          direction={isRTL ? "rtl" : "ltr"}
        >
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style={resolvedScheme === "dark" ? "light" : "dark"} />
      </View>
    </NumpadDoneProvider>
  );
}

class RootErrorBoundary extends Component<
  { children: ReactNode },
  { err: Error | null }
> {
  state: { err: null | Error } = { err: null };
  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }
  componentDidCatch(e: Error, _info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
  render() {
    if (this.state.err) {
      return (
        <View
          style={{
            flex: 1,
            padding: 24,
            justifyContent: "center",
            ...(Platform.OS === "web" && { minHeight: "100vh" }),
          } as ViewStyle}
        >
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
            Something went wrong
          </Text>
          <Text style={{ color: "#666" }}>{this.state.err.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <RootErrorBoundary>
      <GestureHandlerRootView style={styles.appRoot}>
        <SafeAreaProvider style={styles.appRoot}>
          <DatabaseProvider>
            <ThemeProvider>
              <LocaleProvider>
                <ThemedApp />
              </LocaleProvider>
            </ThemeProvider>
          </DatabaseProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
