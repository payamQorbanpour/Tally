import { describe, expect, it } from "vitest";
import { cacheHeaders, splitLegacyShape, TTL_SECONDS } from "./appConfigResponse";

describe("cacheHeaders", () => {
  it("lets a CDN cache the anonymous payload", () => {
    // The anonymous response is identical for every install, which is the
    // entire reason it takes no request parameters.
    expect(cacheHeaders("public")["Cache-Control"]).toBe("public, max-age=300, s-maxage=300");
  });

  it("never stores a per-user payload", () => {
    expect(cacheHeaders("client")["Cache-Control"]).toBe("private, no-store");
  });
});

describe("TTL_SECONDS", () => {
  it("refreshes anonymous config faster than per-user config", () => {
    // Public keys carry the incident switches, so they must land sooner.
    expect(TTL_SECONDS.public).toBe(300);
    expect(TTL_SECONDS.client).toBe(900);
  });
});

describe("splitLegacyShape", () => {
  it("reproduces the old {flags, limits} split for get-ai-config callers", () => {
    expect(splitLegacyShape({ ai_enabled: true, ai_max_image_bytes: 4000000 })).toEqual({
      flags: { ai_enabled: true },
      limits: { ai_max_image_bytes: 4000000 },
    });
  });

  it("drops values that are neither boolean nor number", () => {
    // The old client had no way to parse anything else; shipping one would be
    // a shape the installed build cannot read.
    expect(splitLegacyShape({ a: "x", b: null, c: true })).toEqual({
      flags: { c: true },
      limits: {},
    });
  });
});
