import { Platform, type TextStyle } from "react-native";

const INTER_STACK =
  "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", sans-serif";

/** Body/sans for hierarchy (Inter on web; system UI on native). */
export function uiSansTextStyle(overrides: TextStyle = {}): TextStyle {
  return {
    ...overrides,
    ...(Platform.OS === "web" ? { fontFamily: INTER_STACK } : {}),
  };
}

/**
 * Monospace + tabular numbers for money so decimals align (Revolut/Linear style).
 * Safe for mixed use with `Text` (does not override `fontSize` from parent).
 */
export function moneyTextStyle(): TextStyle {
  return {
    fontVariant: ["tabular-nums" as const],
    ...(Platform.OS === "web"
      ? {
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, 'Cascadia Code', Consolas, monospace",
        }
      : Platform.OS === "ios"
        ? { fontFamily: "Menlo" }
        : { fontFamily: "monospace" }),
  };
}

/**
 * Picks a font size so monospace money strings fit a narrow column without
 * `ellipsizeMode="tail"` chopping the least significant digits (Android has no
 * `adjustsFontSizeToFit` on Text).
 */
export function fitMoneyListFontSize(labelCharCount: number, windowWidth: number): number {
  const base = 16;
  const min = 10;
  const n = Math.max(1, labelCharCount);
  const maxColWidth = Math.max(80, windowWidth * 0.44 - 24);
  const perChar = 0.62;
  const byWidth = Math.floor(maxColWidth / (n * perChar));
  const byLen = Math.floor(520 / n);
  return Math.max(min, Math.min(base, Math.min(byLen, byWidth)));
}
