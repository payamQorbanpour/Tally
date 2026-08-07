// Adivery rewarded ads (Android only — the npm package ships no iOS code).
//
// Like Tapsell, Adivery has no server-side verification: `isRewarded` on the
// close callback is client state and nothing signs it. So this provider
// resolves with the nonce it was handed before showing the ad, and the server
// grants credits against a daily cap rather than against proof. See
// supabase/functions/ad-reward/index.ts and
// supabase/migrations/20260802000001_ad_reward_daily_cap.sql.
//
// `require` + a `.web.ts` twin for the usual Metro reason — see admobProvider.ts.
//
// The shape of the SDK differs from Tapsell's in one way that drives most of
// the code below: Adivery has no per-ad handle. `Adivery.addGlobalListener`
// installs *one* set of callbacks for the whole app, and every event is
// identified only by its `placementId`. So the listener is installed once at
// module scope and routed to whichever `show()` call is currently in flight,
// rather than being registered per request the way `tapsellProvider` does it.
import { Platform } from "react-native";
import type { RewardedAdProvider, RewardOutcome } from "./rewardedAdProvider";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

/**
 * Watchdog for the *load* phase. `prepareRewardedAd` is fire-and-forget: the
 * SDK answers with an `onRewardedAdLoaded` event, an `onError` log line, or —
 * on an unconfigured app id or a network black hole — nothing at all. Short,
 * because this runs while the user waits on a modal showing "Loading ad…".
 */
const LOAD_TIMEOUT_MS = 30 * 1000;

/**
 * How often to re-ask the SDK whether the ad is ready, alongside waiting for
 * `onRewardedAdLoaded`. Belt-and-braces: the event is delivered over
 * `RCTDeviceEventEmitter`, and an ad that filled while the JS listener was
 * being attached (or an event dropped for any other reason) would otherwise
 * strand a perfectly good ad until `LOAD_TIMEOUT_MS`.
 */
const LOAD_POLL_INTERVAL_MS = 500;

/**
 * Watchdog for the *show* phase, mirroring `tapsellProvider`'s. Kept just
 * under the server's nonce TTL (`NONCE_TTL_MS` in
 * supabase/functions/ad-reward/index.ts, currently 5 minutes) so a hang
 * surfaces as a failure before the nonce would have expired server-side
 * anyway. Without it, an ad activity destroyed by a low-memory Android device
 * while backgrounded never delivers `onRewardedAdClosed` and wedges
 * `AiCreditsContext`'s `busy` flag for the rest of the session.
 */
const SHOW_TIMEOUT_MS = 4 * 60 * 1000 + 30 * 1000; // 4:30

export function getAdiveryAppId(): string | null {
  return trim(process.env.EXPO_PUBLIC_ADIVERY_APP_ID) ?? null;
}

export function getAdiveryRewardedPlacementId(): string | null {
  return trim(process.env.EXPO_PUBLIC_ADIVERY_REWARDED_PLACEMENT_ID) ?? null;
}

let mod: typeof import("adivery") | null = null;
let probed = false;

function loadNative() {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("adivery");
  } catch {
    mod = null;
  }
  return mod;
}

/**
 * The single in-flight request, or null. Adivery's callbacks carry only a
 * placement id, so this is what turns a global event back into "the promise
 * the user is currently waiting on".
 *
 * Only ever one at a time: `AiCreditsContext` guards `watchAdForCredits` with
 * its `busy` flag, and a second concurrent request would be ambiguous here
 * anyway. A late event that arrives after its request settled finds this null
 * (or pointing at a newer request) and is dropped.
 */
type PendingRequest = {
  placementId: string;
  onLoaded: () => void;
  onClosed: (isRewarded: boolean) => void;
  /** Last message the SDK logged for this placement, used as a failure reason. */
  lastError: string | null;
};

let pending: PendingRequest | null = null;
let configured = false;

/**
 * Initialise the SDK and install the global listener, once per process.
 *
 * `Adivery.configure` is not idempotent on the JS side: it calls
 * `configureEventEmitter`, which allocates a fresh `NativeEventEmitter` and
 * adds thirteen subscriptions every time, without removing the previous
 * call's. Calling it per ad request would leak a listener set per ad.
 */
