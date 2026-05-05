import type { ViewStyle } from "react-native";

/**
 * Tally design system — light + dark palettes.
 * Dark is the brand palette; light keeps a subtle brand tint.
 */
export const lightColors = {
  /** Brand (light) — canonical from Tally design system. */
  bg: "#FFFFFF",
  surface: "#FFFFFF",
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
  shadow: "rgba(6, 30, 30, 0.08)",
  cardRim: "rgba(29, 69, 68, 0.25)",
} as const;

/**
 * Dark palette — refreshed to "elevated dark" / dim teal per the design
 * system (lighter than the original near-black for less eye fatigue at night).
 */
export const darkColors = {
  bg: "#1E3F3D",
  surface: "#2A504D",
  text: "#DCE7E4",
  muted: "#94ABAA",
  border: "#3A6663",
  inputSurface: "#335E5B",
  primary: "#10B981",
  owed: "#10B981",
  owe: "#F2A0AC",
  oweSoft: "#4A2F37",
  /** Soft tint kept distinctly darker than `primary` so primary-coloured
      icons and text stay readable on top (e.g. `splitFooterOk` icon, mint
      pills with primary copy). Light mode pairs `#D7F1E6` with `#10B981`
      primary; dark mode uses this saturated mid-emerald to preserve that
      "primary on soft bg" relationship. */
  owedSoft: "#0E7A5C",
  accent: "#DCE7E4",
  currencyMeta: "#94ABAA",
  destructive: "#F2A0AC",
  shadow: "#0E2725",
  cardRim: "#3A6663",
} as const;

export type ThemeColors = typeof lightColors;

/** @deprecated Use `useTheme().colors` for appearance-aware styling. */
export const colors = lightColors;

/**
 * Named shadow tokens — mirror `ui_kits/tally_app/tokens.js`.
 * `shadowCard` for surface cards (group / friend / settings rows / settlement),
 * `shadowSegment` for segmented controls and small lifted chips,
 * `shadowFab` for the dual-half pill FAB and the equal-split highlight.
 *
 * iOS reads `shadow*`; Android reads `elevation`. RN-web honors `shadow*` via
 * its `boxShadow` shim, so a single object works everywhere.
 */
export type ShadowStyle = Pick<
  ViewStyle,
  "shadowColor" | "shadowOffset" | "shadowOpacity" | "shadowRadius" | "elevation"
>;

const lightShadows = {
  card: {
    shadowColor: "#061E1E",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 4,
  },
  segment: {
    shadowColor: "#061E1E",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  fab: {
    shadowColor: "#061E1E",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
} satisfies Record<"card" | "segment" | "fab", ShadowStyle>;

const darkShadows = {
  card: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    elevation: 4,
  },
  segment: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.28,
    shadowRadius: 3,
    elevation: 1,
  },
  fab: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 8,
    elevation: 6,
  },
} satisfies Record<"card" | "segment" | "fab", ShadowStyle>;

export type Shadows = typeof lightShadows;

export function getShadows(scheme: "light" | "dark"): Shadows {
  return scheme === "dark" ? darkShadows : lightShadows;
}
