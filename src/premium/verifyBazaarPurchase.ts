import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";

/**
 * `verify-bazaar-purchase` anchors `expiresAt` to Bazaar's actual purchase
 * time and returns it on every success response (including a replayed,
 * already-claimed token — see the function's idempotent upsert). Carrying it
 * through here lets the client store the server's authoritative expiry
 * instead of recomputing one from a duplicated client-side duration table,
 * which would drift if verification ever happens long after the purchase
 * (e.g. via the pending-verification retry path in `passPurchaseFlow.ts`).
 */
export type VerifyBazaarPurchaseResult =
  | { ok: true; expiresAt: string }
  | {
      ok: false;
      terminal: boolean;
      /**
       * The Edge Function's `error` field when one came back, so callers can
       * tell apart failures that need different copy — `no_pass_to_extend`
       * ("we couldn't find a pass to extend") reads nothing like
       * `purchase_invalid` ("we couldn't confirm that purchase"). Absent
       * whenever the body was missing or unparseable.
       */
      code?: string;
    };

/**
 * Statuses on which replaying the exact same token can never start
 * succeeding, so the caller must NOT persist it for retry:
 *
 * - 400 `unknown_product` / `invalid_request` — the SKU or body is wrong.
 * - 402 `purchase_invalid` — Bazaar itself rejected the token.
 * - 409 `purchase_already_claimed` / `no_pass_to_extend` — the token belongs
 *   to another user, or there is no pass to extend. Neither becomes true
 *   later by waiting.
 *
 * Everything else (500 `record_failed`, 503 `verification_unavailable`, a
 * thrown fetch, an unparseable body) is transient: the purchase is real and
 * money has already changed hands, so the token must survive for
 * `retryPendingBazaarVerification` to replay. Defaulting to transient is the
 * safe direction — a pointless retry costs one request, a dropped token
 * costs the user their purchase.
 */
const TERMINAL_STATUSES = new Set([400, 402, 409]);

/** POSTs the purchase token to the Edge Function. */
export async function verifyBazaarPurchase(input: {
  productId: string;
  purchaseToken: string;
  passType: string;
  boundGroupId: string | null;
}): Promise<VerifyBazaarPurchaseResult> {
  const base = getSyncUrl();
  const supabase = createTallySupabaseClient();
  // No sync backend / no session: nothing was ever sent, so the token is
  // still good once the user signs in. Transient by definition.
  if (!base || !supabase) return { ok: false, terminal: false };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, terminal: false };
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/functions/v1/verify-bazaar-purchase`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!res.ok) {
      const errBody = (await res.json().catch(() => null)) as { error?: unknown } | null;
      return {
        ok: false,
        terminal: TERMINAL_STATUSES.has(res.status),
        ...(typeof errBody?.error === "string" ? { code: errBody.error } : {}),
      };
    }
    const body = (await res.json().catch(() => null)) as { expiresAt?: unknown } | null;
    // A 2xx with no usable `expiresAt` is a server bug, not a verdict on the
    // purchase — retry rather than discard a paid token.
    if (!body || typeof body.expiresAt !== "string") return { ok: false, terminal: false };
    return { ok: true, expiresAt: body.expiresAt };
  } catch {
    return { ok: false, terminal: false };
  }
}
