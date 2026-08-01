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

// Watchdog for `show()`. The installed package's own dispatcher
// (`@react-native-tapsell-mediation/tapsell/src/show/index.ts`) only calls
// `onAdClosed` when `CompletionState.fromInt(event.completionState)` returns
// a defined value — an out-of-range or missing completion state (also
// plausible if a low-memory Android device destroys the ad activity while
// backgrounded) silently drops the close event and `show()` would otherwise
// never settle, wedging `AiCreditsContext`'s `busy` flag for the rest of the
// session. Kept just under the server's nonce TTL (`NONCE_TTL_MS` in
// supabase/functions/ad-reward/index.ts, currently 5 minutes) so a hang
// surfaces as a failure before the nonce would have expired server-side
// anyway.
const SHOW_TIMEOUT_MS = 4 * 60 * 1000 + 30 * 1000; // 4:30

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
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const settle = (outcome: RewardOutcome) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        resolve(outcome);
      };

      // No unsubscribe API exists for this single-shot listener object (the
      // dispatcher looks it up by adId, not via an EventEmitter handle), so
      // there's nothing else to tear down here — clearing the timer inside
      // `settle()` itself is what keeps it from ever firing after a normal
      // settle or double-resolving.
      timeoutId = setTimeout(() => {
        settle({ kind: "failed", reason: "timeout" });
      }, SHOW_TIMEOUT_MS);

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
