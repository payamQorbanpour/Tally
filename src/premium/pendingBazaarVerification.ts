// Durable storage for a Bazaar purchase whose verification call failed.
//
// Poolakey charges the user and hands back a purchase token synchronously;
// `verify-bazaar-purchase` is a *separate* network call that can fail for
// reasons unrelated to the purchase itself (network blip, Bazaar's OAuth /
// validate endpoint down, a 500/503, or the app getting killed mid-flight).
// Without this, that failure permanently loses the purchase: nothing else
// persists the token, `restorePurchases()` only calls `expo-iap` (a no-op on
// Bazaar), and re-buying just gets "already owned" from Bazaar for a
// non-consumed purchase.
//
// `verify-bazaar-purchase`'s upsert is deliberately idempotent on
// `store_transaction_id`, so replaying the exact same token later is safe.
// This module is what makes that replay actually happen: it persists the
// `{sku, purchaseToken, passType, boundGroupId}` tuple across app restarts
// so `retryPendingBazaarVerification` (in `passPurchaseFlow.ts`) can retry it
// on the next `refresh()` — mount or app-foreground — with no user action.
//
// AsyncStorage (not the local SQLite `pass_entitlements` table) because this
// is transient recovery state, not a purchase record — same pattern as
// `clearAppStorage.ts`'s `markPendingAccountDeletion` /
// `applyPendingAccountDeletionIfAny` (persist an intent, act on it later,
// clear it), and it works identically on web without a native-module twin.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PendingBazaarVerification } from "./passPurchaseFlow";
import type { PassType } from "./passes";

const PENDING_BAZAAR_VERIFICATION_KEY = "@tally:pending_bazaar_verification";

// Type-only re-export: `passPurchaseFlow.ts` owns the shape (it is the module
// that produces and replays these records), and a second hand-maintained copy
// here would drift the moment a field is added — as `kind` just was. Erased
// at build time, so this adds no runtime edge between the two modules.
export type { PendingBazaarVerification };

function isPassType(v: unknown): v is PassType {
  return v === "night" || v === "trip" || v === "explorer";
}

export async function savePendingBazaarVerification(
  pending: PendingBazaarVerification,
): Promise<void> {
  try {
    await AsyncStorage.setItem(
      PENDING_BAZAAR_VERIFICATION_KEY,
      JSON.stringify(pending),
    );
  } catch {
    // Best-effort — worst case the failed verification is simply lost, same
    // as before this module existed. Not worth surfacing to the user: the
    // purchase-failure alert they already saw is the actionable signal.
  }
}

export async function loadPendingBazaarVerification(): Promise<PendingBazaarVerification | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_BAZAAR_VERIFICATION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingBazaarVerification> | null;
    if (
      !parsed ||
      typeof parsed.sku !== "string" ||
      typeof parsed.purchaseToken !== "string" ||
      !isPassType(parsed.passType)
    ) {
      return null;
    }
    return {
      sku: parsed.sku,
      purchaseToken: parsed.purchaseToken,
      passType: parsed.passType,
      boundGroupId: typeof parsed.boundGroupId === "string" ? parsed.boundGroupId : null,
      // Records written before extensions were verifiable have no `kind`.
      // They can only ever be buys, and defaulting the other way would
      // replay one as an extension and stack time onto an unrelated pass.
      kind: parsed.kind === "extend" ? "extend" : "buy",
    };
  } catch {
    return null;
  }
}

export async function clearPendingBazaarVerification(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_BAZAAR_VERIFICATION_KEY);
  } catch {
    // best-effort
  }
}
