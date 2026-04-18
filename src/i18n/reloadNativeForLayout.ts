import { DevSettings, Platform } from "react-native";

/**
 * Full JS bundle reload. Required on iOS/Android after `I18nManager.forceRTL` for layout
 * to actually flip (RNS isRTL in JS is fixed until reload).
 * Web: no-op (use `document` dir in LocaleContext only).
 */
export function reloadNativeForLayout(): void {
  if (Platform.OS === "web") return;
  if (__DEV__) {
    try {
      DevSettings.reload();
    } catch {
      // ignore
    }
    return;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    const updates = require("expo-updates");
    if (typeof updates?.reloadAsync === "function") {
      void Promise.resolve(updates.reloadAsync()).catch(() => {
        try {
          DevSettings.reload();
        } catch {
          // ignore
        }
      });
      return;
    }
  } catch {
    // fall through
  }
  try {
    DevSettings.reload();
  } catch {
    // ignore
  }
}
