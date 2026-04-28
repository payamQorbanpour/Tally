/**
 * Pass entitlement model — pure logic, no side effects.
 *
 * Tally monetizes through three time-bounded passes (Night Out / Trip /
 * Explorer) instead of a recurring subscription. A pass grants premium
 * features for a fixed window; when it ends the user keeps every piece
 * of data they entered, but newly-paid features lock again until they
 * extend or buy another pass.
 *
 * This module owns the shape, durations, and pure helpers — storage
 * lives in `tallyRepo` (`getActivePass` / `setActivePass`), and the
 * provider is `PremiumContext`.
 */

export type PassType = "night" | "trip" | "explorer";

export type ActivePass = {
  type: PassType;
  /** ISO timestamp the pass was first activated. */
  activatedAt: string;
  /**
   * ISO timestamp the pass expires. `null` is reserved for "ends when
   * the user marks the bound trip/event complete" — not currently used
   * (every pass type ships with a default duration today).
   */
  expiresAt: string | null;
  /**
   * Optional group binding. When set, the user marking that group as
   * settled / trip-complete is allowed to expire the pass early. Only
   * the Trip pass uses this in v1; Night Out and Explorer are global.
   */
  boundGroupId: string | null;
  /**
   * True once the user has applied at least one paid extension. Used by
   * the Plans screen to label the row "Extended" instead of "Active",
   * and by analytics to track extension rates.
   */
  isExtended: boolean;
};

/** Initial duration for a freshly-purchased pass. */
export const PASS_DURATIONS_MS: Record<PassType, number> = {
  night: 24 * 60 * 60 * 1000, // 24 hours
  trip: 7 * 24 * 60 * 60 * 1000, // 7 days
  explorer: 30 * 24 * 60 * 60 * 1000, // 30 days
};

/**
 * Extensions stack the same length onto the current expiry (so extending
 * before a pass runs out doesn't punish the user for extending early).
 */
export const PASS_EXTEND_MS: Record<PassType, number> = {
  night: 24 * 60 * 60 * 1000,
  trip: 7 * 24 * 60 * 60 * 1000,
  explorer: 30 * 24 * 60 * 60 * 1000,
};

export function isPassActive(
  pass: ActivePass | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!pass) return false;
  if (!pass.expiresAt) return true;
  return Date.parse(pass.expiresAt) > now;
}

export function passRemainingMs(
  pass: ActivePass | null | undefined,
  now: number = Date.now(),
): number {
  if (!pass || !pass.expiresAt) return 0;
  return Math.max(0, Date.parse(pass.expiresAt) - now);
}

export function newPass(
  type: PassType,
  opts?: { groupId?: string | null; baseExpiresAtMs?: number },
): ActivePass {
  const now = Date.now();
  const start = opts?.baseExpiresAtMs ?? now;
  const expiresAtMs = start + PASS_DURATIONS_MS[type];
  return {
    type,
    activatedAt: new Date(now).toISOString(),
    expiresAt: new Date(expiresAtMs).toISOString(),
    boundGroupId: opts?.groupId ?? null,
    isExtended: false,
  };
}

/**
 * Extend an existing pass by its standard increment. If the pass is still
 * live we stack onto its current expiry; if it already expired we restart
 * from "now". Either way, `isExtended` becomes true.
 */
export function extendedPass(
  pass: ActivePass,
  now: number = Date.now(),
): ActivePass {
  const baseMs =
    pass.expiresAt && Date.parse(pass.expiresAt) > now
      ? Date.parse(pass.expiresAt)
      : now;
  const expiresAtMs = baseMs + PASS_EXTEND_MS[pass.type];
  return {
    ...pass,
    expiresAt: new Date(expiresAtMs).toISOString(),
    isExtended: true,
  };
}

/**
 * "Mark trip complete" semantics — collapses a still-running pass to a
 * just-expired one without deleting it (so we keep the historical record
 * for analytics + the expired-pass prompt's "extend" suggestion).
 */
export function endedPass(
  pass: ActivePass,
  now: number = Date.now(),
): ActivePass {
  return {
    ...pass,
    expiresAt: new Date(now).toISOString(),
  };
}
