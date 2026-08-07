import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Web build of `adiveryProvider.ts`. Metro/webpack pick this file
 * automatically for the web target via the `.web.ts` platform extension, so
 * the real `adiveryProvider.ts` — and therefore the `adivery` package itself —
 * is never part of the web bundle's module graph at all. Deliberately
 * self-contained rather than re-exporting from `./adiveryProvider`: Metro's
 * platform-extension resolver would resolve that re-export back to this same
 * `.web.ts` file, causing infinite recursion (see tapsellProvider.web.ts and
 * bazaarBilling.web.ts for the precedent that surfaced this bug).
 */

export function getAdiveryAppId(): string | null {
  return null;
}

export function getAdiveryRewardedPlacementId(): string | null {
  return null;
}

export const adiveryProvider: RewardedAdProvider = noopProvider;
