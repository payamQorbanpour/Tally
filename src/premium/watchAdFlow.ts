/**
 * Pure orchestration for `AiCreditsContext.tsx`'s `watchAdForCredits` —
 * extracted for the same reason `passPurchaseFlow.ts` was pulled out of
 * `PremiumContext.tsx`: the safety-critical branch here (mint a nonce
 * *before* showing a Tapsell ad, and never show the ad at all if minting
 * fails) needs unit coverage, but `AiCreditsContext.tsx` itself imports
 * `react-native` (`AppState`) and the ad provider modules import native
 * SDKs, so it can't be exercised directly under this repo's Node-only
 * vitest setup (no `@testing-library/*`, no React-renderer).
 *
 * This module has zero `react` / `react-native` imports — only the
 * dependency-free type import from `../ads/rewardedAdProvider` — so
 * importing it in a test never drags in native-module resolution.
 * `AiCreditsContext.tsx` wires `deps` to its real `mintNonce`/`claimNonce`/
 * `pollForGrant` callbacks; tests pass plain spies and a stub provider.
 */
import type { RewardedAdProvider } from "../ads/rewardedAdProvider";

export type WatchAdResult =
  /** Credits landed and `balance` is updated. */
  | "granted"
  /** The ad was watched but the server callback has not arrived yet. */
  | "pending"
  /** The user closed the ad early. Nothing was earned; not an error. */
  | "dismissed"
  /** No fill, or the SDK errored. */
  | "failed"
  /** No ad provider on this platform/build. */
  | "unavailable";

export type WatchAdFlowDeps = {
  /** Mint a single-use nonce before showing an ad with no server callback. */
  mintNonce: (providerId: string) => Promise<string | null>;
  /** Redeem a nonce after the ad reports a reward. */
  claimNonce: (nonce: string, providerId: string) => Promise<boolean>;
  /** Poll the balance while waiting for AdMob's out-of-band SSV credit. */
  pollForGrant: (before: number) => Promise<boolean>;
};

export type WatchAdFlowOutcome = {
  result: WatchAdResult;
  /** Set only on a `"failed"` result — the caller decides whether/how to surface it. */
  errorReason: string | null;
};

/**
 * Routes a single watch-ad attempt: mints a nonce first for providers with
 * no server-side verification (Tapsell), threads it into `provider.show()`,
 * then dispatches on the resulting `RewardOutcome`. Every other provider
 * (AdMob, and the no-op provider) calls `show()` without ever touching the
 * nonce endpoints.
 *
 * Deliberately does not touch `busy`/`lastError` state or catch — the
 * caller (`AiCreditsContext.watchAdForCredits`) owns `setBusy`/`try`/
 * `finally` and the mounted-check around `setLastError`.
 */
export async function runWatchAdFlow(
  provider: Pick<RewardedAdProvider, "id" | "show">,
  userId: string,
  before: number,
  deps: WatchAdFlowDeps,
): Promise<WatchAdFlowOutcome> {
  let nonce: string | undefined;
  if (provider.id === "tapsell") {
    const minted = await deps.mintNonce(provider.id);
    if (!minted) {
      return { result: "failed", errorReason: "nonce_failed" };
    }
    nonce = minted;
  }

  const outcome = await provider.show({ userId, nonce });
  switch (outcome.kind) {
    case "ssv":
      return { result: (await deps.pollForGrant(before)) ? "granted" : "pending", errorReason: null };
    case "nonce":
      return {
        result: (await deps.claimNonce(outcome.nonce, provider.id)) ? "granted" : "failed",
        errorReason: null,
      };
    case "dismissed":
      return { result: "dismissed", errorReason: null };
    case "failed":
      return { result: "failed", errorReason: outcome.reason };
  }
}
