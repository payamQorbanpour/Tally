import { describe, expect, it } from "vitest";
import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";
import { selectRewardedAdProvider } from "./selectRewardedAdProvider";

const fakeAdmob: RewardedAdProvider = {
  id: "admob",
  isAvailable: () => true,
  show: async () => ({ kind: "ssv" }),
};

describe("selectRewardedAdProvider", () => {
  it("picks AdMob on iOS when a unit id is configured", () => {
    const p = selectRewardedAdProvider({
      platform: "ios",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("admob");
  });

  it("picks AdMob on Android when a unit id is configured", () => {
    const p = selectRewardedAdProvider({
      platform: "android",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("admob");
  });

  it("falls back to the no-op provider on web", () => {
    // No rewarded-ad SDK runs in a browser, so web users spend their signup
    // grant and are then pointed at the mobile app or a pass.
    const p = selectRewardedAdProvider({
      platform: "web",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("none");
    expect(p.isAvailable()).toBe(false);
  });

  it("falls back to the no-op provider when no unit id is configured", () => {
    // Dev builds and any release where the env var was not set.
    const p = selectRewardedAdProvider({
      platform: "ios",
      admobUnitId: null,
      admobProvider: fakeAdmob,
    });
    expect(p.id).toBe("none");
  });

  it("falls back when the AdMob provider reports itself unavailable", () => {
    // The native module is missing — Expo Go, or a build without the plugin.
    const p = selectRewardedAdProvider({
      platform: "android",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: { ...fakeAdmob, isAvailable: () => false },
    });
    expect(p.id).toBe("none");
  });
});

describe("noopProvider", () => {
  it("is never available", () => {
    expect(noopProvider.isAvailable()).toBe(false);
  });

  it("reports failure rather than throwing when shown", async () => {
    await expect(noopProvider.show({ userId: "u-1" })).resolves.toEqual({
      kind: "failed",
      reason: "no_provider",
    });
  });
});
