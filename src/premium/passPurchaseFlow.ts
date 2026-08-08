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
  /**
   * Which flow produced the token. The replay path needs this because the
   * two land differently: a `buy` starts a pass, an `extend` stacks onto the
   * one the user already holds and must be recorded as an extension.
   */
  kind: "buy" | "extend";
};

/**
 * Maps a verification failure to `lastError` copy. `no_pass_to_extend` is
 * the one case with a genuinely different cause — the server could not find
 * a pass to extend — and telling the user "we couldn't confirm that
 * purchase" there would send them to support for the wrong reason.
 */
function verificationErrorKey(res: { code?: string }): string {
  return res.code === "no_pass_to_extend"
    ? "premium.errorExtendNotEligible"
    : "premium.errorVerificationFailed";
}

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
   *
   * Only called for TRANSIENT failures. A token the server has terminally
   * rejected (`terminal: true` — a 400/402/409) can never start verifying,
   * so persisting it would just replay a doomed request on every app
   * foreground, forever.
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
      if (!verified.terminal) {
        await deps.savePendingVerification({
          sku: sku!,
          purchaseToken: result.transactionId,
          passType: type,
          boundGroupId: groupId,
          kind: "buy",
        });
      }
      deps.setLastError(verificationErrorKey(verified));
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
  verifyBazaarPurchase: PassPurchaseDeps["verifyBazaarPurchase"];
  setLastError: (key: string | null) => void;
  setActivePassState: (pass: ActivePass) => void;
  /** Must internally no-op when no persistence adapter is registered. */
  recordExtension: (
    pass: ActivePass,
    productId: string,
    storeTransactionId?: string | null,
  ) => Promise<void>;
  savePendingVerification: PassPurchaseDeps["savePendingVerification"];
};

/**
 * Applies a server-authoritative extension to a pass. `expiresAt` is taken
 * verbatim from `verify-bazaar-purchase`, which does the stacking (onto the
 * current expiry while live, from the purchase time once lapsed) — the
 * client must not recompute it, or the two drift whenever verification
 * happens well after the purchase.
 */
function extendedFromServerExpiry(pass: ActivePass, expiresAtIso: string): ActivePass {
  return { ...pass, expiresAt: expiresAtIso, isExtended: true };
}

/**
 * Mirrors `performRequestPass`: on a Bazaar build the extension is only real
 * once `verify-bazaar-purchase` confirms the token and returns the stacked
 * expiry. The server resolves the `.extend` SKU through its own
 * `BAZAAR_EXTEND_PRODUCT_MAP`, so the client never states that this purchase
 * is an extension — it just posts the SKU.
 *
 * Apple purchases (`transactionId: null` from the `expo-iap` branch of
 * `buyOrStub`) skip verification entirely and stack locally via
 * `extendedPass`, exactly as before.
 */
export async function performRequestExtension(
  activePass: ActivePass,
  sku: string | null,
  deps: PassExtensionDeps,
): Promise<void> {
  const result = await deps.buyOrStub(sku);
  if (!result.ok) return;

  if (result.transactionId && deps.isBazaarBillingAvailable()) {
    const verified = await deps.verifyBazaarPurchase({
      productId: sku!,
      purchaseToken: result.transactionId,
      passType: activePass.type,
      boundGroupId: activePass.boundGroupId,
    });
    if (!verified.ok) {
      if (!verified.terminal) {
        await deps.savePendingVerification({
          sku: sku!,
          purchaseToken: result.transactionId,
          passType: activePass.type,
          boundGroupId: activePass.boundGroupId,
          kind: "extend",
        });
      }
      deps.setLastError(verificationErrorKey(verified));
      return;
    }
    const next = extendedFromServerExpiry(activePass, verified.expiresAt);
    deps.setActivePassState(next);
    await deps.recordExtension(next, sku!, result.transactionId);
    return;
  }

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
  /** Must internally no-op when no persistence adapter is registered. */
  recordExtension: PassExtensionDeps["recordExtension"];
  /**
   * The pass the extension applies to, read at replay time rather than
   * captured at purchase time — the replay can happen days later, on another
   * launch. Returning `null` is handled (the pass is rebuilt from the
   * server's expiry); it just loses the original `activatedAt`.
   */
  loadActivePass: () => Promise<ActivePass | null>;
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
 * On a TRANSIENT failure the pending record is left untouched (not cleared)
 * so the next `refresh()` tries again — an outage should not cost the user
 * their only recovery path. On a TERMINAL rejection it is cleared instead:
 * the server will never accept this token, and keeping it would fire a
 * doomed request on every foreground for the life of the install.
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
  if (!verified.ok) {
    if (verified.terminal) await deps.clearPending();
    return;
  }

  if (pending.kind === "extend") {
    const current = await deps.loadActivePass();
    // Without a local pass there is nothing to stack onto, but the server
    // has already committed the extension and told us when it ends — so
    // rebuild a pass around that expiry rather than discard a paid grant.
    const base =
      current ?? passFromServerExpiry(pending.passType, verified.expiresAt, pending.boundGroupId);
    const next = extendedFromServerExpiry(base, verified.expiresAt);
    deps.setActivePassState(next);
    await deps.recordExtension(next, pending.sku, pending.purchaseToken);
    await deps.clearPending();
    return;
  }

  const pass = passFromServerExpiry(pending.passType, verified.expiresAt, pending.boundGroupId);
  deps.setActivePassState(pass);
  await deps.recordPurchase(pass, pending.sku, pending.purchaseToken);
  await deps.clearPending();
}
