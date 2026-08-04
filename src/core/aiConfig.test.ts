import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_AI_CONFIG, isActionEnabled, parseAiConfig } from "./aiConfig";

describe("DEFAULT_AI_CONFIG", () => {
  it("is fully enabled, so a client that never reaches the server still works", () => {
    expect(DEFAULT_AI_CONFIG.aiEnabled).toBe(true);
    expect(Object.values(DEFAULT_AI_CONFIG.actions).every(Boolean)).toBe(true);
  });
});

describe("parseAiConfig", () => {
  it("reads a well-formed payload", () => {
    const config = parseAiConfig({
      flags: { ai_enabled: true, ai_action_transcribe: false },
      limits: { ai_max_image_bytes: 1024, ai_max_audio_seconds: 30 },
    });
    expect(config.aiEnabled).toBe(true);
    expect(config.actions.transcribe).toBe(false);
    expect(config.actions["parse-receipt"]).toBe(true); // absent → default
    expect(config.maxImageBytes).toBe(1024);
    expect(config.maxAudioSeconds).toBe(30);
  });

  it("falls back PER KEY rather than discarding the whole config", () => {
    // The point of this test: one bad key must not cost us the good ones.
    const config = parseAiConfig({
      flags: { ai_enabled: false, ai_action_transcribe: "yes" },
      limits: { ai_max_image_bytes: -1 },
    });
    expect(config.aiEnabled).toBe(false); // good key honoured
    expect(config.actions.transcribe).toBe(true); // bad key defaulted
    expect(config.maxImageBytes).toBe(DEFAULT_AI_CONFIG.maxImageBytes);
  });

  it("returns defaults for junk input", () => {
    expect(parseAiConfig(null)).toEqual(DEFAULT_AI_CONFIG);
    expect(parseAiConfig("nope")).toEqual(DEFAULT_AI_CONFIG);
    expect(parseAiConfig({})).toEqual(DEFAULT_AI_CONFIG);
    expect(parseAiConfig({ flags: 5, limits: [] })).toEqual(DEFAULT_AI_CONFIG);
  });

  it("ignores unknown keys", () => {
    const config = parseAiConfig({ flags: { ai_future_thing: false }, limits: {} });
    expect(config).toEqual(DEFAULT_AI_CONFIG);
  });
});

describe("isActionEnabled", () => {
  it("requires both the master switch and the action flag", () => {
    const base = parseAiConfig({ flags: {}, limits: {} });
    expect(isActionEnabled(base, "transcribe")).toBe(true);

    const masterOff = parseAiConfig({ flags: { ai_enabled: false }, limits: {} });
    expect(isActionEnabled(masterOff, "transcribe")).toBe(false);

    const actionOff = parseAiConfig({ flags: { ai_action_transcribe: false }, limits: {} });
    expect(isActionEnabled(actionOff, "transcribe")).toBe(false);
    expect(isActionEnabled(actionOff, "parse-receipt")).toBe(true);
  });
});

describe("action flag keys", () => {
  it("matches the map compiled into the Edge Function resolver", () => {
    // Same guard as aiCreditCost.test.ts: the Edge Function cannot import
    // from src/, so both sides keep a copy. This fails if they drift.
    const pairs = (source: string, where: string): string[] => {
      const match = source.match(/ACTION_FLAG_KEYS[^=]*=\s*\{([\s\S]*?)\}/);
      expect(match, `ACTION_FLAG_KEYS not found in ${where}`).toBeTruthy();
      return [...match![1].matchAll(/"?([a-z-]+)"?\s*:\s*"([a-z_]+)"/g)]
        .map(([, action, key]) => `${action}=${key}`)
        .sort();
    };

    const edge = pairs(
      readFileSync("supabase/functions/_shared/aiConfigResolve.ts", "utf8"),
      "_shared/aiConfigResolve.ts",
    );
    const client = pairs(readFileSync("src/core/aiConfig.ts", "utf8"), "src/core/aiConfig.ts");

    expect(client).toEqual(edge);
    expect(client).toHaveLength(4);
  });
});
