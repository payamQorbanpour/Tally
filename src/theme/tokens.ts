/**
 * Tally design system — teal/cyan (primary, from logo), rose-500 (debt), slate-500 (neutral text).
 * Dark: layered #0B0E14 / #161B22 (no pure #000). Light: surfaces with subtle teal-50 lift.
 */
export const lightColors = {
  /** Brand (light) */
  // Use a subtle brand tint so light mode doesn't look washed out.
  bg: "rgba(46, 182, 125, 0.06)",
  surface: "#F8FAFC",
  text: "#061E1E",
  muted: "#94A3B8",
  border: "rgba(29, 69, 68, 0.25)",
  primary: "#2EB67D",

  /**
   * Semantic aliases used across the app.
   * Kept within the provided palette to ensure consistent theming.
   */
  inputSurface: "rgba(46, 182, 125, 0.08)",
  owed: "#2EB67D",
  owe: "#2EB67D",
  oweSoft: "rgba(46, 182, 125, 0.12)",
  owedSoft: "rgba(46, 182, 125, 0.12)",
  accent: "#061E1E",
  currencyMeta: "#94A3B8",
  destructive: "#2EB67D",
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
  primary: "#2EB67D",
  owed: "#2EB67D",
  owe: "#2EB67D",
  oweSoft: "#123635",
  owedSoft: "#123635",
  accent: "#F8FAFC",
  currencyMeta: "#94A3B8",
  destructive: "#2EB67D",
  shadow: "#061E1E",
  cardRim: "#1D4544",
} as const;

export type ThemeColors = typeof lightColors;

/** @deprecated Use `useTheme().colors` for appearance-aware styling. */
export const colors = lightColors;
