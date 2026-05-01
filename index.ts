import "react-native-gesture-handler";
import { registerRootComponent } from "expo";
import { Platform } from "react-native";
// eslint-disable-next-line import/no-unresolved -- resolves after `npm install expo-splash-screen`.
import * as SplashScreen from "expo-splash-screen";
// Initialized BEFORE `App` so any error during App import is captured. The
// `eslint-disable-next-line import/first` lets us run init() between the
// imports without reordering them.
import { initSentry, wrapWithSentry } from "./src/observability/sentry";

// Hold the native iOS / Android splash until the app explicitly hides it
// from `App.tsx` (after fonts + onboarding flag are ready). Without this,
// the OS dismisses the splash the moment React Native lays out its first
// `<View>`, causing a brief flash of the unstyled background-color view
// before the real UI is mounted. Best-effort — failing silently is fine,
// the worst case is just the auto-hide behavior we'd have anyway.
try {
  void SplashScreen.preventAutoHideAsync();
} catch {
  /* ignore — splash will auto-hide as before */
}

initSentry();

// eslint-disable-next-line import/first
import App from "./App";
// eslint-disable-next-line import/first
import { ensureWebRootLayout } from "./src/web/ensureWebRootLayout";

if (Platform.OS === "web") {
  ensureWebRootLayout();
}

// `Sentry.wrap` enables touch breadcrumbs + sets up the error boundary
// hook for native crash capture. On web it's a passthrough.
const RootApp = wrapWithSentry(App);

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootApp);
