import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Everything the choice depends on, passed in rather than read from globals
 * so the decision table is testable without mocking `Platform` or the env.
 */
export type ProviderEnv = {
  platform: "ios" | "android" | "web";
  /** Resolved ad unit id for this platform, or null when unconfigured. */
  admobUnitId: string | null;
  admobProvider: RewardedAdProvider;
};

/**
 * Pick the rewarded-ad provider for this build.
 *
 * Phase 2 (Tapsell/Adivery) adds a branch here and changes nothing else —
 * that is the point of routing every consumer through this function.
 */
export function selectRewardedAdProvider(env: ProviderEnv): RewardedAdProvider {
  if (env.platform === "web") return noopProvider;
  if (!env.admobUnitId) return noopProvider;
  if (!env.admobProvider.isAvailable()) return noopProvider;
  return env.admobProvider;
}
