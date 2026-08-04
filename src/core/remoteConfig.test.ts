import { describe, expect, it } from "vitest";
import {
  configBool,
  configInt,
  configLocaleMap,
  configString,
  EMPTY_REMOTE_CONFIG,
  parseRemoteConfig,
  parseTtlSeconds,
} from "./remoteConfig";

describe("parseRemoteConfig", () => {
  it("reads a well-formed payload", () => {
    const c = parseRemoteConfig({ config: { ai_enabled: false, sync_enabled: true } });
    expect(configBool(c, "ai_enabled", true)).toBe(false);
    expect(configBool(c, "sync_enabled", false)).toBe(true);
  });

  it("returns empty for junk input rather than throwing", () => {
    expect(parseRemoteConfig(null)).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig("nope")).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig({})).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig({ config: 5 })).toEqual(EMPTY_REMOTE_CONFIG);
    expect(parseRemoteConfig({ config: [] })).toEqual(EMPTY_REMOTE_CONFIG);
  });
});

describe("parseTtlSeconds", () => {
  it("reads the server's TTL for each audience", () => {
    expect(parseTtlSeconds({ config: {}, ttlSeconds: 300 })).toBe(300); // public
    expect(parseTtlSeconds({ config: {}, ttlSeconds: 900 })).toBe(900); // signed-in
  });

  it("returns null when absent or unusable, so the caller keeps its default", () => {
    expect(parseTtlSeconds({ config: {} })).toBeNull();
    expect(parseTtlSeconds({ ttlSeconds: "300" })).toBeNull();
    expect(parseTtlSeconds({ ttlSeconds: 0 })).toBeNull();
    expect(parseTtlSeconds({ ttlSeconds: -60 })).toBeNull();
    expect(parseTtlSeconds({ ttlSeconds: Number.NaN })).toBeNull();
    expect(parseTtlSeconds({ ttlSeconds: Number.POSITIVE_INFINITY })).toBeNull();
    expect(parseTtlSeconds(null)).toBeNull();
    expect(parseTtlSeconds("nope")).toBeNull();
  });
});

describe("typed accessors fall back PER KEY", () => {
  it("does not let one malformed value poison its neighbours", () => {
    // The point of this test: a single server-side typo must cost exactly one
    // key, not silently revert every flag.
    const c = parseRemoteConfig({
      config: { ai_enabled: false, ai_action_transcribe: "yes", ai_max_image_bytes: -1 },
    });
    expect(configBool(c, "ai_enabled", true)).toBe(false); // good key honoured
    expect(configBool(c, "ai_action_transcribe", true)).toBe(true); // bad key defaulted
    expect(configInt(c, "ai_max_image_bytes", 4_000_000)).toBe(4_000_000);
  });

  it("rejects non-integers and non-positive integers", () => {
    const c = parseRemoteConfig({ config: { a: 1.5, b: 0, d: 7 } });
    expect(configInt(c, "a", 99)).toBe(99);
    expect(configInt(c, "b", 99)).toBe(99);
    expect(configInt(c, "d", 99)).toBe(7);
  });

  it("treats a blank string as absent", () => {
    const c = parseRemoteConfig({ config: { a: "   ", b: "x" } });
    expect(configString(c, "a", "fallback")).toBe("fallback");
    expect(configString(c, "b", "fallback")).toBe("x");
  });

  it("returns null for an absent or malformed locale map", () => {
    const c = parseRemoteConfig({
      config: { good: { en: "$5" }, bad: { en: 5 }, worse: "nope", empty: {} },
    });
    expect(configLocaleMap(c, "good")).toEqual({ en: "$5" });
    expect(configLocaleMap(c, "bad")).toBeNull();
    expect(configLocaleMap(c, "worse")).toBeNull();
    expect(configLocaleMap(c, "empty")).toBeNull();
    expect(configLocaleMap(c, "missing")).toBeNull();
  });
});
