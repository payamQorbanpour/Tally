/**
 * The seam every rewarded-ad network implements.
 *
 * Two networks are planned — AdMob globally, and an Iranian network
 * (Tapsell/Adivery) for markets AdMob does not serve — and they verify
 * rewards differently. That difference is captured in `RewardOutcome` rather
 * than leaking into the calling code: AdMob credits the server directly via
 * its SSV callback, while a network without one hands back a nonce the client
 * redeems.
 *
 * Types only; no imports, so this stays testable without a native module.
 */

export type RewardedAdProviderId = "admob" | "tapsell" | "none";

export type RewardOutcome =
  /** The network will credit the server out-of-band. Poll for the balance. */
  | { kind: "ssv" }
  /** No server callback — redeem this nonce against `ad-reward/claim`. */
  | { kind: "nonce"; nonce: string }
  /** The user closed the ad before earning the reward. Not an error. */
  | { kind: "dismissed" }
  /** No fill, network error, SDK failure. */
  | { kind: "failed"; reason: string };

export type RewardedAdProvider = {
  id: RewardedAdProviderId;
  /** False when the SDK is absent or unconfigured — never throws. */
  isAvailable(): boolean;
  /**
   * Load and present a rewarded ad, resolving once the user has earned the
   * reward, dismissed the ad, or the attempt failed. Never rejects.
   *
   * `userId` is the Supabase user id, forwarded to AdMob as its SSV
   * `userId` so the callback can identify who to credit.
   *
   * `nonce` is minted by the caller (`AiCreditsContext`) via
   * `/ad-reward/nonce` before the ad is shown, for providers with no
   * server-side verification (Tapsell). AdMob ignores it.
   */
  show(opts: { userId: string; nonce?: string }): Promise<RewardOutcome>;
};
