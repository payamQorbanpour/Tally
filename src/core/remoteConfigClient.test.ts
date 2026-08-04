import { beforeEach, describe, expect, it, vi } from "vitest";

// `remoteConfigClient.ts` imports `../auth/supabaseClient` (for the fetch
// path), which pulls in React Native / AsyncStorage. Vitest runs in Node and
// can't parse the Flow-typed RN sources, so stub both out — the same pattern
// `src/core/aiProxy.test.ts` and `src/observability/sentry.test.ts` already
// use. Here AsyncStorage is a real in-memory store rather than a null stub,
// because the cache round-trip IS what's under test. `vi.mock` is hoisted
// above the imports, so this takes effect in time.
const store = new Map<string, string>();
vi.mock("react-native", () => ({ Platform: { OS: "ios" } }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => store.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: async (k: string) => {
      store.delete(k);
    },
  },
}));

const { readCachedRemoteConfig, REMOTE_CONFIG_CACHE_KEY } = await import("./remoteConfigClient");
const { configBool, configInt, configLocaleMap, configString, EMPTY_REMOTE_CONFIG } = await import(
  "./remoteConfig"
);

/**
 * Exactly what `RemoteConfigProvider` writes on a successful fetch: the BARE
 * config bag, JSON-stringified. Kept as its own helper so this test fails if
 * the provider's write shape and the client's read shape ever drift apart
 * again.
 */
async function writeCacheTheWayTheProviderDoes(bag: Record<string, unknown>): Promise<void> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  await AsyncStorage.setItem(REMOTE_CONFIG_CACHE_KEY, JSON.stringify(bag));
}

describe("remote config cache write -> read round-trip", () => {
  beforeEach(() => store.clear());

  // This boundary has broken twice during this feature's development, both
  // times because the write side wrapped the bag in an envelope that the read
  // side (`parseRemoteConfig({ config: JSON.parse(raw) })`) then dropped —
  // which fails SILENTLY, as every key simply falls back to its default.
  it("returns every value unchanged, including a false boolean", async () => {
    await writeCacheTheWayTheProviderDoes({
      // `false` is the value class that has bitten this branch before: a
      // dropped bag makes `configBool(..., true)` hand back `true`, so a kill
      // switch that was set to OFF silently reads as ON. A test using only
      // `true` here would pass against a completely broken read path.
      ai_enabled: false,
      sync_enabled: false,
      ai_action_transcribe: true,
      ai_rate_limit_per_min: 30,
      min_supported_version: "1.2.0",
      plans_price_night: { en: "$4.99", fa: "۹۹٬۰۰۰ تومان" },
    });

    const c = await readCachedRemoteConfig();

    expect(configBool(c, "ai_enabled", true)).toBe(false);
    expect(configBool(c, "sync_enabled", true)).toBe(false);
    expect(configBool(c, "ai_action_transcribe", false)).toBe(true);
    expect(configInt(c, "ai_rate_limit_per_min", 99)).toBe(30);
    expect(configString(c, "min_supported_version", "0.0.0")).toBe("1.2.0");
    expect(configLocaleMap(c, "plans_price_night")).toEqual({
      en: "$4.99",
      fa: "۹۹٬۰۰۰ تومان",
    });
  });

  it("does not confuse an absent key with a cached false", async () => {
    await writeCacheTheWayTheProviderDoes({ sync_enabled: false });
    const c = await readCachedRemoteConfig();
    // Present and false: honoured, not defaulted.
    expect(configBool(c, "sync_enabled", true)).toBe(false);
    // Genuinely absent: the caller's fallback applies (fail-open).
    expect(configBool(c, "ai_enabled", true)).toBe(true);
  });

  it("falls back to empty on an unset or corrupt cache", async () => {
    expect(await readCachedRemoteConfig()).toEqual(EMPTY_REMOTE_CONFIG);
    store.set(REMOTE_CONFIG_CACHE_KEY, "{not json");
    expect(await readCachedRemoteConfig()).toEqual(EMPTY_REMOTE_CONFIG);
  });
});
