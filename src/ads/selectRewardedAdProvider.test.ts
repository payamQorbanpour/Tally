import { describe, expect, it } from "vitest";
import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider, RewardedAdProviderId } from "./rewardedAdProvider";
import { selectRewardedAdProvider } from "./selectRewardedAdProvider";

const fakeAdmob: RewardedAdProvider = {
  id: "admob",
  isAvailable: () => true,
  show: async () => ({ kind: "ssv" }),
};

const stubProvider = (id: RewardedAdProviderId, available: boolean): RewardedAdProvider => ({
  id,
  isAvailable: () => available,
  show: async () => ({ kind: "dismissed" }),
});

describe("selectRewardedAdProvider", () => {
  it("picks AdMob on iOS when a unit id is configured", () => {
    const p = selectRewardedAdProvider({
      platform: "ios",
      network: "admob",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(p.id).toBe("admob");
  });

  it("picks AdMob on Android when a unit id is configured", () => {
    const p = selectRewardedAdProvider({
      platform: "android",
      network: "admob",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(p.id).toBe("admob");
  });

  it("falls back to the no-op provider on web", () => {
    // No rewarded-ad SDK runs in a browser, so web users spend their signup
    // grant and are then pointed at the mobile app or a pass.
    const p = selectRewardedAdProvider({
      platform: "web",
      network: "admob",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: fakeAdmob,
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(p.id).toBe("none");
    expect(p.isAvailable()).toBe(false);
  });

  it("falls back to the no-op provider when no unit id is configured", () => {
    // Dev builds and any release where the env var was not set.
    const p = selectRewardedAdProvider({
      platform: "ios",
      network: "admob",
      admobUnitId: null,
      admobProvider: fakeAdmob,
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(p.id).toBe("none");
  });

  it("falls back when the AdMob provider reports itself unavailable", () => {
    // The native module is missing — Expo Go, or a build without the plugin.
    const p = selectRewardedAdProvider({
      platform: "android",
      network: "admob",
      admobUnitId: "ca-app-pub-1/2",
      admobProvider: { ...fakeAdmob, isAvailable: () => false },
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(p.id).toBe("none");
  });

  it("prefers Tapsell when the build is configured for it", () => {
    const chosen = selectRewardedAdProvider({
      platform: "android",
      network: "tapsell",
      admobUnitId: "ca-app-pub-x/y",
      admobProvider: stubProvider("admob", true),
      tapsellProvider: stubProvider("tapsell", true),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(chosen.id).toBe("tapsell");
  });

  it("falls back to noop when the Tapsell build has no available provider", () => {
    const chosen = selectRewardedAdProvider({
      platform: "android",
      network: "tapsell",
      admobUnitId: "ca-app-pub-x/y",
      admobProvider: stubProvider("admob", true),
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(chosen.id).toBe("none");
  });

  it("ignores the Tapsell provider on iOS, where the SDK does not exist", () => {
    const chosen = selectRewardedAdProvider({
      platform: "ios",
      network: "tapsell",
      admobUnitId: "ca-app-pub-x/y",
      admobProvider: stubProvider("admob", true),
      tapsellProvider: stubProvider("tapsell", true),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(chosen.id).toBe("admob");
  });

  it("prefers Adivery when the build is configured for it", () => {
    const chosen = selectRewardedAdProvider({
      platform: "android",
      network: "adivery",
      admobUnitId: "ca-app-pub-x/y",
      admobProvider: stubProvider("admob", true),
      tapsellProvider: stubProvider("tapsell", true),
      adiveryProvider: stubProvider("adivery", true),
    });
    expect(chosen.id).toBe("adivery");
  });

  it("falls back to noop when the Adivery build has no available provider", () => {
    // Never cross-falls back to Tapsell or AdMob: an Adivery build is a
    // Bazaar/Myket build, and neither of those is configured in it.
    const chosen = selectRewardedAdProvider({
      platform: "android",
      network: "adivery",
      admobUnitId: "ca-app-pub-x/y",
      admobProvider: stubProvider("admob", true),
      tapsellProvider: stubProvider("tapsell", true),
      adiveryProvider: stubProvider("adivery", false),
    });
    expect(chosen.id).toBe("none");
  });

  it("ignores the Adivery provider on iOS, where the SDK does not exist", () => {
    const chosen = selectRewardedAdProvider({
      platform: "ios",
      network: "adivery",
      admobUnitId: "ca-app-pub-x/y",
      admobProvider: stubProvider("admob", true),
      tapsellProvider: stubProvider("tapsell", false),
      adiveryProvider: stubProvider("adivery", true),
    });
    expect(chosen.id).toBe("admob");
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
