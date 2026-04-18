/**
 * Tally design system — dollar green (positive), rose-500 (debt), slate-500 (neutral text).
 * Dark: layered #0B0E14 / #161B22 (no pure #000). Light: surfaces with subtle emerald-50 lift.
 */
export const lightColors = {
  bg: "#ecfdf5",
  surface: "#ffffff",
  text: "#0f172a",
  /** Slate-500: neutral / secondary */
  muted: "#64748b",
  border: "#bbf7d0",
  /** Form fields, inset panels */
  inputSurface: "#f8fafc",
  /** Green-800: deeper dollar green — brand + positive / “you’re up” */
  primary: "#166534",
  owed: "#166534",
  /** Rose-500: amounts owed (softer than harsh red) */
  owe: "#f43f5e",
  oweSoft: "#fff1f2",
  owedSoft: "#ecfdf5",
  accent: "#0f172a",
  currencyMeta: "#94a3b8",
  destructive: "#e11d48",
  /** Shadows (not black on dark) */
  shadow: "#0b0e14",
  /** Card stroke (fintech “rim”) */
  cardRim: "#bbf7d0",
} as const;

export const darkColors = {
  bg: "#0b0e14",
  surface: "#161b22",
  text: "#e2e8f0",
  muted: "#94a3b8",
  border: "#30363d",
  inputSurface: "#0d1117",
  /** Green-500: slightly deeper “dollar” accent on dark */
  primary: "#22c55e",
  owed: "#22c55e",
  owe: "#fb7185",
  oweSoft: "#1f1014",
  owedSoft: "#0c1810",
  accent: "#e2e8f0",
  currencyMeta: "#7d8a9c",
  destructive: "#f87171",
  shadow: "#050608",
  cardRim: "rgba(255, 255, 255, 0.1)",
} as const;

export type ThemeColors = typeof lightColors;

/** @deprecated Use `useTheme().colors` for appearance-aware styling. */
export const colors = lightColors;
