/**
 * The running app's version, and the force-update comparison.
 *
 * `currentAppVersion` is the resolution `src/observability/sentry.ts` already
 * performed inline; it lives here now so the two cannot drift.
 */
import Constants from "expo-constants";

/** The build's `version` from app.json, or null when it cannot be determined. */
export function currentAppVersion(): string | null {
  const v =
    Constants.expoConfig?.version ??
    (Constants.manifest2 as { extra?: { expoClient?: { version?: string } } } | undefined)?.extra
      ?.expoClient?.version;
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Strict `major.minor.patch` of digits. Anything else is unparseable. */
function parse(v: string): [number, number, number] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * True only when we are CERTAIN the client is below the floor.
 *
 * Fails open on every uncertain input — unknown local version, malformed
 * remote value, prerelease suffix. A force-update screen that fires wrongly
 * bricks the app for the entire install base, which is strictly worse than
 * whatever shipping an old client costs.
 */
export function isBelowMinimum(current: string | null, minimum: string): boolean {
  if (!current) return false;
  const a = parse(current);
  const b = parse(minimum);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}
