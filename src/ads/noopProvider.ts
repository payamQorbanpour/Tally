import type { RewardedAdProvider } from "./rewardedAdProvider";

/**
 * Stands in wherever no ad SDK can run: the web build, Expo Go, and any
 * release built without an ad unit id configured.
 *
 * `isAvailable()` returning false is what drives `resolveAiAccess` to
 * `no_ads_available`, which shows the "continue on mobile" copy instead of a
 * watch-ad button.
 */
export const noopProvider: RewardedAdProvider = {
  id: "none",
  isAvailable: () => false,
  show: async () => ({ kind: "failed", reason: "no_provider" }),
};
