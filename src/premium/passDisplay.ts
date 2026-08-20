/**
 * Presentation helpers shared by every surface that shows the user's
 * current pass — the Plans screen banner and the Account tab's pass card.
 *
 * Kept out of `passes.ts` on purpose: that module is pure entitlement
 * logic with no i18n dependency, and it is imported by non-UI code
 * (`passPurchaseFlow`, `PremiumContext`) that must not pull translations in.
 */

import { localizeDigits } from "../data/currencies";
import type { AppLocale } from "../i18n/translations";
import type { ActivePass, PassType } from "./passes";

type Translate = (key: string, vars?: Record<string, string>) => string;

const PASS_NAME_KEYS: Record<PassType, string> = {
  night: "plans.nightName",
  trip: "plans.tripName",
  explorer: "plans.explorerName",
};

/** Localized display name for a pass type ("Trip Pass", "پروانه سفر", …). */
export function passName(type: PassType, t: Translate): string {
  return t(PASS_NAME_KEYS[type]);
}

/** "Active" / "Extended" — the label next to the pass name. */
export function passStatusLabel(pass: ActivePass, t: Translate): string {
  return pass.isExtended
    ? t("plans.activeStatusExtended")
    : t("plans.activeStatusActive");
}

/**
 * Human "time left" string for a pass. Digits are shaped for the active
 * locale so a Farsi user doesn't get "7d 3h" in Latin numerals next to
 * Persian copy.
 */
export function formatPassRemaining(
  ms: number,
  t: Translate,
  locale?: AppLocale,
): string {
  if (ms <= 0) return t("plans.remainingExpired");
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
  const minutes = totalMinutes - days * 24 * 60 - hours * 60;
  const n = (v: number) => localizeDigits(String(v), locale);
  if (days > 0) {
    return t("plans.remainingDaysHours", { d: n(days), h: n(hours) });
  }
  if (hours > 0) {
    return t("plans.remainingHoursMinutes", { h: n(hours), m: n(minutes) });
  }
  return t("plans.remainingMinutes", { m: n(Math.max(1, minutes)) });
}
