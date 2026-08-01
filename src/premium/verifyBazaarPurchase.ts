import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";

/** POSTs the purchase token to the Edge Function. True only on a 200. */
export async function verifyBazaarPurchase(input: {
  productId: string;
  purchaseToken: string;
  passType: string;
  boundGroupId: string | null;
}): Promise<boolean> {
  const base = getSyncUrl();
  const supabase = createTallySupabaseClient();
  if (!base || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/functions/v1/verify-bazaar-purchase`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
