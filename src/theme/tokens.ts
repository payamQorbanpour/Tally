/**
 * Tally design system — light + dark palettes.
 * Dark is the brand palette; light keeps a subtle brand tint.
 */
export const lightColors = {
  /** Brand (light) */
  // Use a subtle brand tint so light mode doesn't look washed out.
  // Must be opaque to avoid screen “bleed-through” during navigation transitions.
  bg: "#EAF7F1",
  surface: "#F8FAFC",
  text: "#061E1E",
  muted: "#94A3B8",
  border: "rgba(29, 69, 68, 0.25)",
  primary: "#10B981",

  /**
   * Semantic aliases used across the app.
   * Kept within the provided palette to ensure consistent theming.
   */
  inputSurface: "#DDF3EA",
  owed: "#10B981",
  owe: "#EF4444",
  oweSoft: "#FEE2E2",
  owedSoft: "#D7F1E6",
  accent: "#061E1E",
  currencyMeta: "#94A3B8",
  destructive: "#EF4444",
  shadow: "rgba(6, 30, 30, 0.22)",
  cardRim: "rgba(29, 69, 68, 0.25)",
} as const;

export const darkColors = {
  bg: "#061E1E",
  surface: "#123635",
  text: "#F8FAFC",
  muted: "#94A3B8",
  border: "#1D4544",
  inputSurface: "#123635",
  /** Green (#2EB67D): brand primary on dark */
  primary: "#34D399",
  owed: "#34D399",
  owe: "#FB7185",
  oweSoft: "#2A1C24",
  owedSoft: "#123635",
  accent: "#F8FAFC",
  currencyMeta: "#94A3B8",
  destructive: "#FB7185",
  shadow: "#061E1E",
  cardRim: "#1D4544",
} as const;

export type ThemeColors = typeof lightColors;

/** @deprecated Use `useTheme().colors` for appearance-aware styling. */
export const colors = lightColors;
