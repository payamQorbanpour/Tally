/**
 * The billing rule for AI proxy calls — one credit per call, except for
 * actions the app issues on the user's behalf.
 *
 * `ai-proxy` keeps its own copy of `FREE_ACTIONS` because it runs on Deno and
 * cannot import from `src/`. `aiCreditCost.test.ts` reads the function's
 * source and fails if the two ever disagree.
 */

export type AiProxyAction =
  | "parse-receipt"
  | "parse-description"
  | "classify-category"
  | "transcribe";

/**
 * `classify-category` is fired by the app itself when the group-type picker
 * is disabled (see `isGroupTypePickerEnabled` in `featureFlags.ts`). Charging
 * for a call the user never initiated reads as a bug, so it is free.
 */
export const FREE_AI_ACTIONS: readonly AiProxyAction[] = ["classify-category"];

export function aiCreditCost(action: AiProxyAction): 0 | 1 {
  return FREE_AI_ACTIONS.includes(action) ? 0 : 1;
}

/**
 * Credits granted for one completed rewarded ad.
 *
 * The credits panel has to state this BEFORE the user watches an ad, so the
 * number cannot come from the grant response — it has to exist client-side.
 * `ad-reward` runs on Deno and cannot import from `src/`, so it keeps its own
 * `envInt("AD_REWARD_CREDITS", …)` default and `aiCreditCost.test.ts` fails if
 * the two disagree. That drift is not hypothetical: the panel promised 3 for
 * as long as the server granted 1.
 *
 * Deployment can still override this with the `AD_REWARD_CREDITS` project
 * secret, which the test cannot see. Keep the secret and this default equal —
 * today both are 1.
 *
 * Raising it means rewriting `aiCredits.body` in en/fa/es, which is phrased in
 * the singular. A test pins the value to 1 so that cannot happen silently.
 */
export const AD_REWARD_CREDITS = 1;
