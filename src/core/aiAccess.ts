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
  | "no_ads_available"
  /** Remotely switched off. Not a user problem — no action will help. */
  | "unavailable";

export type AiAccessInput = {
  signedIn: boolean;
  emailConfirmed: boolean;
  /** Active pass, `profiles.is_premium`, or `is_alpha`. Grants unlimited AI. */
  isPremium: boolean;
  balance: number;
  /** True when a rewarded-ad provider can actually show an ad here. */
  adsAvailable: boolean;
  /** Master remote kill switch. See `aiConfig.ts`. */
  aiEnabled: boolean;
};

export function resolveAiAccess(input: AiAccessInput): AiAccessState {
  // Ahead of the sign-in check on purpose: sending a signed-out user to Auth
  // for a feature that is globally off wastes their time and ends in a 403.
  if (!input.aiEnabled) return "unavailable";
  if (!input.signedIn || !input.emailConfirmed) return "needs_signin";
  if (input.isPremium) return "allowed";
  if (input.balance > 0) return "allowed";
  return input.adsAvailable ? "needs_credits" : "no_ads_available";
}
