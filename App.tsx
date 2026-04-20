import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import {
  Vazirmatn_400Regular,
  Vazirmatn_500Medium,
  Vazirmatn_600SemiBold,
  Vazirmatn_700Bold,
} from "@expo-google-fonts/vazirmatn";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import {
  Component,
  type ErrorInfo,
  type ReactNode,
  useLayoutEffect,
  useMemo,
} from "react";
import { Platform, StyleSheet, type ViewStyle, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LocaleProvider, useLocale } from "./src/i18n/LocaleContext";
import { NumpadDoneProvider } from "./src/providers/NumpadDoneAccessory";
import { AuthSQLiteBinding } from "./src/auth/AuthSQLiteBinding";
import { SupabaseSessionProvider } from "./src/auth/SupabaseSessionContext";
import { DatabaseProvider } from "./src/db/DatabaseContext";
import { InviteDeepLinkHandler } from "./src/navigation/InviteDeepLinkHandler";
import { navigationRef } from "./src/navigation/navigationRef";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { Text } from "./src/ui/AppText";

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

function ThemedApp() {
  const { colors, resolvedScheme } = useTheme();
  const { isRTL, locale } = useLocale();
  /** Preload Vazirmatn on native so `mergePersianUiTextStyle` + `Font.isLoaded` succeed. */
  const [fontsLoaded] = useFonts(
    Platform.OS === "web"
      ? {}
      : {
          Vazirmatn_400Regular,
          Vazirmatn_500Medium,
          Vazirmatn_600SemiBold,
          Vazirmatn_700Bold,
          ...Ionicons.font,
        },
  );
  if (Platform.OS !== "web" && !fontsLoaded) {
    return <View style={[styles.appRoot, { backgroundColor: colors.bg }]} />;
  }
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
    /** Load even when UI is English so mixed Farsi titles/expenses use Vazirmatn. */
    if (!document.getElementById("tally-font-vazirmatn")) {
      const link = document.createElement("link");
      link.id = "tally-font-vazirmatn";
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Vazirmatn:wght@100..900&display=swap";
      document.head.appendChild(link);
    }
  }, []);
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
          ref={navigationRef}
          theme={nav}
          direction={isRTL ? "rtl" : "ltr"}
        >
          <RootNavigator />
          <InviteDeepLinkHandler />
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
          <Text style={{ color: "#94A3B8" }}>{this.state.err.message}</Text>
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
          <SupabaseSessionProvider>
            <DatabaseProvider>
              <ThemeProvider>
                <LocaleProvider>
                  <AuthSQLiteBinding />
                  <ThemedApp />
                </LocaleProvider>
              </ThemeProvider>
            </DatabaseProvider>
          </SupabaseSessionProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </RootErrorBoundary>
  );
}
