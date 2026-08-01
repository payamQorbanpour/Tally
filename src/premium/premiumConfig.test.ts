import { describe, expect, it } from "vitest";
import { isIapConfigured } from "./premiumConfig";

describe("isIapConfigured", () => {
  it("is false when no pass SKU is set, so the UI must not offer a purchase", () => {
    delete process.env.EXPO_PUBLIC_NIGHT_OUT_PASS_ID;
    delete process.env.EXPO_PUBLIC_TRIP_PASS_ID;
    delete process.env.EXPO_PUBLIC_EXPLORER_PASS_ID;
    delete process.env.EXPO_PUBLIC_PREMIUM_SUBSCRIPTION_IDS;
    expect(isIapConfigured()).toBe(false);
  });
});
