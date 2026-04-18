import { reloadAppAsync } from "expo";
import { DevSettings, Platform } from "react-native";

/**
 * Full JS bundle reload. Required on iOS/Android after `I18nManager.forceRTL` for layout
 * to actually flip (RNS isRTL in JS is fixed until reload).
 * Web: no-op (use `document` dir in LocaleContext only).
 *
 * Prefer `expo`'s `reloadAppAsync` — it works in debug and release; `DevSettings.reload`
 * is unreliable in some Expo dev-client setups.
 */
export function reloadNativeForLayout(): void {
  if (Platform.OS === "web") return;
  void reloadAppAsync("layout-direction").catch(() => {
    try {
      DevSettings.reload();
    } catch {
      // ignore
    }
  });
}
