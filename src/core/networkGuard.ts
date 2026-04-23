/**
 * Zero-dependency offline tripwire for outbound fetches.
 *
 * When a fetch fails with a transport-level network error (no response from
 * the server) we flip a module-local flag; for a short cooldown any further
 * call that opts into the guard bails immediately with `OfflineError` instead
 * of retrying. A successful call resets the flag.
 *
 * This is intentionally lightweight — no NetInfo dependency — and correct for
 * the Tally use case: the goal is "don't hammer a dead network repeatedly"
 * rather than a perfect offline detector.
 */

const OFFLINE_COOLDOWN_MS = 10_000;

let lastNetworkFailureAt: number | null = null;

export const OFFLINE_ERROR_CODE = "OFFLINE";

export class OfflineError extends Error {
  readonly code = OFFLINE_ERROR_CODE;
  constructor(message = "Offline") {
    super(message);
    this.name = "OfflineError";
  }
}

/**
 * Heuristic: does this error look like a transport/network failure rather
 * than an HTTP / application error? Covers React Native's "Network request
 * failed" TypeError, browser `TypeError: Failed to fetch`, and Supabase's
 * `AuthRetryableFetchError`.
 */
export function isTransportNetworkError(err: unknown): boolean {
  if (!err) return false;
  if (err instanceof OfflineError) return true;
  const e = err as { name?: string; message?: string };
  const name = typeof e.name === "string" ? e.name : "";
  const msg = typeof e.message === "string" ? e.message : "";
  if (name === "AuthRetryableFetchError") return true;
  if (/network request failed/i.test(msg)) return true;
  if (/failed to fetch/i.test(msg)) return true;
  if (/network(?:\s|-)?error/i.test(msg)) return true;
  // Our auth wrapper timeout (`TALLY_AUTH_REQUEST_TIMED_OUT`), plus RN's
  // native "Network request timed out" and generic timeout messages.
  if (/tim(?:ed|e)[\s_-]*out/i.test(msg)) return true;
  return false;
}

/** True if we recently saw a transport failure; callers should short-circuit. */
export function shouldSkipDueToOffline(): boolean {
  if (lastNetworkFailureAt === null) return false;
  return Date.now() - lastNetworkFailureAt < OFFLINE_COOLDOWN_MS;
}

export function markNetworkSuccess(): void {
  lastNetworkFailureAt = null;
}

export function markNetworkFailure(): void {
  lastNetworkFailureAt = Date.now();
}

/**
 * Wrap a fetch-based operation with the guard. Throws `OfflineError` without
 * calling `fn` when the cooldown is active. On a transport failure inside
 * `fn`, trips the cooldown and rethrows `OfflineError`; other errors (HTTP,
 * validation, etc.) are rethrown unchanged and reset the cooldown since the
 * server was reachable.
 */
export async function guardNetworkCall<T>(fn: () => Promise<T>): Promise<T> {
  if (shouldSkipDueToOffline()) throw new OfflineError();
  try {
    const out = await fn();
    markNetworkSuccess();
    return out;
  } catch (err) {
    if (isTransportNetworkError(err)) {
      markNetworkFailure();
      throw new OfflineError(err instanceof Error ? err.message : String(err));
    }
    markNetworkSuccess();
    throw err;
  }
}
