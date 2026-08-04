import { beforeEach, describe, expect, it, vi } from "vitest";
import { isTrustedAuthCallbackUrl } from "./authRedirect";

// `authRedirect.ts` imports `Platform` from `react-native` and `createURL`
// from `expo-linking`. Vitest runs in Node and can't parse the Flow-typed RN
// sources, so stub both — mirrors `src/premium/bazaarBilling.test.ts`.
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
}));
vi.mock("expo-linking", () => ({
  createURL: (path: string) => `tally://${path}`,
}));

describe("isTrustedAuthCallbackUrl", () => {
  beforeEach(() => {
    // Both redirects fall back to `Linking.createURL` when unset, which is
    // what a default install does.
    delete process.env.EXPO_PUBLIC_AUTH_EMAIL_REDIRECT;
    delete process.env.EXPO_PUBLIC_AUTH_OAUTH_REDIRECT;
  });

  it("accepts the redirect URL the app itself registered", () => {
    expect(isTrustedAuthCallbackUrl("tally://auth/callback")).toBe(true);
  });

  it("accepts a PKCE code coming back on that URL", () => {
    expect(isTrustedAuthCallbackUrl("tally://auth/callback?code=abc123")).toBe(true);
  });

  it("accepts legacy fragment tokens on that URL", () => {
    expect(
      isTrustedAuthCallbackUrl("tally://auth/callback#access_token=a&refresh_token=b"),
    ).toBe(true);
  });

  it("ignores a trailing slash and case", () => {
    expect(isTrustedAuthCallbackUrl("TALLY://auth/Callback/")).toBe(true);
  });

  // The session-injection vector: any link at all used to be honoured as long
  // as its fragment carried tokens, which let a web page or QR code sign the
  // victim into an attacker's account.
  it("rejects tokens smuggled on a path that is not the callback", () => {
    expect(
      isTrustedAuthCallbackUrl("tally://x#access_token=a&refresh_token=b"),
    ).toBe(false);
  });

  it("rejects tokens smuggled onto an invite deep link", () => {
    expect(
      isTrustedAuthCallbackUrl(
        "tally://group-invite?token=t#access_token=a&refresh_token=b",
      ),
    ).toBe(false);
  });

  it("rejects a foreign origin using our path", () => {
    expect(
      isTrustedAuthCallbackUrl("https://evil.example/auth/callback#access_token=a"),
    ).toBe(false);
  });

  it("rejects another app's scheme", () => {
    expect(
      isTrustedAuthCallbackUrl("nottally://auth/callback#access_token=a"),
    ).toBe(false);
  });

  it("rejects empty and malformed input", () => {
    expect(isTrustedAuthCallbackUrl("")).toBe(false);
    expect(isTrustedAuthCallbackUrl("   ")).toBe(false);
    expect(isTrustedAuthCallbackUrl("#access_token=a&refresh_token=b")).toBe(false);
  });
});
