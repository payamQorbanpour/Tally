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

describe("client-visible seed keys", () => {
  it("matches keys the client parser actually reads", () => {
    // `ai_enabled`, `ai_max_image_bytes`, and `ai_max_audio_seconds` are
    // string literals duplicated between the migration's seed and
    // `parseAiConfig` above, with nothing else pinning them together — the
    // action-flag guard above only covers the four `ai_action_*` keys. A
    // rename on either side would otherwise silently make `parseAiConfig`
    // fall back to bundled defaults for that key with no failing test.
    const migrationSource = readFileSync(
      "supabase/migrations/20260804000000_ai_config.sql",
      "utf8",
    );
    // Every seeded row looks like: ('key', 'cohort', <value>::jsonb, <client_visible>)
    const rowMatches = [
      ...migrationSource.matchAll(
        /\(\s*'([a-z_]+)'\s*,\s*'[a-z]+'\s*,\s*[^,]+::jsonb\s*,\s*(true|false)\s*\)/g,
      ),
    ];
    // If the regex stops matching (e.g. the migration's formatting changes),
    // fail loudly rather than silently asserting an empty, vacuously-true set.
    expect(rowMatches.length, "no seed rows matched in the migration file").toBeGreaterThan(0);

    const clientVisibleSeedKeys = rowMatches
      .filter(([, , clientVisible]) => clientVisible === "true")
      .map(([, key]) => key);
    expect(
      clientVisibleSeedKeys.length,
      "no client_visible seed rows found — the migration's seed shape may have changed",
    ).toBeGreaterThan(0);

    // Every string literal of the form "ai_..." anywhere in aiConfig.ts: the
    // `ai_enabled` / `ai_max_image_bytes` / `ai_max_audio_seconds` literals
    // passed to `boolAt` / `intAt`, plus the `ACTION_FLAG_KEYS` values.
    const clientSource = readFileSync("src/core/aiConfig.ts", "utf8");
    const clientReadKeys = new Set(
      [...clientSource.matchAll(/"(ai_[a-z_]+)"/g)].map(([, key]) => key),
    );
    expect(clientReadKeys.size, "no ai_* key literals found in aiConfig.ts").toBeGreaterThan(0);

    for (const key of clientVisibleSeedKeys) {
      expect(
        clientReadKeys.has(key),
        `migration seeds "${key}" as client_visible, but src/core/aiConfig.ts does not read it`,
      ).toBe(true);
    }
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
