import { describe, expect, it, vi } from "vitest";
import { isBelowMinimum } from "./appVersion";

// `appVersion.ts` imports `expo-constants` for `currentAppVersion`. Unmocked,
// it transitively pulls in react-native's Flow-typed `index.js`, which
// Vitest's Node environment can't parse — same reason `sentry.test.ts` mocks
// it. `isBelowMinimum` itself never touches expo-constants, but the
// module-level import still runs at collection time. `vi.mock` calls are
// hoisted above imports by vitest's compiler, so this still takes effect in
// time.
vi.mock("expo-constants", () => ({
  default: { expoConfig: undefined, manifest2: undefined },
}));

describe("isBelowMinimum", () => {
  it("blocks a client below the floor", () => {
    expect(isBelowMinimum("1.1.0", "1.2.0")).toBe(true);
    expect(isBelowMinimum("1.2.0", "1.2.1")).toBe(true);
    expect(isBelowMinimum("0.9.9", "1.0.0")).toBe(true);
  });

  it("allows a client at or above the floor", () => {
    expect(isBelowMinimum("1.2.0", "1.2.0")).toBe(false);
    expect(isBelowMinimum("1.10.0", "1.9.0")).toBe(false); // numeric, not lexical
    expect(isBelowMinimum("2.0.0", "1.99.99")).toBe(false);
  });

  it("FAILS OPEN on anything it cannot parse", () => {
    // A force-update screen that fires wrongly bricks the app for the entire
    // install base, which is strictly worse than anything it prevents. Every
    // uncertain case must resolve to "do not block".
    expect(isBelowMinimum(null, "1.2.0")).toBe(false);
    expect(isBelowMinimum("unknown", "1.2.0")).toBe(false);
    expect(isBelowMinimum("1.2.0", "")).toBe(false);
    expect(isBelowMinimum("1.2.0", "not-a-version")).toBe(false);
    expect(isBelowMinimum("1.2", "1.2.0")).toBe(false);
    expect(isBelowMinimum("1.2.0-beta", "1.2.0")).toBe(false);
  });
});
