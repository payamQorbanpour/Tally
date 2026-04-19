import * as Font from "expo-font";
import {
  Platform,
  StyleSheet,
  type StyleProp,
  type TextStyle,
} from "react-native";
import type { AppLocale } from "../i18n/translations";

const INTER_STACK =
  "Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", Roboto, \"Helvetica Neue\", sans-serif";

/**
 * Vazirmatn on web + Arabic-script fallbacks. Matches App.tsx `FA_WEB` (keep in sync).
 * `font-display: swap` is set on the Google Fonts link in App.tsx.
 */
export const PERSIAN_UI_WEB_FONT_STACK =
  "\"Vazirmatn\", Tahoma, \"Noto Naskh Arabic\", \"Segoe UI\", system-ui, sans-serif";

/** Vazirmatn @expo-google-fonts face names for explicit weights (avoid faux-bold on native). */
export function persianNativeFontFamilyForWeight(
  weight: TextStyle["fontWeight"] | undefined,
): string {
  const w = weight;
  if (w === "700" || w === "bold" || w === 700) return "Vazirmatn_700Bold";
  if (w === "600" || w === 600) return "Vazirmatn_600SemiBold";
  if (w === "500" || w === 500) return "Vazirmatn_500Medium";
  return "Vazirmatn_400Regular";
}

/** Persian / Arabic script (not Hebrew), for mixed EN UI + Farsi content. */
const ARABIC_SCRIPT_RE =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function containsArabicScript(text: string): boolean {
  return ARABIC_SCRIPT_RE.test(text);
}

const MONOSPACE_FONT_RE =
  /mono|Menlo|Cascadia|Consolas|ui-monospace|SFMono|Courier|Roboto Mono/i;

function styleUsesMonospaceFont(flat: TextStyle): boolean {
  const fam = flat.fontFamily;
  if (fam == null || String(fam).trim() === "") return false;
  return MONOSPACE_FONT_RE.test(String(fam));
}

/**
 * Merges Vazirmatn when `usePersianFont` (RTL locale or Arabic-script text).
 * Override is applied **last** so it wins over `uiSansTextStyle` / Inter. Skips monospace (money).
 */
export function mergePersianUiTextStyle(
  style: StyleProp<TextStyle> | undefined,
  usePersianFont: boolean,
): StyleProp<TextStyle> {
  if (!usePersianFont) return style;
  const flat = StyleSheet.flatten(style) ?? {};
  if (styleUsesMonospaceFont(flat)) {
    return style;
  }
  if (Platform.OS === "web") {
    return [style, { fontFamily: PERSIAN_UI_WEB_FONT_STACK }];
  }
  const ff = persianNativeFontFamilyForWeight(flat.fontWeight);
  if (!Font.isLoaded(ff)) {
    return style;
  }
  return [style, { fontFamily: ff, fontWeight: undefined }];
}

/**
 * Body/sans for hierarchy: Inter on web (non-fa); Vazirmatn when `locale === "fa"`.
 * On native, fa uses bundled Vazirmatn with real weights (not Inter/system faux stacks).
 */
export function uiSansTextStyle(
  overrides: TextStyle = {},
  locale?: AppLocale,
): TextStyle {
  const { fontWeight, ...rest } = overrides;

  if (Platform.OS === "web") {
    return {
      ...rest,
      ...(fontWeight !== undefined ? { fontWeight } : {}),
      fontFamily: locale === "fa" ? PERSIAN_UI_WEB_FONT_STACK : INTER_STACK,
    };
  }

  if (locale === "fa") {
    return {
      ...rest,
      fontFamily: persianNativeFontFamilyForWeight(fontWeight),
    };
  }

  return { ...overrides };
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
  const maxColWidth = Math.max(96, windowWidth * 0.52 - 32);
  const perChar = 0.62;
  const byWidth = Math.floor(maxColWidth / (n * perChar));
  const byLen = Math.floor(520 / n);
  return Math.max(min, Math.min(base, Math.min(byLen, byWidth)));
}
