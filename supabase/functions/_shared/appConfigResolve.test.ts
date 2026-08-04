import { describe, expect, it } from "vitest";
import {
  ACTION_FLAG_KEYS,
  ANON_CALLER,
  configBool,
  configInt,
  configStr,
  resolveConfig,
  resolveForAudience,
  type CallerCohorts,
  type ConfigRow,
} from "./appConfigResolve";

const anon: CallerCohorts = { premium: false, alpha: false, allowlistKeys: new Set() };

function row(
  key: string,
  cohort: ConfigRow["cohort"],
  value: unknown,
  visibility: ConfigRow["visibility"] = "client",
): ConfigRow {
  return { key, cohort, value, visibility };
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

describe("resolveForAudience", () => {
  const rows: ConfigRow[] = [
    { key: "ai_enabled", cohort: "everyone", value: true, visibility: "client" },
    { key: "ai_rate_limit_per_min", cohort: "everyone", value: 20, visibility: "server" },
    { key: "sync_enabled", cohort: "everyone", value: true, visibility: "public" },
  ];

  it("gives an anonymous caller only public keys", () => {
    expect(resolveForAudience(rows, ANON_CALLER, "public")).toEqual({ sync_enabled: true });
  });

  it("gives a signed-in caller public and client keys, never server ones", () => {
    const out = resolveForAudience(rows, ANON_CALLER, "client");
    expect(out).toEqual({ sync_enabled: true, ai_enabled: true });
    expect(out).not.toHaveProperty("ai_rate_limit_per_min");
  });

  it("takes visibility from the WINNING row, so a server override cannot be bypassed", () => {
    // A premium user matches the premium row; its 'server' visibility must win
    // over the more visible 'everyone' row it outranks. Otherwise a targeted
    // server-only override would leak to the client.
    const overridden: ConfigRow[] = [
      { key: "ai_enabled", cohort: "everyone", value: true, visibility: "client" },
      { key: "ai_enabled", cohort: "premium", value: false, visibility: "server" },
    ];
    const premium = { premium: true, alpha: false, allowlistKeys: new Set<string>() };
    expect(resolveForAudience(overridden, premium, "client")).toEqual({});
  });
});
