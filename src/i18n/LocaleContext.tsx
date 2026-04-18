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
import {
  defaultCurrencyForAppLocale,
  isRtlAppLocale,
} from "./localeDefaults";
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
  if (I18nManager.isRTL !== rtl) {
    I18nManager.forceRTL(rtl);
  }
}

function deviceDefaultLocale(): AppLocale {
  const code = Localization.getLocales()[0]?.languageCode?.toLowerCase() ?? "";
  if (code === "fa" || code.startsWith("fa")) return "fa";
  if (code === "es" || code.startsWith("es")) return "es";
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
        const v = await getSetting(db, SETTINGS_KEYS.locale);
        const l: AppLocale =
          v === "en" || v === "fa" || v === "es" ? v : deviceDefaultLocale();

        if (Platform.OS !== "web" && l === "fa") {
          const done = await getSetting(db, SETTINGS_KEYS.rtlNativeBootstrap);
          if (done !== "1") {
            await setSetting(db, SETTINGS_KEYS.rtlNativeBootstrap, "1");
            applyLayoutDirection(l);
            setLocaleState(l);
            reloadNativeForLayout();
            return;
          }
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
      if (locale != null && l === locale) return;
      const prev: AppLocale | null = locale;

      await setSetting(db, SETTINGS_KEYS.locale, l);
      const cur = defaultCurrencyForAppLocale(l);
      if (isValidCurrencyCode(cur)) {
        await setSetting(db, SETTINGS_KEYS.defaultCurrency, cur);
      }

      const needNativeReloadForRtl =
        Platform.OS !== "web" &&
        ((prev == null
          ? false
          : isRtlAppLocale(prev) !== isRtlAppLocale(l)) as boolean);

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
