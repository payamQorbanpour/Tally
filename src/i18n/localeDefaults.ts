import type { AppLocale } from "./translations";

const DEFAULT_CURRENCY_BY_APP_LOCALE: Record<AppLocale, string> = {
  en: "USD",
  fa: "IRT",
  es: "EUR",
};

/**
 * Suggested `defaultCurrency` when the app language is changed (Account language picker).
 * Values are ISO-style codes the app already supports in `CURRENCY_OPTIONS`.
 */
export function defaultCurrencyForAppLocale(locale: AppLocale): string {
  return DEFAULT_CURRENCY_BY_APP_LOCALE[locale];
}

export function isRtlAppLocale(locale: AppLocale): boolean {
  return locale === "fa";
}
