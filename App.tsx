import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Platform, StyleSheet, type ViewStyle, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { LocaleProvider, useLocale } from "./src/i18n/LocaleContext";
import { DatabaseProvider } from "./src/db/DatabaseContext";
import { RootNavigator } from "./src/navigation/RootNavigator";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";

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
  const { resolvedScheme } = useTheme();
  const { isRTL } = useLocale();
  const baseNav = resolvedScheme === "dark" ? DarkTheme : DefaultTheme;
  return (
    <View
      key={isRTL ? "rtl" : "ltr"}
      style={[
        styles.appRoot,
        { direction: isRTL ? "rtl" : "ltr" },
      ]}
    >
      <NavigationContainer
        theme={baseNav}
        direction={isRTL ? "rtl" : "ltr"}
      >
        <RootNavigator />
      </NavigationContainer>
      <StatusBar style={resolvedScheme === "dark" ? "light" : "dark"} />
    </View>
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
