import { describe, expect, it, vi } from "vitest";
import { AiProxyHttpError, classifyProxyFailure } from "./aiProxy";

// `aiProxy.ts` imports `../auth/supabaseClient` for `callAiProxy`, which pulls
// in React Native / AsyncStorage. Vitest runs in Node and can't parse the
// Flow-typed RN sources, so stub both out — mirrors the pattern used in
// `src/observability/sentry.test.ts` for the same reason. Only the pure
// `classifyProxyFailure` helper and `AiProxyHttpError` class are under test
// here; neither touches these modules at runtime. `vi.mock` calls are hoisted
// above imports by vitest's compiler, so this still takes effect in time.
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));

describe("classifyProxyFailure", () => {
  it("extracts the server error code from a JSON body", () => {
    const err = classifyProxyFailure(402, '{"error":"premium_required"}');
    expect(err).toBeInstanceOf(AiProxyHttpError);
    expect(err.status).toBe(402);
    expect(err.code).toBe("premium_required");
  });

  it("survives a non-JSON body", () => {
    const err = classifyProxyFailure(502, "<html>bad gateway</html>");
    expect(err.status).toBe(502);
    expect(err.code).toBe("");
  });

  it("keeps the detail for the auto error report", () => {
    const err = classifyProxyFailure(429, '{"error":"rate_limited"}');
    expect(err.message).toContain("429");
    expect(err.code).toBe("rate_limited");
  });
});
