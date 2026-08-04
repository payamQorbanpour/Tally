import { describe, expect, it } from "vitest";
import {
  ACTION_FLAG_KEYS,
  configBool,
  configInt,
  configStr,
  resolveClientConfig,
  resolveConfig,
  type CallerCohorts,
  type ConfigRow,
} from "./aiConfigResolve";

const anon: CallerCohorts = { premium: false, alpha: false, allowlistKeys: new Set() };

function row(
  key: string,
  cohort: ConfigRow["cohort"],
  value: unknown,
  client_visible = true,
): ConfigRow {
  return { key, cohort, value, client_visible };
}

describe("resolveConfig precedence", () => {
  it("falls back to the everyone row when no cohort matches", () => {
    const resolved = resolveConfig([row("ai_enabled", "everyone", true)], anon);
    expect(resolved.get("ai_enabled")).toBe(true);
  });

  it("prefers premium over everyone for a premium caller", () => {
    const rows = [row("ai_enabled", "everyone", false), row("ai_enabled", "premium", true)];
    expect(resolveConfig(rows, { ...anon, premium: true }).get("ai_enabled")).toBe(true);
    expect(resolveConfig(rows, anon).get("ai_enabled")).toBe(false);
  });

  it("prefers alpha over premium when the caller is both", () => {
    const rows = [
      row("ai_enabled", "everyone", false),
      row("ai_enabled", "premium", false),
      row("ai_enabled", "alpha", true),
    ];
    expect(resolveConfig(rows, { ...anon, premium: true, alpha: true }).get("ai_enabled")).toBe(true);
  });

  it("prefers allowlist over every other cohort", () => {
    const rows = [
      row("ai_enabled", "everyone", false),
      row("ai_enabled", "premium", false),
      row("ai_enabled", "alpha", false),
      row("ai_enabled", "allowlist", true),
    ];
    const caller: CallerCohorts = {
      premium: true,
      alpha: true,
      allowlistKeys: new Set(["ai_enabled"]),
    };
    expect(resolveConfig(rows, caller).get("ai_enabled")).toBe(true);
  });

  it("ignores an allowlist row when the caller is not on that key's allowlist", () => {
    const rows = [row("ai_enabled", "everyone", false), row("ai_enabled", "allowlist", true)];
    // On the allowlist for a DIFFERENT key — must not leak across keys.
    const caller: CallerCohorts = {
      premium: false,
      alpha: false,
      allowlistKeys: new Set(["ai_action_transcribe"]),
    };
    expect(resolveConfig(rows, caller).get("ai_enabled")).toBe(false);
  });

  it("omits a key that has no matching row", () => {
    const resolved = resolveConfig([row("ai_enabled", "premium", true)], anon);
    expect(resolved.has("ai_enabled")).toBe(false);
  });
});

describe("resolveClientConfig", () => {
  it("returns only client_visible keys", () => {
    const rows = [
      row("ai_enabled", "everyone", true, true),
      row("ai_expense_prompt", "everyone", "secret prompt", false),
    ];
    const client = resolveClientConfig(rows, anon);
    expect(client).toEqual({ ai_enabled: true });
    expect(client).not.toHaveProperty("ai_expense_prompt");
  });

  it("hides a key whose winning row is server-only even if a visible row exists", () => {
    // Guards against a config mistake leaking a prompt to the bundle.
    const rows = [
      row("ai_model", "everyone", "public", true),
      row("ai_model", "premium", "secret", false),
    ];
    expect(resolveClientConfig(rows, { ...anon, premium: true })).toEqual({});
  });
});

describe("coercion helpers", () => {
  it("reads booleans and falls back on wrong types", () => {
    const m = new Map<string, unknown>([["a", true], ["b", "nope"]]);
    expect(configBool(m, "a", false)).toBe(true);
    expect(configBool(m, "b", false)).toBe(false);
    expect(configBool(m, "missing", true)).toBe(true);
  });

  it("reads positive integers and falls back on anything else", () => {
    const m = new Map<string, unknown>([["a", 30], ["b", 0], ["c", -5], ["d", "20"]]);
    expect(configInt(m, "a", 20)).toBe(30);
    expect(configInt(m, "b", 20)).toBe(20);
    expect(configInt(m, "c", 20)).toBe(20);
    expect(configInt(m, "d", 20)).toBe(20);
  });

  it("reads non-empty strings and falls back otherwise", () => {
    const m = new Map<string, unknown>([["a", "x"], ["b", ""], ["c", 5]]);
    expect(configStr(m, "a", "d")).toBe("x");
    expect(configStr(m, "b", "d")).toBe("d");
    expect(configStr(m, "c", "d")).toBe("d");
  });
});

describe("ACTION_FLAG_KEYS", () => {
  it("maps every proxy action to its flag key", () => {
    expect(ACTION_FLAG_KEYS).toEqual({
      "parse-receipt": "ai_action_parse_receipt",
      "parse-description": "ai_action_parse_description",
      "classify-category": "ai_action_classify_category",
      transcribe: "ai_action_transcribe",
    });
  });
});
