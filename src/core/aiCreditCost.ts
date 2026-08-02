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
