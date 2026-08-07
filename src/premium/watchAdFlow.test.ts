import { describe, expect, it, vi } from "vitest";
import { runWatchAdFlow, type WatchAdFlowDeps } from "./watchAdFlow";
import type { RewardedAdProvider } from "../ads/rewardedAdProvider";

// `runWatchAdFlow` was extracted out of `AiCreditsContext.tsx`'s
// `watchAdForCredits` closure specifically so the mint-before-show
// sequencing — the one branch that's new and credit-granting — can be
// driven directly with plain spies. `AiCreditsContext.tsx` imports
// `react-native`, so it can't be exercised under this repo's Node-only
// vitest setup without a React renderer (which this repo has none of).

function makeDeps(overrides: Partial<WatchAdFlowDeps> = {}): WatchAdFlowDeps {
  return {
    mintNonce: vi.fn(async () => "nonce-abc"),
    claimNonce: vi.fn(async () => true),
    pollForGrant: vi.fn(async () => true),
    ...overrides,
  };
}

function stubProvider(
  id: RewardedAdProvider["id"],
  show: RewardedAdProvider["show"],
): Pick<RewardedAdProvider, "id" | "show"> {
  return { id, show };
}

describe("runWatchAdFlow", () => {
  it("mints a nonce first for Tapsell, then calls show() WITH the minted nonce", async () => {
    const deps = makeDeps({ mintNonce: vi.fn(async () => "nonce-xyz") });
    const show = vi.fn(async () => ({ kind: "nonce" as const, nonce: "nonce-xyz" }));
    const provider = stubProvider("tapsell", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(deps.mintNonce).toHaveBeenCalledWith("tapsell");
    expect(show).toHaveBeenCalledWith({ userId: "user-1", nonce: "nonce-xyz" });
    expect(deps.claimNonce).toHaveBeenCalledWith("nonce-xyz", "tapsell");
    expect(outcome).toEqual({ result: "granted", errorReason: null });
  });

  it("never calls show() when minting fails for Tapsell, and reports nonce_failed", async () => {
    const deps = makeDeps({ mintNonce: vi.fn(async () => null) });
    const show = vi.fn(async () => ({ kind: "nonce" as const, nonce: "unused" }));
    const provider = stubProvider("tapsell", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(show).not.toHaveBeenCalled();
    expect(deps.claimNonce).not.toHaveBeenCalled();
    expect(outcome).toEqual({ result: "failed", errorReason: "nonce_failed" });
  });

  it("mints a nonce first for Adivery too, then calls show() WITH the minted nonce", async () => {
    // Adivery has no server-side verification either, so it rides the same
    // mint-before-show path as Tapsell — see NONCE_PROVIDER_IDS.
    const deps = makeDeps({ mintNonce: vi.fn(async () => "nonce-adv") });
    const show = vi.fn(async () => ({ kind: "nonce" as const, nonce: "nonce-adv" }));
    const provider = stubProvider("adivery", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(deps.mintNonce).toHaveBeenCalledWith("adivery");
    expect(show).toHaveBeenCalledWith({ userId: "user-1", nonce: "nonce-adv" });
    expect(deps.claimNonce).toHaveBeenCalledWith("nonce-adv", "adivery");
    expect(outcome).toEqual({ result: "granted", errorReason: null });
  });

  it("never calls show() when minting fails for Adivery, and reports nonce_failed", async () => {
    const deps = makeDeps({ mintNonce: vi.fn(async () => null) });
    const show = vi.fn(async () => ({ kind: "nonce" as const, nonce: "unused" }));
    const provider = stubProvider("adivery", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(show).not.toHaveBeenCalled();
    expect(deps.claimNonce).not.toHaveBeenCalled();
    expect(outcome).toEqual({ result: "failed", errorReason: "nonce_failed" });
  });

  it("calls show() WITHOUT minting anything for a provider with SSV (e.g. admob)", async () => {
    const deps = makeDeps();
    const show = vi.fn(async () => ({ kind: "ssv" as const }));
    const provider = stubProvider("admob", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(deps.mintNonce).not.toHaveBeenCalled();
    expect(show).toHaveBeenCalledWith({ userId: "user-1", nonce: undefined });
    expect(deps.pollForGrant).toHaveBeenCalledWith(3);
    expect(outcome).toEqual({ result: "granted", errorReason: null });
  });

  it("polls for the SSV grant and reports pending when the poll times out", async () => {
    const deps = makeDeps({ pollForGrant: vi.fn(async () => false) });
    const show = vi.fn(async () => ({ kind: "ssv" as const }));
    const provider = stubProvider("admob", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(outcome).toEqual({ result: "pending", errorReason: null });
  });

  it("reports failed (no error reason) when a nonce redemption is not accepted server-side", async () => {
    const deps = makeDeps({ claimNonce: vi.fn(async () => false) });
    const show = vi.fn(async () => ({ kind: "nonce" as const, nonce: "nonce-xyz" }));
    const provider = stubProvider("tapsell", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(outcome).toEqual({ result: "failed", errorReason: null });
  });

  it("passes through a dismissed outcome without minting/claiming/polling side effects", async () => {
    const deps = makeDeps();
    const show = vi.fn(async () => ({ kind: "dismissed" as const }));
    const provider = stubProvider("admob", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(deps.claimNonce).not.toHaveBeenCalled();
    expect(deps.pollForGrant).not.toHaveBeenCalled();
    expect(outcome).toEqual({ result: "dismissed", errorReason: null });
  });

  it("surfaces a direct failed outcome's reason unchanged", async () => {
    const deps = makeDeps();
    const show = vi.fn(async () => ({ kind: "failed" as const, reason: "no_fill" }));
    const provider = stubProvider("admob", show);

    const outcome = await runWatchAdFlow(provider, "user-1", 3, deps);

    expect(outcome).toEqual({ result: "failed", errorReason: "no_fill" });
  });
});
