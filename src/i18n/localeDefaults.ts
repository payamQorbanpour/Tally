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

/**
 * Region fallback used only when the phone's language is not one we ship.
 * Farsi is the nearest supported language for AF/PK rather than the native one
 * (Dari/Pashto, Urdu) — revisit once those translations exist.
 */
const APP_LOCALE_BY_REGION: Record<string, AppLocale> = {
  IR: "fa",
  AF: "fa",
  PK: "fa",
};

/** The subset of `expo-localization`'s `Locale` this module depends on. */
export type DeviceLocale = {
  languageCode?: string | null;
  languageTag?: string | null;
  regionCode?: string | null;
};

// The "es" branch was deliberately removed here (Spanish is soft-disabled;
// see docs/superpowers/specs/2026-08-05-farsi-rtl-batch-a-design.md §2).
function appLocaleForLanguage(tag: string | null | undefined): AppLocale | null {
  const lang = tag?.trim().toLowerCase().split(/[-_]/)[0];
  if (lang === "fa") return "fa";
  return null;
}

/** Device region ("where the user is"), preferred over the language tag's region. */
function regionOf(loc: DeviceLocale): string | null {
  const direct = loc.regionCode?.trim().toUpperCase();
  if (direct && /^[A-Z]{2}$/.test(direct)) return direct;
  const fromTag = loc.languageTag
    ?.split(/[-_]/)
    .slice(1)
    .find((part) => /^[A-Za-z]{2}$/.test(part));
  return fromTag ? fromTag.toUpperCase() : null;
}

const SHIPPED_LOCALES: readonly string[] = ["en", "fa", "es"];

function asAppLocale(v: string | undefined | null): AppLocale | null {
  const s = v?.trim().toLowerCase();
  return s && SHIPPED_LOCALES.includes(s) ? (s as AppLocale) : null;
}

export type LocaleOverrides = {
  /**
   * Remote `locale_region_map`. MERGED over the bundled map, not a
   * replacement — an operator adding one region must not have to re-list
   * every bundled one to avoid silently dropping it (losing IR -> fa would
   * break first-run Farsi for Iran, the case this whole system exists for).
   * Per-region override still works: an entry for a bundled region wins.
   */
  regionMap?: Record<string, string>;
  /** Remote `locale_default`. Replaces "en" as the last resort. */
  fallback?: string;
};

/**
 * Initial app language for a first-run device, from the OS's ordered list of
 * preferred locales. An explicit Farsi phone language always wins; only when
 * none of the preferred languages is one we ship does region decide. So an
 * English phone in Iran gets Farsi, but a Farsi phone in Spain stays Farsi.
 *
 * Remote overrides can extend the region map and change the last-resort
 * default, but can never outrank the device's own language — that is the
 * strongest preference a user expresses without opening a settings screen, and
 * a server should not overrule it.
 *
 * Unknown locale codes in remote values are ignored rather than trusted; the
 * shipped set is what the bundle can actually render.
 */
export function resolveAppLocale(
  locales: readonly DeviceLocale[],
  overrides?: LocaleOverrides,
): AppLocale {
  for (const loc of locales) {
    const byLanguage = appLocaleForLanguage(loc.languageCode ?? loc.languageTag);
    if (byLanguage) return byLanguage;
  }

  // Merge, don't replace: a remote map naming one region extends the bundled
  // one rather than shadowing it. See `LocaleOverrides.regionMap`.
  const regionMap = { ...APP_LOCALE_BY_REGION, ...(overrides?.regionMap ?? {}) };
  for (const loc of locales) {
    const region = regionOf(loc);
    const byRegion = region ? asAppLocale(regionMap[region]) : null;
    if (byRegion) return byRegion;
  }

  return asAppLocale(overrides?.fallback) ?? "en";
}
