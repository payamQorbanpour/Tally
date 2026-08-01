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
export type VerifyBazaarPurchaseResult = { ok: true; expiresAt: string } | { ok: false };

/** POSTs the purchase token to the Edge Function. */
export async function verifyBazaarPurchase(input: {
  productId: string;
  purchaseToken: string;
  passType: string;
  boundGroupId: string | null;
}): Promise<VerifyBazaarPurchaseResult> {
  const base = getSyncUrl();
  const supabase = createTallySupabaseClient();
  if (!base || !supabase) return { ok: false };
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false };
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/functions/v1/verify-bazaar-purchase`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    if (!res.ok) return { ok: false };
    const body = (await res.json().catch(() => null)) as { expiresAt?: unknown } | null;
    if (!body || typeof body.expiresAt !== "string") return { ok: false };
    return { ok: true, expiresAt: body.expiresAt };
  } catch {
    return { ok: false };
  }
}
