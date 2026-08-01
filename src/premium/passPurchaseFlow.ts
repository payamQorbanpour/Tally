/**
 * Pure orchestration for pass purchases/extensions, extracted out of
 * `PremiumContext.tsx`'s hook closures so the safety-critical branches —
 * "did a real, verified purchase happen before we grant anything" — are
 * unit testable without a React renderer.
 *
 * This module intentionally has zero `react` / `react-native` / Supabase
 * imports (only the dependency-free `./passes` and a type from
 * `./bazaarPoolakeyError`), so importing it in a test never drags in
 * native-module resolution. `PremiumContext.tsx` wires these functions to
 * real state setters and the persistence adapter; tests pass plain spies.
 */
import type { BazaarPurchaseResult } from "./bazaarPoolakeyError";
import { type ActivePass, extendedPass, newPass, type PassType } from "./passes";

export type BuyResult = { ok: boolean; transactionId?: string | null };

/**
 * Classifies a Bazaar purchase result into the same `{ ok, transactionId,
 * errorKey }` shape `buyOrStub` returns. `cancelled` is user-initiated and
 * must not surface as an error — every other non-`purchased` kind does,
 * keyed as `premium.error_${kind}` (only `unavailable` / `failed` reach
 * here in practice).
 */
export function classifyBazaarPurchase(
  res: BazaarPurchaseResult,
): { ok: boolean; transactionId?: string | null; errorKey: string | null } {
  if (res.kind !== "purchased") {
    return {
      ok: false,
      errorKey: res.kind !== "cancelled" ? `premium.error_${res.kind}` : null,
    };
  }
  return { ok: true, transactionId: res.purchaseToken, errorKey: null };
}

export type PassPurchaseDeps = {
  buyOrStub: (sku: string | null) => Promise<BuyResult>;
  isBazaarBillingAvailable: () => boolean;
  verifyBazaarPurchase: (args: {
    productId: string;
    purchaseToken: string;
    passType: PassType;
    boundGroupId: string | null;
  }) => Promise<boolean>;
  setLastError: (key: string | null) => void;
  setActivePassState: (pass: ActivePass) => void;
  /** Must internally no-op when no persistence adapter is registered. */
  recordPurchase: (
    pass: ActivePass,
    productId: string,
    storeTransactionId?: string | null,
  ) => Promise<void>;
};

/**
 * A Bazaar purchase is only real once the Developer API confirms it.
 * Activating locally first would recreate the client/server split this
 * release exists to fix. Apple purchases (`transactionId: null` from the
 * `expo-iap` branch of `buyOrStub`) skip the verification block entirely.
 */
export async function performRequestPass(
  type: PassType,
  sku: string | null,
  opts: { groupId?: string } | undefined,
  deps: PassPurchaseDeps,
): Promise<void> {
  const result = await deps.buyOrStub(sku);
  if (!result.ok) return;

  if (result.transactionId && deps.isBazaarBillingAvailable()) {
    const verified = await deps.verifyBazaarPurchase({
      productId: sku!,
      purchaseToken: result.transactionId,
      passType: type,
      boundGroupId: opts?.groupId ?? null,
    });
    if (!verified) {
      deps.setLastError("premium.errorVerificationFailed");
      return;
    }
  }

  const pass = newPass(type, { groupId: opts?.groupId ?? null });
  deps.setActivePassState(pass);
  await deps.recordPurchase(pass, sku ?? `local:${type}`, result.transactionId ?? null);
}

export type PassExtensionDeps = {
  buyOrStub: (sku: string | null) => Promise<BuyResult>;
  isBazaarBillingAvailable: () => boolean;
  setLastError: (key: string | null) => void;
  setActivePassState: (pass: ActivePass) => void;
  /** Must internally no-op when no persistence adapter is registered. */
  recordExtension: (
    pass: ActivePass,
    productId: string,
    storeTransactionId?: string | null,
  ) => Promise<void>;
};

/**
 * Extend-purchase server verification does not exist yet —
 * `verify-bazaar-purchase` deliberately rejects `.extend` SKUs with 400
 * `unknown_product` (an accepted, documented scope boundary). Gating this
 * on a verification call the server can't yet satisfy would charge the
 * user via Poolakey and then fail to confirm it, with no refund path. So
 * on a Bazaar build, block the purchase attempt itself before any money
 * changes hands rather than trying to verify it after the fact. The
 * Apple/iOS extend path is unaffected: `isBazaarBillingAvailable()` is
 * always false there, so this guard never triggers.
 */
export async function performRequestExtension(
  activePass: ActivePass,
  sku: string | null,
  deps: PassExtensionDeps,
): Promise<void> {
  if (deps.isBazaarBillingAvailable()) {
    deps.setLastError("premium.errorExtendUnavailable");
    return;
  }

  const result = await deps.buyOrStub(sku);
  if (!result.ok) return;

  const next = extendedPass(activePass);
  deps.setActivePassState(next);
  await deps.recordExtension(
    next,
    sku ?? `local:${activePass.type}.extend`,
    result.transactionId ?? null,
  );
}
