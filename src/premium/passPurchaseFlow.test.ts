import { describe, expect, it, vi } from "vitest";
import {
  classifyBazaarPurchase,
  performRequestExtension,
  performRequestPass,
  type PassExtensionDeps,
  type PassPurchaseDeps,
} from "./passPurchaseFlow";
import { newPass } from "./passes";

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

function makePassDeps(overrides: Partial<PassPurchaseDeps> = {}): PassPurchaseDeps {
  return {
    buyOrStub: vi.fn(async () => ({ ok: true, transactionId: "tok-123" })),
    isBazaarBillingAvailable: vi.fn(() => true),
    verifyBazaarPurchase: vi.fn(async () => true),
    setLastError: vi.fn(),
    setActivePassState: vi.fn(),
    recordPurchase: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("performRequestPass", () => {
  it("activates the pass and records the purchase when the Bazaar purchase verifies successfully", async () => {
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
    expect(deps.recordPurchase).toHaveBeenCalledWith(grantedPass, "night.pass", "tok-123");
    expect(deps.setLastError).not.toHaveBeenCalled();
  });

  it("does NOT activate or persist anything when verification fails, and sets lastError", async () => {
    const deps = makePassDeps({ verifyBazaarPurchase: vi.fn(async () => false) });

    await performRequestPass("night", "night.pass", undefined, deps);

    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordPurchase).not.toHaveBeenCalled();
    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorVerificationFailed");
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
  });
});

function makeExtensionDeps(overrides: Partial<PassExtensionDeps> = {}): PassExtensionDeps {
  return {
    buyOrStub: vi.fn(async () => ({ ok: true, transactionId: null })),
    isBazaarBillingAvailable: vi.fn(() => false),
    setLastError: vi.fn(),
    setActivePassState: vi.fn(),
    recordExtension: vi.fn(async () => {}),
    ...overrides,
  };
}

describe("performRequestExtension", () => {
  const activePass = newPass("night", { groupId: null });

  it("blocks the purchase before it happens when Bazaar billing is available (no verified extend path exists yet)", async () => {
    const deps = makeExtensionDeps({ isBazaarBillingAvailable: vi.fn(() => true) });

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.buyOrStub).not.toHaveBeenCalled();
    expect(deps.setActivePassState).not.toHaveBeenCalled();
    expect(deps.recordExtension).not.toHaveBeenCalled();
    expect(deps.setLastError).toHaveBeenCalledWith("premium.errorExtendUnavailable");
  });

  it("proceeds normally on the Apple/iOS path where Bazaar billing is never available", async () => {
    const deps = makeExtensionDeps();

    await performRequestExtension(activePass, "night.extend", deps);

    expect(deps.buyOrStub).toHaveBeenCalledWith("night.extend");
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
