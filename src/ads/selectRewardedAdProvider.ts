import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Which ad network this build ships with. Bazaar/Myket builds set "tapsell"
 * or "adivery".
 */
export type AdNetwork = "admob" | "tapsell" | "adivery";

/**
 * Everything the choice depends on, passed in rather than read from globals
 * so the decision table is testable without mocking `Platform` or the env.
 */
export type ProviderEnv = {
  platform: "ios" | "android" | "web";
  /** Which network this build ships with. See `AdNetwork`. */
  network: AdNetwork;
  /** Resolved ad unit id for this platform, or null when unconfigured. */
  admobUnitId: string | null;
  admobProvider: RewardedAdProvider;
  tapsellProvider: RewardedAdProvider;
  adiveryProvider: RewardedAdProvider;
};

/**
 * Pick the rewarded-ad provider for this build.
 */
export function selectRewardedAdProvider(env: ProviderEnv): RewardedAdProvider {
  if (env.platform === "web") return noopProvider;

  // Neither Iranian network ships an iOS SDK, so an iOS build configured for
  // one still has to fall through to AdMob rather than serve nothing.
  //
  // No cross-network fallback on Android either: a build configured for one
  // of these is a Bazaar/Myket build, where AdMob is unavailable anyway, so
  // an unavailable provider means no ads rather than "try the other one".
  if (env.platform === "android") {
    if (env.network === "tapsell") {
      return env.tapsellProvider.isAvailable() ? env.tapsellProvider : noopProvider;
    }
    if (env.network === "adivery") {
      return env.adiveryProvider.isAvailable() ? env.adiveryProvider : noopProvider;
    }
  }

  if (!env.admobUnitId) return noopProvider;
  if (!env.admobProvider.isAvailable()) return noopProvider;
  return env.admobProvider;
}
