import { describe, expect, it } from "vitest";
import { parseLocalSyncPref, resolveSyncPref } from "./postLoginSync";

describe("parseLocalSyncPref", () => {
  it("treats a missing key as 'never chosen on this device'", () => {
    expect(parseLocalSyncPref(null)).toBe(null);
    expect(parseLocalSyncPref(undefined)).toBe(null);
    expect(parseLocalSyncPref("")).toBe(null);
  });

  it("reads both stored truthy spellings", () => {
    expect(parseLocalSyncPref("1")).toBe(true);
    expect(parseLocalSyncPref("true")).toBe(true);
  });

  it("treats anything else as an explicit off", () => {
    expect(parseLocalSyncPref("0")).toBe(false);
    expect(parseLocalSyncPref("false")).toBe(false);
  });
});

describe("resolveSyncPref", () => {
  it("inherits the account default when the device has never chosen", () => {
    expect(resolveSyncPref({ accountPref: true, localPref: null })).toEqual({
      kind: "on",
      inherited: true,
    });
    expect(resolveSyncPref({ accountPref: false, localPref: null })).toEqual({
      kind: "off",
    });
    expect(resolveSyncPref({ accountPref: null, localPref: null })).toEqual({
      kind: "off",
    });
  });

  // The shared-laptop guarantee: a device the user deliberately turned sync
  // off on must never be switched back on by the account default.
  it("never overrides an explicit local off", () => {
    expect(resolveSyncPref({ accountPref: true, localPref: false })).toEqual({
      kind: "off",
    });
  });

  it("honours an explicit local on even when the account says off", () => {
    expect(resolveSyncPref({ accountPref: false, localPref: true })).toEqual({
      kind: "on",
      inherited: false,
    });
    expect(resolveSyncPref({ accountPref: null, localPref: true })).toEqual({
      kind: "on",
      inherited: false,
    });
  });

  it("marks inherited only when the value came from the account", () => {
    expect(resolveSyncPref({ accountPref: true, localPref: true })).toEqual({
      kind: "on",
      inherited: false,
    });
  });
});
