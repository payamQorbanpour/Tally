import { guardNetworkCall } from "../core/networkGuard";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import {
  getSetting,
  setSetting,
  SETTINGS_KEYS,
} from "../data/tallyRepo";
import { isValidCurrencyCode } from "../data/currencies";
import { DEFAULT_LOCAL_USER_ID, getLocalUserId } from "../db/ids";
import type { TallyDb } from "../db/tallyDb";
import type { AppLocale } from "../i18n/translations";
import type { AppearancePref } from "../theme/ThemeContext";

/**
 * Preferences synced to the remote `public.profiles` row. Cloud sync toggle
 * is intentionally **not** included — it's device-local so a user can have
 * sync on their phone and off on a shared laptop.
 */
export type ProfilePrefsPatch = Partial<{
  locale: AppLocale;
  defaultCurrency: string;
  appearance: AppearancePref;
}>;

const VALID_LOCALES: ReadonlySet<string> = new Set(["en", "fa", "es"]);
const VALID_APPEARANCE: ReadonlySet<string> = new Set(["light", "dark", "system"]);

function isSignedIn(): boolean {
  return getLocalUserId() !== DEFAULT_LOCAL_USER_ID;
}

/**
 * Upsert one or more preference values onto the authenticated user's
 * `public.profiles` row. No-op when not signed in. Best-effort.
 */
export async function pushProfilePrefs(patch: ProfilePrefsPatch): Promise<void> {
  if (!isSignedIn()) return;
  const client = createTallySupabaseClient();
  if (!client) return;
  const row: Record<string, unknown> = {
    id: getLocalUserId(),
    updated_at: new Date().toISOString(),
  };
  if (patch.locale !== undefined) row.preferred_locale = patch.locale;
  if (patch.defaultCurrency !== undefined) row.default_currency = patch.defaultCurrency;
  if (patch.appearance !== undefined) row.appearance = patch.appearance;
  // Nothing to update beyond `id`/`updated_at` — skip the network round-trip.
  if (Object.keys(row).length <= 2) return;
  try {
    await guardNetworkCall(() =>
      client.from("profiles").upsert(row, { onConflict: "id" }),
    );
  } catch {
    /* best-effort */
  }
}

/**
 * Push the device's current locale / currency / appearance preferences up.
 * Called on sign-in so the remote row reflects the prefs the user had set
 * before authenticating. No-op when not signed in.
 */
export async function pushAllCurrentProfilePrefs(db: TallyDb): Promise<void> {
  if (!isSignedIn()) return;
  const [locale, currency, appearance] = await Promise.all([
    getSetting(db, SETTINGS_KEYS.locale),
    getSetting(db, SETTINGS_KEYS.defaultCurrency),
    getSetting(db, SETTINGS_KEYS.appearance),
  ]);
  const patch: ProfilePrefsPatch = {};
  if (locale && VALID_LOCALES.has(locale)) {
    patch.locale = locale as AppLocale;
  }
  if (currency && isValidCurrencyCode(currency)) {
    patch.defaultCurrency = currency.toUpperCase();
  }
  if (appearance && VALID_APPEARANCE.has(appearance)) {
    patch.appearance = appearance as AppearancePref;
  }
  if (Object.keys(patch).length === 0) return;
  await pushProfilePrefs(patch);
}

/**
 * Pull the signed-in user's remembered preferences from Supabase into the
 * local `app_settings` table. Returns the resolved patch so the caller can
 * push it into the in-memory contexts (Locale/Theme) without waiting for a
 * focus re-read.
 *
 * Local settings win when already set — remote only fills gaps, so a user
 * who changed settings offline won't have them overwritten on sign-in.
 * Pass `overwriteLocal: true` to force remote-wins (used on a fresh device).
 */
export async function hydrateProfilePrefs(
  db: TallyDb,
  options: { overwriteLocal?: boolean } = {},
): Promise<ProfilePrefsPatch> {
  const applied: ProfilePrefsPatch = {};
  if (!isSignedIn()) return applied;
  const client = createTallySupabaseClient();
  if (!client) return applied;

  let remote: {
    preferred_locale?: string | null;
    default_currency?: string | null;
    appearance?: string | null;
  } | null = null;
  try {
    const { data, error } = await guardNetworkCall(() =>
      client
        .from("profiles")
        .select("preferred_locale, default_currency, appearance")
        .eq("id", getLocalUserId())
        .maybeSingle(),
    );
    if (!error && data) remote = data as typeof remote;
  } catch {
    return applied;
  }
  if (!remote) return applied;

  const { overwriteLocal = false } = options;

  // Locale
  const remoteLocale = (remote.preferred_locale ?? "").trim();
  if (remoteLocale && VALID_LOCALES.has(remoteLocale)) {
    const cur = await getSetting(db, SETTINGS_KEYS.locale);
    if (overwriteLocal || !cur) {
      await setSetting(db, SETTINGS_KEYS.locale, remoteLocale);
      applied.locale = remoteLocale as AppLocale;
    }
  }

  // Default currency
  const remoteCurrency = (remote.default_currency ?? "").trim().toUpperCase();
  if (remoteCurrency && isValidCurrencyCode(remoteCurrency)) {
    const cur = await getSetting(db, SETTINGS_KEYS.defaultCurrency);
    if (overwriteLocal || !cur) {
      await setSetting(db, SETTINGS_KEYS.defaultCurrency, remoteCurrency);
      applied.defaultCurrency = remoteCurrency;
    }
  }

  // Appearance
  const remoteAppearance = (remote.appearance ?? "").trim();
  if (remoteAppearance && VALID_APPEARANCE.has(remoteAppearance)) {
    const cur = await getSetting(db, SETTINGS_KEYS.appearance);
    if (overwriteLocal || !cur) {
      await setSetting(db, SETTINGS_KEYS.appearance, remoteAppearance);
      applied.appearance = remoteAppearance as AppearancePref;
    }
  }

  return applied;
}
