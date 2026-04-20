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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  type ViewStyle,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LocaleProvider, useLocale } from "./src/i18n/LocaleContext";
import { NumpadDoneProvider } from "./src/providers/NumpadDoneAccessory";
import { AuthSQLiteBinding } from "./src/auth/AuthSQLiteBinding";
import { SupabaseSessionProvider } from "./src/auth/SupabaseSessionContext";
import { DatabaseProvider, useDatabase } from "./src/db/DatabaseContext";
import { InviteDeepLinkHandler } from "./src/navigation/InviteDeepLinkHandler";
import { navigationRef } from "./src/navigation/navigationRef";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { Text } from "./src/ui/AppText";
import { createAutoErrorReport } from "./src/data/tallyRepo";

/** Matches splash artwork; keeps letterboxing edges consistent. */
const STARTUP_GREETING_BG = "#123635";

const SPLASH_FADE_IN_MS = 420;
/** Time at full opacity after fade-in completes (before fade-out). */
const SPLASH_HOLD_MS = 2000;
const SPLASH_FADE_OUT_MS = 420;

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
  startupOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
});

function StartupGreeting({ onFinished }: { onFinished: () => void }) {
  const { t } = useLocale();
  const { width: sw, height: sh } = Dimensions.get("window");
  const artSize = Math.min(sw - 48, sh * 0.52, 440);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: SPLASH_FADE_IN_MS,
        useNativeDriver: true,
      }),
      Animated.delay(SPLASH_HOLD_MS),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SPLASH_FADE_OUT_MS,
        useNativeDriver: true,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onFinished();
    });
    return () => anim.stop();
  }, [opacity, onFinished]);

  return (
    <View
      style={[styles.startupOverlay, { backgroundColor: STARTUP_GREETING_BG }]}
      accessibilityRole="header"
    >
      <Animated.Image
        source={require("./assets/Tally-Slogan.png")}
        style={{ width: artSize, height: artSize, opacity }}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel={t("startup.appName")}
      />
    </View>
  );
}

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
  const [showGreeting, setShowGreeting] = useState(true);
  const dismissGreeting = useCallback(() => setShowGreeting(false), []);

  if (Platform.OS !== "web" && !fontsLoaded) {
    return (
      <View style={[styles.appRoot, { backgroundColor: STARTUP_GREETING_BG }]} />
    );
  }
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
        {showGreeting ? <StartupGreeting onFinished={dismissGreeting} /> : null}
      </View>
    </NumpadDoneProvider>
  );
}

class RootErrorBoundary extends Component<
  { children: ReactNode; onError?: (e: Error, info: ErrorInfo) => void },
  { err: Error | null }
> {
  state: { err: null | Error } = { err: null };
  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }
  componentDidCatch(e: Error, _info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(e);
    try {
      this.props.onError?.(e, _info);
    } catch {
      // best-effort
    }
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

function DbErrorCapture({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const installedRef = useRef(false);

  const report = useCallback(
    async (err: unknown, extra?: Record<string, unknown>) => {
      try {
        await createAutoErrorReport(db, err, extra);
      } catch {
        // best-effort
      }
    },
    [db],
  );

  useEffect(() => {
    if (installedRef.current) return;
    installedRef.current = true;

    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onError = (ev: ErrorEvent) => {
        void report(ev.error ?? ev.message, {
          source: "window.error",
          filename: ev.filename,
          lineno: ev.lineno,
          colno: ev.colno,
        });
      };
      const onRejection = (ev: PromiseRejectionEvent) => {
        void report(ev.reason, { source: "window.unhandledrejection" });
      };
      window.addEventListener("error", onError);
      window.addEventListener("unhandledrejection", onRejection);
      return () => {
        window.removeEventListener("error", onError);
        window.removeEventListener("unhandledrejection", onRejection);
      };
    }

    const eu = (globalThis as unknown as { ErrorUtils?: any }).ErrorUtils;
    if (eu?.getGlobalHandler && eu?.setGlobalHandler) {
      const prev = eu.getGlobalHandler();
      eu.setGlobalHandler((err: unknown, isFatal?: boolean) => {
        void report(err, { source: "ErrorUtils", isFatal: Boolean(isFatal) });
        try {
          prev?.(err, isFatal);
        } catch {
          // ignore
        }
      });
      return () => {
        try {
          eu.setGlobalHandler(prev);
        } catch {
          // ignore
        }
      };
    }
    return;
  }, [report]);

  return (
    <RootErrorBoundary
      onError={(e, info) =>
        void report(e, {
          source: "react.error_boundary",
          componentStack: info.componentStack,
        })
      }
    >
      {children}
    </RootErrorBoundary>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={styles.appRoot}>
      <SafeAreaProvider style={styles.appRoot}>
        <SupabaseSessionProvider>
          <DatabaseProvider>
            <DbErrorCapture>
              <ThemeProvider>
                <LocaleProvider>
                  <AuthSQLiteBinding />
                  <ThemedApp />
                </LocaleProvider>
              </ThemeProvider>
            </DbErrorCapture>
          </DatabaseProvider>
        </SupabaseSessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
