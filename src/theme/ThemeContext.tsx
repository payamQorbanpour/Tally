import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS,
} from "../data/tallyRepo";
import { useDatabase } from "../db/DatabaseContext";
import { darkColors, lightColors, type ThemeColors } from "./tokens";

export type AppearancePref = "light" | "dark" | "system";

type ThemeContextValue = {
  colors: ThemeColors;
  appearance: AppearancePref;
  setAppearance: (a: AppearancePref) => Promise<void>;
  resolvedScheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<AppearancePref>("system");

  useEffect(() => {
    void (async () => {
      const v = await getSetting(db, SETTINGS_KEYS.appearance);
      if (v === "light" || v === "dark" || v === "system") {
        setAppearanceState(v);
      }
    })();
  }, [db]);

  const setAppearance = useCallback(
    async (a: AppearancePref) => {
      setAppearanceState(a);
      try {
        await setSetting(db, SETTINGS_KEYS.appearance, a);
      } catch (e) {
        // In-memory state already updated; only persistence failed. Log for debugging.
        if (process.env["NODE_ENV"] === "development") {
          // eslint-disable-next-line no-console
          console.warn("Tally: failed to save appearance:", e);
        }
      }
    },
    [db],
  );

  const resolvedScheme: "light" | "dark" =
    appearance === "system" ? (systemScheme ?? "light") : appearance;

  const colors = useMemo(
    (): ThemeColors =>
      (resolvedScheme === "dark" ? darkColors : lightColors) as ThemeColors,
    [resolvedScheme],
  );

  const value = useMemo(
    () => ({ colors, appearance, setAppearance, resolvedScheme }),
    [colors, appearance, setAppearance, resolvedScheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
