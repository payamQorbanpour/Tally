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

export async function purchaseBazaarProduct(productId: string): Promise<BazaarPurchaseResult> {
  const m = loadNative();
  const rsaKey = process.env.EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY;
  if (!m || !rsaKey) return { kind: "unavailable" };
  try {
    // The package's connect/purchaseProduct live on its `default` export
    // (`poolakey`), not as top-level named exports of the module.
    await m.default.connect(rsaKey);
    const purchase = await m.default.purchaseProduct(productId, "");
    const token = purchase?.purchaseToken;
    if (!token) return { kind: "failed", reason: "no_purchase_token" };
    return { kind: "purchased", productId, purchaseToken: token };
  } catch (e) {
    return classifyPoolakeyError(e);
  }
}
