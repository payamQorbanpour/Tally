import { Platform } from "react-native";
import type { RewardedAdProvider, RewardOutcome } from "./rewardedAdProvider";
import { selectRewardedAdProvider } from "./selectRewardedAdProvider";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

/** Rewarded ad unit id for this platform, or null when unconfigured. */
export function getAdmobRewardedUnitId(): string | null {
  if (Platform.OS === "ios") {
    return trim(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_IOS) ?? null;
  }
  if (Platform.OS === "android") {
    return trim(process.env.EXPO_PUBLIC_ADMOB_REWARDED_UNIT_ID_ANDROID) ?? null;
  }
  return null;
}

/**
 * Cached result of probing for the native module. `require` is used rather
 * than a static import so that web builds, Expo Go, and any build without the
 * config plugin fail to find it and fall back gracefully — the same lazy
 * pattern `PremiumContext` uses for `expo-iap`.
 */
let nativeModule: typeof import("react-native-google-mobile-ads") | null = null;
let nativeProbed = false;

function loadNative(): typeof import("react-native-google-mobile-ads") | null {
  if (nativeProbed) return nativeModule;
  nativeProbed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require("react-native-google-mobile-ads");
  } catch {
    nativeModule = null;
  }
  return nativeModule;
}

export const admobProvider: RewardedAdProvider = {
  id: "admob",

  isAvailable(): boolean {
    if (Platform.OS === "web") return false;
    if (!getAdmobRewardedUnitId()) return false;
    return loadNative() !== null;
  },

  show({ userId }): Promise<RewardOutcome> {
    return new Promise((resolve) => {
      const mod = loadNative();
      const unitId = getAdmobRewardedUnitId();
      if (!mod || !unitId) {
        resolve({ kind: "failed", reason: "no_provider" });
        return;
      }

      // Resolve exactly once: the SDK can fire both `earned` and `closed`,
      // and a load error can arrive after either.
      let settled = false;
      const settle = (outcome: RewardOutcome) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(outcome);
      };

      const { RewardedAd, RewardedAdEventType, AdEventType } = mod;

      const ad = RewardedAd.createForAdRequest(unitId, {
        // Carried through to our SSV callback as `user_id`, which is how the
        // server knows whose ledger to credit. Without it the callback is
        // unattributable and the reward is lost.
        serverSideVerificationOptions: { userId },
        requestNonPersonalizedAdsOnly: false,
      });

      const unsubscribers: (() => void)[] = [];
      const cleanup = () => {
        for (const off of unsubscribers) {
          try {
            off();
          } catch {
            // Listener already torn down.
          }
        }
      };

      unsubscribers.push(
        ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
          try {
            ad.show();
          } catch (e) {
            settle({ kind: "failed", reason: e instanceof Error ? e.message : "show_failed" });
          }
        }),
      );

      unsubscribers.push(
        ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
          // The credit is granted by AdMob's server calling our SSV endpoint,
          // not here. The caller polls the ledger for it.
          settle({ kind: "ssv" });
        }),
      );

      unsubscribers.push(
        ad.addAdEventListener(AdEventType.CLOSED, () => {
          // Only reached when EARNED_REWARD did not already settle.
          settle({ kind: "dismissed" });
        }),
      );

      unsubscribers.push(
        ad.addAdEventListener(AdEventType.ERROR, (error: unknown) => {
          const reason = error instanceof Error ? error.message : "ad_error";
          settle({ kind: "failed", reason });
        }),
      );

      try {
        ad.load();
      } catch (e) {
        settle({ kind: "failed", reason: e instanceof Error ? e.message : "load_failed" });
      }
    });
  },
};

/** The provider this build should use. Single entry point for consumers. */
export function getConfiguredRewardedAdProvider(): RewardedAdProvider {
  const platform =
    Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";
  return selectRewardedAdProvider({
    platform,
    admobUnitId: getAdmobRewardedUnitId(),
    admobProvider,
  });
}
