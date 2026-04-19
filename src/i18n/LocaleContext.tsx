import * as Localization from "expo-localization";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  ActivityIndicator,
  I18nManager,
  Platform,
  StyleSheet,
  View,
  type ViewStyle,
} from "react-native";
import { isValidCurrencyCode } from "../data/currencies";
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS,
} from "../data/tallyRepo";
import { useDatabase } from "../db/DatabaseContext";
import { defaultCurrencyForAppLocale } from "./localeDefaults";
import { reloadNativeForLayout } from "./reloadNativeForLayout";
import type { AppLocale } from "./translations";
import { translations } from "./translations";

function getByPath(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

function applyLayoutDirection(locale: AppLocale) {
  const rtl = locale === "fa";
  if (Platform.OS === "web") {
    if (typeof document !== "undefined") {
      const dir = rtl ? "rtl" : "ltr";
      document.documentElement.setAttribute("dir", dir);
      document.documentElement.setAttribute("lang", locale);
      document.body?.setAttribute("dir", dir);
    }
    return;
  }
  I18nManager.allowRTL(true);
  if (Platform.OS === "android") {
    I18nManager.swapLeftAndRightInRTL(true);
  }
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
  }
}

/** True when JS `I18nManager.isRTL` disagrees with the locale we want (must reload native for layout). */
function nativeLayoutDirectionMismatch(locale: AppLocale): boolean {
  if (Platform.OS === "web") return false;
  return (locale === "fa") !== I18nManager.isRTL;
}

/**
 * User toggled Farsi vs non-Farsi. Always reload native: `I18nManager.isRTL` can match the system
 * (e.g. RTL phone locale) while the app still needs a restart for layout/strings after our change.
 */
function crossesAppRtlBoundary(
  previous: AppLocale | null,
  next: AppLocale,
): boolean {
  if (Platform.OS === "web" || previous === null) return false;
  return (previous === "fa") !== (next === "fa");
}

function deviceDefaultLocale(): AppLocale {
  const loc = Localization.getLocales()[0];
  const tag = (loc?.languageTag ?? loc?.languageCode ?? "").toLowerCase();
  if (tag === "fa" || tag.startsWith("fa-")) return "fa";
  if (tag === "es" || tag.startsWith("es-")) return "es";
  return "en";
}

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (l: AppLocale) => Promise<void>;
  t: (path: string, vars?: Record<string, string>) => string;
  isRTL: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const db = useDatabase();
  const [locale, setLocaleState] = useState<AppLocale | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const raw = await getSetting(db, SETTINGS_KEYS.locale);
        const v = raw?.trim() ?? null;
        const l: AppLocale =
          v === "en" || v === "fa" || v === "es" ? v : deviceDefaultLocale();

        if (nativeLayoutDirectionMismatch(l)) {
          applyLayoutDirection(l);
          await setSetting(db, SETTINGS_KEYS.locale, l);
          await setSetting(db, SETTINGS_KEYS.rtlNativeBootstrap, "1");
          setLocaleState(l);
          reloadNativeForLayout();
          return;
        }

        applyLayoutDirection(l);
        setLocaleState(l);
      } catch {
        const l = deviceDefaultLocale();
        applyLayoutDirection(l);
        setLocaleState(l);
      }
    })();
  }, [db]);

  useLayoutEffect(() => {
    if (locale == null) return;
    applyLayoutDirection(locale);
  }, [locale]);

  const setLocale = useCallback(
    async (l: AppLocale) => {
      if (
        locale != null &&
        l === locale &&
        !nativeLayoutDirectionMismatch(l)
      ) {
        return;
      }

      const repairingRtlOnly =
        locale != null && l === locale && nativeLayoutDirectionMismatch(l);

      if (!repairingRtlOnly) {
        await setSetting(db, SETTINGS_KEYS.locale, l);
        const cur = defaultCurrencyForAppLocale(l);
        if (isValidCurrencyCode(cur)) {
          await setSetting(db, SETTINGS_KEYS.defaultCurrency, cur);
        }
      }

      const needNativeReloadForRtl =
        Platform.OS !== "web" &&
        (nativeLayoutDirectionMismatch(l) || crossesAppRtlBoundary(locale, l));

      if (needNativeReloadForRtl) {
        await setSetting(db, SETTINGS_KEYS.rtlNativeBootstrap, "1");
        applyLayoutDirection(l);
        setLocaleState(l);
        reloadNativeForLayout();
        return;
      }

      applyLayoutDirection(l);
      setLocaleState(l);
    },
    [db, locale],
  );

  const t = useCallback(
    (path: string, vars?: Record<string, string>) => {
      if (locale == null) return path;
      const tree = translations[locale] as unknown;
      let s = getByPath(tree, path);
      if (s === undefined) {
        s = getByPath(translations.en as unknown, path) ?? path;
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          s = s.replaceAll(`{{${k}}}`, v);
        }
      }
      return s;
    },
    [locale],
  );

  const isRTL = locale === "fa";

  const value = useMemo((): LocaleContextValue | null => {
    if (locale == null) return null;
    return { locale, setLocale, t, isRTL };
  }, [locale, setLocale, t, isRTL]);

  if (value == null) {
    return (
      <View
        style={[
          styles.hydrate,
          Platform.OS === "web" && styles.hydrateWeb,
        ]}
        accessibilityState={{ busy: true }}
        accessibilityLabel="Loading"
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

const styles = StyleSheet.create({
  /** Avoid wrong LTR/RTL on first frame before the saved locale is applied. */
  hydrate: { flex: 1, backgroundColor: "#f5f5f4" },
  /** Web: parent flex is often 0px until html/body/root are full-height. */
  hydrateWeb: { minHeight: "100vh", width: "100%" } as unknown as ViewStyle,
});

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within LocaleProvider");
  return ctx;
}

/** For shared UI (e.g. `AppText`) that may render outside `LocaleProvider` (DB splash/errors). */
export function useOptionalLocale(): AppLocale | null {
  return useContext(LocaleContext)?.locale ?? null;
}
