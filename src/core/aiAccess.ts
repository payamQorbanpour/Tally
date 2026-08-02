/**
 * Whether a user may invoke an AI feature, and if not, why.
 *
 * This is the rule `AiReceiptScreen.ensureAiAccess` consults. It lives here as
 * a pure function so the branching is testable without rendering the screen —
 * the same split the codebase already uses for `splitEqual` and `balances`.
 *
 * Note the ordering: sign-in is checked before entitlement, because `ai-proxy`
 * rejects anonymous callers outright. Sending a signed-out premium user to the
 * AI path would just produce a 401.
 */

export type AiAccessState =
  /** Go ahead — premium, or holding at least one credit. */
  | "allowed"
  /** Not signed in, or email not confirmed yet. Send them to Auth. */
  | "needs_signin"
  /** Out of credits, but an ad provider is available. Offer the ad. */
  | "needs_credits"
  /** Out of credits with no ad provider (web). Offer a pass instead. */
  | "no_ads_available";

export type AiAccessInput = {
  signedIn: boolean;
  emailConfirmed: boolean;
  /** Active pass, `profiles.is_premium`, or `is_alpha`. Grants unlimited AI. */
  isPremium: boolean;
  balance: number;
  /** True when a rewarded-ad provider can actually show an ad here. */
  adsAvailable: boolean;
};

export function resolveAiAccess(input: AiAccessInput): AiAccessState {
  if (!input.signedIn || !input.emailConfirmed) return "needs_signin";
  if (input.isPremium) return "allowed";
  if (input.balance > 0) return "allowed";
  return input.adsAvailable ? "needs_credits" : "no_ads_available";
}
