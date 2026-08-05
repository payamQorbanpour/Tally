import { describe, expect, it } from "vitest";
import { parseRemoteConfig } from "../core/remoteConfig";
import { isOnboardingTourRemotelyEnabled } from "./tourGate";

describe("isOnboardingTourRemotelyEnabled", () => {
  it("defaults to true when the key is absent", () => {
    expect(isOnboardingTourRemotelyEnabled(parseRemoteConfig({ config: {} }))).toBe(true);
  });

  it("defaults to true when the key is malformed", () => {
    const c = parseRemoteConfig({ config: { onboarding_tour_enabled: "nope" } });
    expect(isOnboardingTourRemotelyEnabled(c)).toBe(true);
  });

  it("is false when the remote value is explicitly false — this is what suppresses the auto-start call in useAutoStartTour", () => {
    const c = parseRemoteConfig({ config: { onboarding_tour_enabled: false } });
    expect(isOnboardingTourRemotelyEnabled(c)).toBe(false);
  });

  it("is true when the remote value is explicitly true", () => {
    const c = parseRemoteConfig({ config: { onboarding_tour_enabled: true } });
    expect(isOnboardingTourRemotelyEnabled(c)).toBe(true);
  });
});
