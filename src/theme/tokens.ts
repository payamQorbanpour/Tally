/** Splitwise-style: teal for positive / owed to you, coral for debt. */
export const lightColors = {
  bg: "#f5f5f4",
  surface: "#ffffff",
  text: "#1a1a1a",
  muted: "#6b7280",
  border: "#e5e7eb",
  primary: "#12B886",
  owed: "#12B886",
  owe: "#FA5252",
  oweSoft: "#fff5f5",
  owedSoft: "#e6faf4",
  accent: "#111827",
  /** Metadata (currency codes) — slate-400 */
  currencyMeta: "#94a3b8",
  /** red-500 — destructive UI */
  destructive: "#ef4444",
} as const;

export const darkColors = {
  bg: "#0f0f0f",
  surface: "#1a1a1a",
  text: "#f4f4f5",
  muted: "#a1a1aa",
  border: "#27272a",
  primary: "#12B886",
  owed: "#2dd4bf",
  owe: "#f87171",
  oweSoft: "#2a1518",
  owedSoft: "#0d2620",
  accent: "#e4e4e7",
  currencyMeta: "#71717a",
  destructive: "#f87171",
} as const;

export type ThemeColors = typeof lightColors;

/** @deprecated Use `useTheme().colors` for appearance-aware styling. */
export const colors = lightColors;
