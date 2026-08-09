// Cafe Bazaar in-app billing via Poolakey.
//
// `require` rather than a static import, and a `.web.ts` twin, because the
// package is Android-only native code: a static import would be resolved by
// Metro for the web bundle and break it. Same pattern as
// `src/ads/admobProvider.ts` — see the note there.
import { Platform } from "react-native";
import { classifyPoolakeyError } from "./bazaarPoolakeyError";
import type { BazaarPurchaseResult } from "./bazaarPoolakeyError";

export type { BazaarPurchaseResult };
export { classifyPoolakeyError };

let mod: typeof import("@cafebazaar/react-native-poolakey") | null = null;
let probed = false;

function loadNative() {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@cafebazaar/react-native-poolakey");
  } catch {
    mod = null;
  }
  return mod;
}

export function isBazaarBillingAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  if (!process.env.EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY) return false;
  return loadNative() !== null;
}

/**
 * A token for `productId` that Bazaar still considers owned, or null.
 *
 * A Bazaar in-app product stays owned until it is consumed, and
 * `purchaseProduct` fails on an already-owned SKU. That state is reachable
 * without any user error: `consumeBazaarPurchase` runs *after* the entitlement
 * is granted, so an app killed (or offline) in that window leaves a token
 * charged but un-consumed. Without this lookup the user is charged and then
 * permanently locked out of re-buying that pass, with no retry that helps.
 *
 * `queryPurchaseProduct` rejects with `NotFoundException` when the SKU is not
 * owned (ReactNativePoolakeyModule.kt) — the ordinary case — so a rejection
 * here is not an error worth surfacing.
 */
async function ownedPurchaseToken(
  m: NonNullable<typeof mod>,
  productId: string,
): Promise<string | null> {
  try {
    const existing = await m.default.queryPurchaseProduct(productId);
    return existing?.purchaseToken ?? null;
  } catch {
    return null;
  }
}

export async function purchaseBazaarProduct(productId: string): Promise<BazaarPurchaseResult> {
  const m = loadNative();
  const rsaKey = process.env.EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY;
  if (!m || !rsaKey) return { kind: "unavailable" };
  try {
    // The package's connect/purchaseProduct live on its `default` export
    // (`poolakey`), not as top-level named exports of the module.
    await m.default.connect(rsaKey);

    // Reuse an un-consumed token rather than charging again. Verification is
    // idempotent server-side (on `store_transaction_id`) and returns the
    // stored expiry, so replaying one costs the user nothing and lets the
    // consume that was missed last time finally land.
    const owned = await ownedPurchaseToken(m, productId);
    if (owned) return { kind: "purchased", productId, purchaseToken: owned };

    const purchase = await m.default.purchaseProduct(productId, "");
    const token = purchase?.purchaseToken;
    if (!token) return { kind: "failed", reason: "no_purchase_token" };
    return { kind: "purchased", productId, purchaseToken: token };
  } catch (e) {
    return classifyPoolakeyError(e);
  }
}

/**
 * Release the SKU so the user can buy this pass again once it lapses.
 *
 * Must only be called after the entitlement has been granted — consuming
 * first would risk burning a token whose pass was never recorded. Consuming
 * flips `consumptionState` only; `purchaseState` stays 0, so the token still
 * validates afterwards and the pending-verification replay path keeps working.
 *
 * Returns whether the consume landed. Callers deliberately ignore a `false`:
 * the user already holds the pass, so failing the purchase over it would be a
 * lie, and `ownedPurchaseToken` above recovers the token on their next buy.
 */
export async function consumeBazaarPurchase(purchaseToken: string): Promise<boolean> {
  const m = loadNative();
  const rsaKey = process.env.EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY;
  if (!m || !rsaKey) return false;
  try {
    await m.default.connect(rsaKey);
    await m.default.consumePurchase(purchaseToken);
    return true;
  } catch {
    return false;
  }
}
