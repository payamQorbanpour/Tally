import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Web build of `tapsellProvider.ts`. Metro/webpack pick this file
 * automatically for the web target via the `.web.ts` platform extension, so
 * the real `tapsellProvider.ts` — and therefore
 * `@react-native-tapsell-mediation/tapsell` itself — is never part of the web
 * bundle's module graph at all. Deliberately self-contained rather than
 * re-exporting from `./tapsellProvider`: Metro's platform-extension resolver
 * would resolve that re-export back to this same `.web.ts` file, causing
 * infinite recursion (see bazaarBilling.web.ts for the precedent that
 * surfaced this bug).
 */

export function getTapsellZoneId(): string | null {
  return null;
}

export const tapsellProvider: RewardedAdProvider = noopProvider;
