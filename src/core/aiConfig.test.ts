import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_AI_CONFIG, isActionEnabled, aiConfigFrom } from "./aiConfig";
import { parseRemoteConfig } from "./remoteConfig";

describe("DEFAULT_AI_CONFIG", () => {
  it("is fully enabled, so a client that never reaches the server still works", () => {
    expect(DEFAULT_AI_CONFIG.aiEnabled).toBe(true);
    expect(Object.values(DEFAULT_AI_CONFIG.actions).every(Boolean)).toBe(true);
  });
});

describe("aiConfigFrom", () => {
  it("reads a well-formed payload", () => {
    const config = aiConfigFrom(parseRemoteConfig({
      config: { ai_enabled: true, ai_action_transcribe: false, ai_max_image_bytes: 1024, ai_max_audio_seconds: 30 },
    }));
    expect(config.aiEnabled).toBe(true);
    expect(config.actions.transcribe).toBe(false);
    expect(config.actions["parse-receipt"]).toBe(true); // absent → default
    expect(config.maxImageBytes).toBe(1024);
    expect(config.maxAudioSeconds).toBe(30);
  });

  it("falls back PER KEY rather than discarding the whole config", () => {
    // The point of this test: one bad key must not cost us the good ones.
    const config = aiConfigFrom(parseRemoteConfig({
      config: { ai_enabled: false, ai_action_transcribe: "yes", ai_max_image_bytes: -1 },
    }));
    expect(config.aiEnabled).toBe(false); // good key honoured
    expect(config.actions.transcribe).toBe(true); // bad key defaulted
    expect(config.maxImageBytes).toBe(DEFAULT_AI_CONFIG.maxImageBytes);
  });

  it("ignores unknown keys", () => {
    const config = aiConfigFrom(parseRemoteConfig({ config: { ai_future_thing: false } }));
    expect(config).toEqual(DEFAULT_AI_CONFIG);
  });
});

describe("isActionEnabled", () => {
  it("requires both the master switch and the action flag", () => {
    const base = aiConfigFrom(parseRemoteConfig({ config: {} }));
    expect(isActionEnabled(base, "transcribe")).toBe(true);

    const masterOff = aiConfigFrom(parseRemoteConfig({ config: { ai_enabled: false } }));
    expect(isActionEnabled(masterOff, "transcribe")).toBe(false);

    const actionOff = aiConfigFrom(parseRemoteConfig({ config: { ai_action_transcribe: false } }));
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
      "supabase/migrations/20260804010000_app_config.sql",
      "utf8",
    );
    // Every seeded value row looks like:
    //   ('key', 'cohort', <value>::jsonb, '<visibility>')
    const rowMatches = [
      ...migrationSource.matchAll(
        /\(\s*'([a-z_]+)'\s*,\s*'[a-z]+'\s*,\s*[^,]+::jsonb\s*,\s*'(server|client|public)'\s*\)/g,
      ),
    ];
    expect(rowMatches.length, "no seed rows matched in the migration file").toBeGreaterThan(0);

    const clientVisibleSeedKeys = rowMatches
      .filter(([, , visibility]) => visibility === "client")
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
      readFileSync("supabase/functions/_shared/appConfigResolve.ts", "utf8"),
      "_shared/appConfigResolve.ts",
    );
    const client = pairs(readFileSync("src/core/aiConfig.ts", "utf8"), "src/core/aiConfig.ts");

    expect(client).toEqual(edge);
    expect(client).toHaveLength(4);
  });
});
