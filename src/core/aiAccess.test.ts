import { describe, expect, it } from "vitest";
import { resolveAiAccess, type AiAccessInput } from "./aiAccess";

const base: AiAccessInput = {
  signedIn: true,
  emailConfirmed: true,
  isPremium: false,
  balance: 0,
  adsAvailable: true,
};

describe("resolveAiAccess", () => {
  it("requires sign-in before anything else", () => {
    expect(resolveAiAccess({ ...base, signedIn: false })).toBe("needs_signin");
    // Even a premium user with credits has to be signed in — the proxy
    // rejects anonymous callers, so letting them through would 401.
    expect(
      resolveAiAccess({ ...base, signedIn: false, isPremium: true, balance: 99 }),
    ).toBe("needs_signin");
  });

  it("treats an unconfirmed email as not signed in", () => {
    expect(resolveAiAccess({ ...base, emailConfirmed: false })).toBe("needs_signin");
  });

  it("allows premium users regardless of balance", () => {
    expect(resolveAiAccess({ ...base, isPremium: true, balance: 0 })).toBe("allowed");
  });

  it("allows a non-premium user holding credits", () => {
    expect(resolveAiAccess({ ...base, balance: 1 })).toBe("allowed");
  });

  it("asks for credits when the balance is empty and ads can be shown", () => {
    expect(resolveAiAccess({ ...base, balance: 0, adsAvailable: true })).toBe("needs_credits");
  });

  it("reports no ads available when the balance is empty and there is no provider", () => {
    // Web: the signup grant is spendable but there is no way to earn more.
    expect(resolveAiAccess({ ...base, balance: 0, adsAvailable: false })).toBe(
      "no_ads_available",
    );
  });

  it("ignores ad availability while the user still has credits", () => {
    expect(resolveAiAccess({ ...base, balance: 2, adsAvailable: false })).toBe("allowed");
  });

  it("treats a negative balance as empty", () => {
    expect(resolveAiAccess({ ...base, balance: -1 })).toBe("needs_credits");
  });
});
