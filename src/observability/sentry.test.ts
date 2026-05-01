/**
 * Tests for the Sentry wrapper. The wrapper guards every entry point on
 * an internal `initialized` flag and on the `EXPO_PUBLIC_SENTRY_DSN` env
 * var — these tests pin both behaviors so we don't accidentally regress
 * back to "Sentry is silently dead in production" the next time we
 * refactor `src/observability/sentry.ts`.
 *
 * Vitest runs in a Node environment, so we mock the React Native /
 * Sentry SDK modules: a real `Sentry.init` would try to bind to a
 * native crash reporter that doesn't exist on the host.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

type SentryMock = {
  init: Mock;
  captureException: Mock;
  captureMessage: Mock;
  setUser: Mock;
  setTag: Mock;
  setContext: Mock;
  reactNavigationIntegration: Mock;
  wrap: Mock;
};

let sentryMock: SentryMock;

vi.mock("expo-constants", () => ({
  default: { expoConfig: { version: "9.9.9-test" }, manifest2: undefined },
}));

vi.mock("@sentry/react-native", () => {
  // Re-create on each `vi.resetModules()` call so per-test assertions
  // start from clean call records.
  sentryMock = {
    init: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setUser: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
    reactNavigationIntegration: vi.fn(() => ({ name: "rni" })),
    wrap: vi.fn((C: unknown) => C),
  };
  return sentryMock;
});

const ORIGINAL_DSN = process.env["EXPO_PUBLIC_SENTRY_DSN"];

// Captured BEFORE any test runs initSentry — every subsequent test
// gets the pristine console handlers back so wrappers don't stack.
const TRUE_ORIGINAL_WARN = console.warn;
const TRUE_ORIGINAL_ERROR = console.error;

beforeEach(() => {
  // Reset modules so the module-level `initialized` flag is fresh per test.
  vi.resetModules();
  // Reset spy call histories — vi.resetModules() recreates the factory
  // but the previous test's call counts on the same `sentryMock` would
  // otherwise leak into the next test's assertions.
  vi.clearAllMocks();
});

afterEach(() => {
  if (ORIGINAL_DSN === undefined) {
    delete process.env["EXPO_PUBLIC_SENTRY_DSN"];
  } else {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = ORIGINAL_DSN;
  }
  console.warn = TRUE_ORIGINAL_WARN;
  console.error = TRUE_ORIGINAL_ERROR;
});

describe("initSentry", () => {
  it("is a no-op when the DSN env var is unset", async () => {
    delete process.env["EXPO_PUBLIC_SENTRY_DSN"];
    const { initSentry } = await import("./sentry");
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it("is a no-op when the DSN is an empty string", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "";
    const { initSentry } = await import("./sentry");
    initSentry();
    expect(sentryMock.init).not.toHaveBeenCalled();
  });

  it("calls Sentry.init with the configured DSN + release tag", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry } = await import("./sentry");
    initSentry();
    expect(sentryMock.init).toHaveBeenCalledTimes(1);
    const cfg = sentryMock.init.mock.calls[0][0];
    expect(cfg.dsn).toBe("https://abc@sentry.io/1");
    expect(cfg.release).toBe("tally@9.9.9-test");
    expect(cfg.sendDefaultPii).toBe(false);
    expect(cfg.tracesSampleRate).toBeGreaterThan(0);
    // The routing-instrumentation singleton should be wired in.
    expect(cfg.integrations).toContainEqual({ name: "rni" });
  });

});

describe("captureError", () => {
  it("does nothing before initSentry has set the DSN", async () => {
    delete process.env["EXPO_PUBLIC_SENTRY_DSN"];
    const { captureError } = await import("./sentry");
    captureError(new Error("boom"));
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("forwards exceptions to Sentry once initialized", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { captureError, initSentry } = await import("./sentry");
    initSentry();
    const err = new Error("nope");
    captureError(err);
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException.mock.calls[0][0]).toBe(err);
  });

  it("attaches React component-stack context when an ErrorInfo is passed", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { captureError, initSentry } = await import("./sentry");
    initSentry();
    const setContext = vi.fn();
    // Simulate Sentry's `withScope` callback signature.
    sentryMock.captureException.mockImplementation((_e, fn) => {
      const scope = { setContext };
      fn?.(scope);
    });
    captureError(new Error("x"), { componentStack: "  at A\n  at B" });
    expect(setContext).toHaveBeenCalledWith("react", {
      componentStack: "  at A\n  at B",
    });
  });
});

describe("setSentryUser", () => {
  it("does nothing before init", async () => {
    delete process.env["EXPO_PUBLIC_SENTRY_DSN"];
    const { setSentryUser } = await import("./sentry");
    setSentryUser({ id: "u1" });
    expect(sentryMock.setUser).not.toHaveBeenCalled();
  });

  it("forwards the id to Sentry.setUser when initialized", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry, setSentryUser } = await import("./sentry");
    initSentry();
    setSentryUser({ id: "user-123" });
    expect(sentryMock.setUser).toHaveBeenCalledWith({ id: "user-123" });
  });

  it("includes email and username when provided", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry, setSentryUser } = await import("./sentry");
    initSentry();
    setSentryUser({
      id: "user-123",
      email: "x@y.com",
      username: "yael",
    });
    expect(sentryMock.setUser).toHaveBeenCalledWith({
      id: "user-123",
      email: "x@y.com",
      username: "yael",
    });
  });

  it("tags the local SQLite user id separately so it's filterable", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry, setSentryUser } = await import("./sentry");
    initSentry();
    setSentryUser({ id: "auth-uid", localUserId: "local-1" });
    expect(sentryMock.setTag).toHaveBeenCalledWith("local_user_id", "local-1");
  });

  it("clears the user with null on sign-out", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry, setSentryUser } = await import("./sentry");
    initSentry();
    setSentryUser(null);
    expect(sentryMock.setUser).toHaveBeenCalledWith(null);
  });
});

describe("setSentryAppContext", () => {
  it("does nothing before init", async () => {
    delete process.env["EXPO_PUBLIC_SENTRY_DSN"];
    const { setSentryAppContext } = await import("./sentry");
    setSentryAppContext({ appVersion: "1.0.0", locale: "en" });
    expect(sentryMock.setContext).not.toHaveBeenCalled();
    expect(sentryMock.setTag).not.toHaveBeenCalled();
  });

  it("writes app version + locale + premium status onto every event", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry, setSentryAppContext } = await import("./sentry");
    initSentry();
    setSentryAppContext({
      appVersion: "1.2.3",
      releaseChannel: "production",
      locale: "fa",
      isPremium: true,
    });
    expect(sentryMock.setContext).toHaveBeenCalledWith("app", {
      version: "1.2.3",
      release_channel: "production",
      locale: "fa",
      is_premium: true,
    });
    expect(sentryMock.setTag).toHaveBeenCalledWith("release_channel", "production");
    expect(sentryMock.setTag).toHaveBeenCalledWith("locale", "fa");
    expect(sentryMock.setTag).toHaveBeenCalledWith("is_premium", "yes");
  });
});

describe("wrapWithSentry", () => {
  it("re-exports Sentry.wrap so callers can wrap the root component", async () => {
    const { wrapWithSentry } = await import("./sentry");
    expect(wrapWithSentry).toBe(sentryMock.wrap);
  });
});

describe("console forwarders", () => {
  // The file-level afterEach restores console.warn/console.error to the
  // pristine handlers between tests, so installConsoleForwarders never
  // stacks across cases.

  it("does not patch console when DSN is missing (initSentry no-ops)", async () => {
    delete process.env["EXPO_PUBLIC_SENTRY_DSN"];
    const { initSentry } = await import("./sentry");
    initSentry();
    // console.warn should still be the original — Sentry should not have
    // been patched in.
    expect(console.warn).toBe(TRUE_ORIGINAL_WARN);
  });

  it("forwards console.warn as a captureException with a synthetic Error so the stack is preserved", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry } = await import("./sentry");
    initSentry();
    const setLevel = vi.fn();
    const setContext = vi.fn();
    sentryMock.captureException.mockImplementation((_e, fn) => {
      fn?.({ setLevel, setContext });
    });
    console.warn("hello", "world");
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const sentErr = sentryMock.captureException.mock.calls[0][0];
    expect(sentErr).toBeInstanceOf(Error);
    expect((sentErr as Error).message).toBe("hello world");
    expect((sentErr as Error).name).toBe("ConsoleWarning");
    expect(setLevel).toHaveBeenCalledWith("warning");
    expect(setContext).toHaveBeenCalledWith("console", expect.objectContaining({
      level: "warning",
      args: ["hello", "world"],
    }));
  });

  it("forwards console.error as captureException at level 'error' with name ConsoleError", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry } = await import("./sentry");
    initSentry();
    const setLevel = vi.fn();
    sentryMock.captureException.mockImplementation((_e, fn) => {
      fn?.({ setLevel, setContext: vi.fn() });
    });
    console.error("kaboom");
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    const sentErr = sentryMock.captureException.mock.calls[0][0] as Error;
    expect(sentErr.message).toBe("kaboom");
    expect(sentErr.name).toBe("ConsoleError");
    expect(setLevel).toHaveBeenCalledWith("error");
  });

  it("uses the original Error (not a synthetic one) when one is logged", async () => {
    process.env["EXPO_PUBLIC_SENTRY_DSN"] = "https://abc@sentry.io/1";
    const { initSentry } = await import("./sentry");
    initSentry();
    const setLevel = vi.fn();
    sentryMock.captureException.mockImplementation((_e, fn) => {
      fn?.({ setLevel, setContext: vi.fn() });
    });
    const err = new Error("real error");
    console.warn("context:", err);
    expect(sentryMock.captureException).toHaveBeenCalledTimes(1);
    expect(sentryMock.captureException.mock.calls[0][0]).toBe(err);
    expect(setLevel).toHaveBeenCalledWith("warning");
    expect(sentryMock.captureMessage).not.toHaveBeenCalled();
  });
});
