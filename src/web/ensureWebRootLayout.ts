import { Platform } from "react-native";

/**
 * Expo / RN Web: without `min-height: 100vh` on the React root, `flex:1` is often
 * 0px tall, which looks like a white blank page while DB/locale init runs.
 * Call as early as possible in the app root (e.g. first run of `App()`).
 */
export function ensureWebRootLayout() {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return;
  }
  const html = document.documentElement;
  const body = document.body;
  html.style.height = "100%";
  if (body) {
    body.style.minHeight = "100%";
    body.style.height = "100%";
    body.style.margin = "0";
  }
  const root = document.getElementById("root");
  if (root) {
    const r = root as HTMLDivElement;
    r.style.minHeight = "100vh";
    r.style.width = "100%";
  }
}
