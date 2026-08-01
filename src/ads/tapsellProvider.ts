// Tapsell rewarded ads (Android only — the npm package ships no iOS code).
//
// Unlike AdMob, Tapsell has no server-side verification: `onRewarded` is a
// client callback and nothing signs it. So this provider resolves with the
// nonce it minted before showing the ad, and the server grants credits
// against a daily cap rather than against proof. See
// supabase/functions/ad-reward/index.ts and
// supabase/migrations/20260802000001_ad_reward_daily_cap.sql.
//
// `require` + a `.web.ts` twin for the usual Metro reason — see admobProvider.ts.
import { Platform } from "react-native";
import type { RewardedAdProvider, RewardOutcome } from "./rewardedAdProvider";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

export function getTapsellZoneId(): string | null {
  return trim(process.env.EXPO_PUBLIC_TAPSELL_REWARDED_ZONE_ID) ?? null;
}

let mod: typeof import("@react-native-tapsell-mediation/tapsell") | null = null;
let probed = false;

function loadNative() {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@react-native-tapsell-mediation/tapsell");
  } catch {
    mod = null;
  }
  return mod;
}

export const tapsellProvider: RewardedAdProvider = {
  id: "tapsell",

  isAvailable(): boolean {
    if (Platform.OS !== "android") return false;
    if (!getTapsellZoneId()) return false;
    return loadNative() !== null;
  },

  async show({ nonce }): Promise<RewardOutcome> {
    const m = loadNative();
    const zoneId = getTapsellZoneId();
    if (!m || !zoneId) return { kind: "failed", reason: "no_provider" };
    if (!nonce) return { kind: "failed", reason: "no_nonce" };

    let adId: string;
    try {
      adId = await m.requestRewardedAd(zoneId);
    } catch (e) {
      return { kind: "failed", reason: e instanceof Error ? e.message : "request_failed" };
    }

    return new Promise<RewardOutcome>((resolve) => {
      // The SDK can fire onRewarded and onAdClosed for the same view; resolve once.
      let settled = false;
      const settle = (outcome: RewardOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      let rewarded = false;
      m.showRewardedAd(adId, {
        onAdImpression: () => {},
        onAdClicked: () => {},
        onRewarded: () => {
          rewarded = true;
        },
        onAdFailed: (error: string) => settle({ kind: "failed", reason: error || "ad_failed" }),
        // Settle on close rather than on reward: closing is the last event, so
        // waiting for it avoids resolving while the ad is still on screen.
        onAdClosed: () => settle(rewarded ? { kind: "nonce", nonce } : { kind: "dismissed" }),
      });
    });
  },
};
