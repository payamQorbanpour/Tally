/**
 * Pure orchestration for pass purchases/extensions, extracted out of
 * `PremiumContext.tsx`'s hook closures so the safety-critical branches —
 * "did a real, verified purchase happen before we grant anything" — are
 * unit testable without a React renderer.
 *
 * This module intentionally has zero `react` / `react-native` / Supabase
 * imports (only the dependency-free `./passes` and type-only imports from
 * `./bazaarPoolakeyError` / `./verifyBazaarPurchase`, erased at build time),
 * so importing it in a test never drags in native-module resolution.
 * `PremiumContext.tsx` wires these functions to real state setters and the
 * persistence adapter; tests pass plain spies.
 */
import type { BazaarPurchaseResult } from "./bazaarPoolakeyError";
import {
  type ActivePass,
  extendedPass,
  newPass,
  PASS_DURATIONS_MS,
  type PassType,
} from "./passes";
import type { VerifyBazaarPurchaseResult } from "./verifyBazaarPurchase";

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

/**
 * The tuple needed to replay a Bazaar purchase's verification call after it
 * fails — everything `verify-bazaar-purchase` needs, persisted so it
 * survives an app restart. See `pendingBazaarVerification.ts` for the
 * AsyncStorage-backed persistence and `retryPendingBazaarVerification`
 * below for the replay.
 */
export type PendingBazaarVerification = {
  sku: string;
  purchaseToken: string;
  passType: PassType;
  boundGroupId: string | null;
};

export type PassPurchaseDeps = {
  buyOrStub: (sku: string | null) => Promise<BuyResult>;
  isBazaarBillingAvailable: () => boolean;
  verifyBazaarPurchase: (args: {
    productId: string;
    purchaseToken: string;
    passType: PassType;
    boundGroupId: string | null;
  }) => Promise<VerifyBazaarPurchaseResult>;
  setLastError: (key: string | null) => void;
  setActivePassState: (pass: ActivePass) => void;
  /** Must internally no-op when no persistence adapter is registered. */
  recordPurchase: (
    pass: ActivePass,
    productId: string,
    storeTransactionId?: string | null,
  ) => Promise<void>;
  /**
   * Poolakey already charged the user by the time `verifyBazaarPurchase` is
   * called — if that call fails, the token must not be dropped. Persisting
   * it here is what lets `retryPendingBazaarVerification` replay it later
   * against the (idempotent, on `store_transaction_id`) server endpoint.
   */
  savePendingVerification: (pending: PendingBazaarVerification) => Promise<void>;
};

/**
 * Builds an `ActivePass` whose `expiresAt` exactly matches the server's
 * authoritative value, without hand-editing the field after the fact.
 * `newPass`'s `baseExpiresAtMs` is "a start point this pass type's duration
 * is added onto" — subtracting that same duration back out of the server's
 * `expiresAt` before passing it in makes the addition cancel exactly, so the
 * stored `expiresAt` equals the server's value bit-for-bit regardless of any
 * drift between the client's and server's duration constants (relevant if
 * verification happens long after purchase, e.g. via the pending-retry path
 * below).
 */
function passFromServerExpiry(
  type: PassType,
  expiresAtIso: string,
  groupId: string | null,
): ActivePass {
  const serverExpiresAtMs = Date.parse(expiresAtIso);
  return newPass(type, {
    groupId,
    baseExpiresAtMs: serverExpiresAtMs - PASS_DURATIONS_MS[type],
  });
}

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
    const groupId = opts?.groupId ?? null;
    const verified = await deps.verifyBazaarPurchase({
      productId: sku!,
      purchaseToken: result.transactionId,
      passType: type,
      boundGroupId: groupId,
    });
    if (!verified.ok) {
      await deps.savePendingVerification({
        sku: sku!,
        purchaseToken: result.transactionId,
        passType: type,
        boundGroupId: groupId,
      });
      deps.setLastError("premium.errorVerificationFailed");
      return;
    }
    const pass = passFromServerExpiry(type, verified.expiresAt, groupId);
    deps.setActivePassState(pass);
    await deps.recordPurchase(pass, sku!, result.transactionId);
    return;
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

export type RetryPendingVerificationDeps = {
  loadPending: () => Promise<PendingBazaarVerification | null>;
  clearPending: () => Promise<void>;
  verifyBazaarPurchase: PassPurchaseDeps["verifyBazaarPurchase"];
  setActivePassState: (pass: ActivePass) => void;
  /** Must internally no-op when no persistence adapter is registered. */
  recordPurchase: PassPurchaseDeps["recordPurchase"];
};

/**
 * Called on every `refresh()` (mount + app-foreground, per
 * `PremiumContext.tsx`'s existing `AppState` listener). If a Bazaar
 * purchase's verification call failed previously, replays the exact same
 * token against the (idempotent, on `store_transaction_id`) server endpoint.
 *
 * On success this is the ONLY way the affected user's pass activates —
 * there is no separate user-facing "retry" button. That's deliberate: the
 * acceptance bar is a paid purchase recovering automatically on the user's
 * next app launch or foreground, with no re-purchase and no explicit action,
 * because re-buying just gets "already owned" from Bazaar for a token that
 * was charged but never confirmed.
 *
 * On failure the pending record is left untouched (not cleared) so the next
 * `refresh()` tries again — a transient outage should not cost the user
 * their only recovery path.
 */
export async function retryPendingBazaarVerification(
  deps: RetryPendingVerificationDeps,
): Promise<void> {
  const pending = await deps.loadPending();
  if (!pending) return;

  const verified = await deps.verifyBazaarPurchase({
    productId: pending.sku,
    purchaseToken: pending.purchaseToken,
    passType: pending.passType,
    boundGroupId: pending.boundGroupId,
  });
  if (!verified.ok) return;

  const pass = passFromServerExpiry(pending.passType, verified.expiresAt, pending.boundGroupId);
  deps.setActivePassState(pass);
  await deps.recordPurchase(pass, pending.sku, pending.purchaseToken);
  await deps.clearPending();
}
