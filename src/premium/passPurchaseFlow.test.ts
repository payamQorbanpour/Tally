import { describe, expect, it, vi } from "vitest";
import {
  classifyBazaarPurchase,
  performRequestExtension,
  performRequestPass,
  retryPendingBazaarVerification,
  type PassExtensionDeps,
  type PassPurchaseDeps,
  type PendingBazaarVerification,
  type RetryPendingVerificationDeps,
} from "./passPurchaseFlow";
import { newPass } from "./passes";
import type { VerifyBazaarPurchaseResult } from "./verifyBazaarPurchase";

// These orchestration functions were extracted out of `PremiumContext.tsx`'s
// hook closures specifically so the safety-critical purchase/verification
// branches (real money changes hands here) can be driven directly with
// plain spies — no React renderer, no module mocking required, since the
// module under test has zero react/react-native/Supabase imports.

describe("classifyBazaarPurchase", () => {
  it("maps a purchased result to ok with the purchase token as transactionId", () => {
    const outcome = classifyBazaarPurchase({
      kind: "purchased",
      productId: "night.pass",
      purchaseToken: "tok-123",
    });
    expect(outcome).toEqual({ ok: true, transactionId: "tok-123", errorKey: null });
  });

  it("maps cancelled to a failure with NO error key (user-initiated, not a failure)", () => {
    const outcome = classifyBazaarPurchase({ kind: "cancelled" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBeNull();
  });

  it("maps unavailable to a failure with a keyed error", () => {
    const outcome = classifyBazaarPurchase({ kind: "unavailable" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("premium.error_unavailable");
  });

  it("maps failed to a failure with a keyed error", () => {
    const outcome = classifyBazaarPurchase({ kind: "failed", reason: "boom" });
    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("premium.error_failed");
  });
});

const SERVER_EXPIRES_AT = "2030-01-02T00:00:00.000Z";

function makePassDeps(overrides: Partial<PassPurchaseDeps> = {}): PassPurchaseDeps {
  return {
    buyOrStub: vi.fn(async () => ({ ok: true, transactionId: "tok-123" })),
    isBazaarBillingAvailable: vi.fn(() => true),
    verifyBazaarPurchase: vi.fn(
      async (): Promise<VerifyBazaarPurchaseResult> => ({ ok: true, expiresAt: SERVER_EXPIRES_AT }),
    ),
    setLastError: vi.fn(),
    setActivePassState: vi.fn(),
    recordPurchase: vi.fn(async () => {}),
    savePendingVerification: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("performRequestPass", () => {
  it("activates the pass with the SERVER's expiresAt (not a client-recomputed one) when the Bazaar purchase verifies", async () => {
    const deps = makePassDeps();

    await performRequestPass("night", "night.pass", undefined, deps);

    expect(deps.verifyBazaarPurchase).toHaveBeenCalledWith({
      productId: "night.pass",
      purchaseToken: "tok-123",
      passType: "night",
      boundGroupId: null,
    });
    expect(deps.setActivePassState).toHaveBeenCalledTimes(1);
    const grantedPass = (deps.setActivePassState as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(grantedPass.type).toBe("night");
    // Bit-for-bit the server's value, not `Date.now() + PASS_DURATIONS_MS`.
    expect(grantedPass.expiresAt).toBe(SERVER_EXPIRES_AT);
    expect(deps.recordPurchase).toHaveBeenCalledWith(grantedPass, "night.pass", "tok-123");
    expect(deps.setLastError).not.toHaveBeenCalled();
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });

  it("does NOT activate or persist anything when verification fails transiently, sets lastError, and PERSISTS the token for later retry", async () => {
    const deps = makePassDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({ ok: false, terminal: false }),
      ),
    });

    await performRequestPass("night", "night.pass", { groupId: "grp-1" }, deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorVerificationFailed");
    // The critical fix: a paid-but-unverified purchase must not be dropped.
    expect(deps.savePendingVerification).toHaveBeenCalledWith({
      sku: "night.pass",
      purchaseToken: "tok-123",
      passType: "night",
      boundGroupId: "grp-1",
      kind: "buy",
    });
  });

  it("does NOT persist the token for retry when the server rejects it terminally", async () => {
    const deps = makePassDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({
          ok: false,
          terminal: true,
          code: "purchase_invalid",
        }),
      ),
    });

    await performRequestPass("night", "night.pass", undefined, deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorVerificationFailed");
    // Replaying a token the server has definitively rejected can never start
    // working — persisting it would retry it on every foreground forever.
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });

  it("skips verification entirely for an Apple purchase (no transactionId) and activates directly", async () => {
    const deps = makePassDeps({
      buyOrStub: vi.fn(async () => ({ ok: true, transactionId: null })),
      isBazaarBillingAvailable: vi.fn(() => false),
    });

    await performRequestPass("trip", "trip.pass", undefined, deps);

    expect(deps.verifyBazaarPurchase).not.toHaveBeenCalled();
    expect(deps.setActivePassState).toHaveBeenCalledTimes(1);
    expect(deps.recordPurchase).toHaveBeenCalledTimes(1);
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });

  it("does nothing when the underlying purchase itself did not succeed", async () => {
    const deps = makePassDeps({ buyOrStub: vi.fn(async () => ({ ok: false })) });

    await performRequestPass("night", "night.pass", undefined, deps);

    expect(deps.verifyBazaarPurchase).not.toHaveBeenCalled();
    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    // buyOrStub is responsible for setting its own lastError; the
    // orchestrator must not clobber or duplicate that.
    expect(deps.setLastError).not.toHaveBeenCalled();
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });
});

const PENDING: PendingBazaarVerification = {
  sku: "night.pass",
  purchaseToken: "tok-456",
  passType: "night",
  boundGroupId: null,
  kind: "buy",
};

function makeRetryDeps(
  overrides: Partial<RetryPendingVerificationDeps> = {},
): RetryPendingVerificationDeps {
  return {
    loadPending: vi.fn(async () => PENDING),
    clearPending: vi.fn(async () => {}),
    verifyBazaarPurchase: vi.fn(
      async (): Promise<VerifyBazaarPurchaseResult> => ({ ok: true, expiresAt: SERVER_EXPIRES_AT }),
    ),
    setActivePassState: vi.fn(),
    recordPurchase: vi.fn(async () => {}),
    recordExtension: vi.fn(async () => {}),
    loadActivePass: vi.fn(async () => null),
    ...overrides,
  };
}

describe("retryPendingBazaarVerification", () => {
  it("does nothing when there is no pending verification", async () => {
    const deps = makeRetryDeps({ loadPending: vi.fn(async () => null) });

    await retryPendingBazaarVerification(deps);

    expect(deps.verifyBazaarPurchase).not.toHaveBeenCalled();
    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    expect(deps.clearPending).not.toHaveBeenCalled();
  });

  it("replays the persisted token, activates + persists the pass with the server's expiresAt, and clears the pending record on success", async () => {
    const deps = makeRetryDeps();

    await retryPendingBazaarVerification(deps);

    expect(deps.verifyBazaarPurchase).toHaveBeenCalledWith({
      productId: PENDING.sku,
      purchaseToken: PENDING.purchaseToken,
      passType: PENDING.passType,
      boundGroupId: PENDING.boundGroupId,
    });
    expect(deps.setActivePassState).toHaveBeenCalledTimes(1);
    const grantedPass = (deps.setActivePassState as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(grantedPass.expiresAt).toBe(SERVER_EXPIRES_AT);
    expect(deps.recordPurchase).toHaveBeenCalledWith(
      grantedPass,
      PENDING.sku,
      PENDING.purchaseToken,
    );
    expect(deps.clearPending).toHaveBeenCalledTimes(1);
  });

  it("leaves the pending record untouched (does not clear it) when verification fails transiently again", async () => {
    const deps = makeRetryDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({ ok: false, terminal: false }),
      ),
    });

    await retryPendingBazaarVerification(deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    expect(deps.clearPending).not.toHaveBeenCalled();
  });

  it("CLEARS the pending record when the server rejects the token terminally, so it stops being replayed forever", async () => {
    const deps = makeRetryDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({
          ok: false,
          terminal: true,
          code: "purchase_invalid",
        }),
      ),
    });

    await retryPendingBazaarVerification(deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    expect(deps.clearPending).toHaveBeenCalledTimes(1);
  });

  it("replays a pending EXTENSION onto the current pass, keeping its activatedAt and marking it extended", async () => {
    const current = newPass("night", { groupId: "grp-9" });
    const deps = makeRetryDeps({
      loadPending: vi.fn(async () => ({ ...PENDING, sku: "night.extend", kind: "extend" as const })),
      loadActivePass: vi.fn(async () => current),
    });

    await retryPendingBazaarVerification(deps);

    const granted = (deps.setActivePassState as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(granted.expiresAt).toBe(SERVER_EXPIRES_AT);
    expect(granted.isExtended).toBe(true);
    // The extension must not restart the pass's history.
    expect(granted.activatedAt).toBe(current.activatedAt);
    expect(granted.boundGroupId).toBe("grp-9");
    // An extension is recorded as an extension, not as a fresh purchase.
    expect(deps.recordExtension).toHaveBeenCalledWith(granted, "night.extend", PENDING.purchaseToken);
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    expect(deps.clearPending).toHaveBeenCalledTimes(1);
  });

  it("still applies a pending extension when the local pass is gone, using the server's expiry", async () => {
    const deps = makeRetryDeps({
      loadPending: vi.fn(async () => ({ ...PENDING, sku: "night.extend", kind: "extend" as const })),
      loadActivePass: vi.fn(async () => null),
    });

    await retryPendingBazaarVerification(deps);

    const granted = (deps.setActivePassState as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(granted.type).toBe("night");
    expect(granted.expiresAt).toBe(SERVER_EXPIRES_AT);
    expect(granted.isExtended).toBe(true);
    expect(deps.clearPending).toHaveBeenCalledTimes(1);
  });
});

function makeExtensionDeps(overrides: Partial<PassExtensionDeps> = {}): PassExtensionDeps {
  return {
    buyOrStub: vi.fn(async () => ({ ok: true, transactionId: null })),
    isBazaarBillingAvailable: vi.fn(() => false),
    verifyBazaarPurchase: vi.fn(
      async (): Promise<VerifyBazaarPurchaseResult> => ({ ok: true, expiresAt: SERVER_EXPIRES_AT }),
    ),
    setLastError: vi.fn(),
    setActivePassState: vi.fn(),
    recordExtension: vi.fn(async () => {}),
    savePendingVerification: vi.fn(async () => {}),
    ...overrides,
  };
}

/** A Bazaar extend purchase: billing available and a real purchase token. */
function makeBazaarExtensionDeps(
  overrides: Partial<PassExtensionDeps> = {},
): PassExtensionDeps {
  return makeExtensionDeps({
    buyOrStub: vi.fn(async () => ({ ok: true, transactionId: "tok-789" })),
    isBazaarBillingAvailable: vi.fn(() => true),
    ...overrides,
  });
}

describe("performRequestExtension", () => {
  const activePass = newPass("night", { groupId: null });

  it("extends to the SERVER's expiresAt on a verified Bazaar purchase, preserving the pass's identity", async () => {
    const deps = makeBazaarExtensionDeps();

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.buyOrStub).toHaveBeenCalledWith("night.extend");
    expect(deps.verifyBazaarPurchase).toHaveBeenCalledWith({
      productId: "night.extend",
      purchaseToken: "tok-789",
      passType: "night",
      boundGroupId: null,
    });
    const next = (deps.setActivePassState as ReturnType<typeof vi.fn>).mock.calls[0][0];
    // The server stacks the extension onto the existing expiry; the client
    // stores that value verbatim rather than recomputing it locally.
    expect(next.expiresAt).toBe(SERVER_EXPIRES_AT);
    expect(next.isExtended).toBe(true);
    expect(next.type).toBe("night");
    expect(next.activatedAt).toBe(activePass.activatedAt);
    expect(deps.recordExtension).toHaveBeenCalledWith(next, "night.extend", "tok-789");
    expect(deps.setLastError).not.toHaveBeenCalled();
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });

  it("does NOT extend but PERSISTS the token when verification fails transiently", async () => {
    const deps = makeBazaarExtensionDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({ ok: false, terminal: false }),
      ),
    });

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordExtension).not.toHaveBeenCalled();
    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorVerificationFailed");
    // Same hazard as a fresh purchase: Poolakey already took the money.
    expect(deps.savePendingVerification).toHaveBeenCalledWith({
      sku: "night.extend",
      purchaseToken: "tok-789",
      passType: "night",
      boundGroupId: null,
      kind: "extend",
    });
  });

  it("surfaces dedicated copy and drops the token when the server finds no pass to extend", async () => {
    const deps = makeBazaarExtensionDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({
          ok: false,
          terminal: true,
          code: "no_pass_to_extend",
        }),
      ),
    });

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorExtendNotEligible");
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });

  it("falls back to the generic verification message for other terminal rejections", async () => {
    const deps = makeBazaarExtensionDeps({
      verifyBazaarPurchase: vi.fn(
        async (): Promise<VerifyBazaarPurchaseResult> => ({
          ok: false,
          terminal: true,
          code: "purchase_invalid",
        }),
      ),
    });

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorVerificationFailed");
    expect(deps.savePendingVerification).not.toHaveBeenCalled();
  });

  it("proceeds without verification on the Apple/iOS path where Bazaar billing is never available", async () => {
    const deps = makeExtensionDeps();

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.buyOrStub).toHaveBeenCalledWith("night.extend");
    expect(deps.verifyBazaarPurchase).not.toHaveBeenCalled();
    expect(deps.setActivePassState).toHaveBeenCalledTimes(1);
    expect(deps.recordExtension).toHaveBeenCalledTimes(1);
    expect(deps.setLastError).not.toHaveBeenCalled();
  });

  it("does nothing when the underlying purchase does not succeed", async () => {
    const deps = makeExtensionDeps({ buyOrStub: vi.fn(async () => ({ ok: false })) });

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordExtension).not.toHaveBeenCalled();
  });
});