function ensureConfigured(m: NonNullable<typeof mod>, appId: string): void {
  if (configured) return;
  configured = true;
  m.Adivery.configure(appId);
  m.Adivery.addGlobalListener({
    onRewardedAdLoaded: (placementId: string) => {
      if (pending?.placementId === placementId) pending.onLoaded();
    },
    onRewardedAdClosed: (placementId: string, isRewarded: boolean) => {
      if (pending?.placementId === placementId) pending.onClosed(isRewarded);
    },
    // `onError` is wired to the SDK's `log(placementId, message)` channel,
    // which carries informational lines as well as genuine failures such as
    // NO_FILL. It is therefore recorded rather than acted on: the load phase
    // reports it only if the ad never actually arrives, and the show phase
    // ignores it entirely because `onRewardedAdClosed` is authoritative there.
    onError: (placementId: string, message: string) => {
      if (pending?.placementId === placementId) pending.lastError = message || null;
    },
  });
}

/** Resolves true once the placement has an ad ready, false on timeout. */
function waitForLoad(m: NonNullable<typeof mod>, request: PendingRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    let poll: ReturnType<typeof setInterval> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const settle = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      if (poll !== undefined) clearInterval(poll);
      if (timer !== undefined) clearTimeout(timer);
      // Leave `lastError` in place — the caller reads it on failure — but stop
      // this request from reacting to any further load event for the placement.
      request.onLoaded = () => {};
      resolve(loaded);
    };

    request.onLoaded = () => settle(true);
    timer = setTimeout(() => settle(false), LOAD_TIMEOUT_MS);
    poll = setInterval(() => {
      m.Adivery.isLoaded(request.placementId).then(
        (ready: boolean) => {
          if (ready) settle(true);
        },
        () => {
          // A rejected `isLoaded` is not itself a verdict; the timeout is.
        },
      );
    }, LOAD_POLL_INTERVAL_MS);
  });
}

export const adiveryProvider: RewardedAdProvider = {
  id: "adivery",

  isAvailable(): boolean {
    if (Platform.OS !== "android") return false;
    if (!getAdiveryAppId() || !getAdiveryRewardedPlacementId()) return false;
    return loadNative() !== null;
  },

  async show({ nonce }): Promise<RewardOutcome> {
    const m = loadNative();
    const appId = getAdiveryAppId();
    const placementId = getAdiveryRewardedPlacementId();
    if (!m || !appId || !placementId) return { kind: "failed", reason: "no_provider" };
    if (!nonce) return { kind: "failed", reason: "no_nonce" };

    try {
      ensureConfigured(m, appId);
    } catch (e) {
      return { kind: "failed", reason: e instanceof Error ? e.message : "configure_failed" };
    }

    const request: PendingRequest = {
      placementId,
      onLoaded: () => {},
      onClosed: () => {},
      lastError: null,
    };
    pending = request;

    try {
      // Idempotent from the SDK's side: `prepareRewardedAd` on a placement
      // that already holds an ad is a no-op, and after a show the SDK reloads
      // the placement itself, so a second visit usually starts already loaded.
      m.Adivery.prepareRewardedAd(placementId);

      if (!(await waitForLoad(m, request))) {
        return { kind: "failed", reason: request.lastError ?? "load_timeout" };
      }

      return await new Promise<RewardOutcome>((resolve) => {
        let settled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const settle = (outcome: RewardOutcome) => {
          if (settled) return;
          settled = true;
          if (timer !== undefined) clearTimeout(timer);
          request.onClosed = () => {};
          resolve(outcome);
        };

        timer = setTimeout(() => settle({ kind: "failed", reason: "timeout" }), SHOW_TIMEOUT_MS);
        request.onClosed = (isRewarded: boolean) =>
          settle(isRewarded ? { kind: "nonce", nonce } : { kind: "dismissed" });

        m.Adivery.showAd(placementId);
      });
    } catch (e) {
      return { kind: "failed", reason: e instanceof Error ? e.message : "show_failed" };
    } finally {
      // Only clear if this request is still the current one, so a slow
      // teardown can't detach a newer request's routing.
      if (pending === request) pending = null;
    }
  },
};
