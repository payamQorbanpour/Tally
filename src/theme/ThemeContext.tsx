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
import { useDatabase, useTallyData } from "../db/DatabaseContext";
import { pushProfilePrefs } from "../sync/profilePrefsSync";
import {
  darkColors,
  getShadows,
  lightColors,
  type Shadows,
  type ThemeColors,
} from "./tokens";

export type AppearancePref = "light" | "dark" | "system";

type ThemeContextValue = {
  colors: ThemeColors;
  shadows: Shadows;
  appearance: AppearancePref;
  setAppearance: (a: AppearancePref) => Promise<void>;
  resolvedScheme: "light" | "dark";
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const { dataRevision } = useTallyData();
  const systemScheme = useColorScheme();
  const [appearance, setAppearanceState] = useState<AppearancePref>("system");

  // Re-read on mount AND whenever `dataRevision` bumps — the sign-in flow
  // hydrates `app_settings.appearance` from the cloud and then calls
  // `bumpDataRevision()`, so picking up the new value without an app reload
  // is the whole point of listening here.
  useEffect(() => {
    void (async () => {
      const v = await getSetting(db, SETTINGS_KEYS.appearance);
      const next: AppearancePref =
        v === "light" || v === "dark" || v === "system" ? v : "system";
      setAppearanceState((prev) => (prev === next ? prev : next));
    })();
  }, [db, dataRevision]);

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
      void pushProfilePrefs({ appearance: a });
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

  const shadows = useMemo((): Shadows => getShadows(resolvedScheme), [resolvedScheme]);

  const value = useMemo(
    () => ({ colors, shadows, appearance, setAppearance, resolvedScheme }),
    [colors, shadows, appearance, setAppearance, resolvedScheme],
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
