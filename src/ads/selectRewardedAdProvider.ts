import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/** Which ad network this build ships with. Bazaar/Myket builds set "tapsell". */
export type AdNetwork = "admob" | "tapsell";

/**
 * Everything the choice depends on, passed in rather than read from globals
 * so the decision table is testable without mocking `Platform` or the env.
 */
export type ProviderEnv = {
  platform: "ios" | "android" | "web";
  /** Which network this build ships with. Bazaar/Myket builds set "tapsell". */
  network: AdNetwork;
  /** Resolved ad unit id for this platform, or null when unconfigured. */
  admobUnitId: string | null;
  admobProvider: RewardedAdProvider;
  tapsellProvider: RewardedAdProvider;
};

/**
 * Pick the rewarded-ad provider for this build.
 */
export function selectRewardedAdProvider(env: ProviderEnv): RewardedAdProvider {
  if (env.platform === "web") return noopProvider;

  // Tapsell ships no iOS SDK, so an iOS build configured for it still has to
  // fall through to AdMob rather than serve nothing.
  if (env.network === "tapsell" && env.platform === "android") {
    return env.tapsellProvider.isAvailable() ? env.tapsellProvider : noopProvider;
  }

  if (!env.admobUnitId) return noopProvider;
  if (!env.admobProvider.isAvailable()) return noopProvider;
  return env.admobProvider;
}
