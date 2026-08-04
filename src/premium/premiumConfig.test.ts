import { describe, expect, it, vi } from "vitest";
import { getAppStoreUrl, isIapConfigured } from "./premiumConfig";

// `premiumConfig.ts` now imports `Platform` from `react-native` for
// `getAppStoreUrl`. Vitest runs in Node and can't parse the Flow-typed RN
// sources, so stub it out — mirrors the pattern used in
// `src/premium/bazaarBilling.test.ts` for the same reason. `isIapConfigured`
// never touches `Platform` at runtime.
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

describe("isIapConfigured", () => {
  it("is false when no pass SKU is set, so the UI must not offer a purchase", () => {
    delete process.env.EXPO_PUBLIC_NIGHT_OUT_PASS_ID;
    delete process.env.EXPO_PUBLIC_TRIP_PASS_ID;
    delete process.env.EXPO_PUBLIC_EXPLORER_PASS_ID;
    delete process.env.EXPO_PUBLIC_PREMIUM_SUBSCRIPTION_IDS;
    expect(isIapConfigured()).toBe(false);
  });
});

// `Platform.OS` is mocked to "ios" above, so `getAppStoreUrl` reads
// `EXPO_PUBLIC_IOS_APP_STORE_URL` here.
describe("getAppStoreUrl", () => {
  it("is null when unset for the current platform", () => {
    delete process.env.EXPO_PUBLIC_IOS_APP_STORE_URL;
    expect(getAppStoreUrl()).toBeNull();
  });

  it("is null for a non-http(s) value", () => {
    process.env.EXPO_PUBLIC_IOS_APP_STORE_URL = "itms-apps://apps.apple.com/app/id123";
    expect(getAppStoreUrl()).toBeNull();
  });

  it("returns the configured https URL", () => {
    process.env.EXPO_PUBLIC_IOS_APP_STORE_URL = "https://apps.apple.com/app/id123";
    expect(getAppStoreUrl()).toBe("https://apps.apple.com/app/id123");
  });
});
