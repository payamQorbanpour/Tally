import { describe, expect, it } from "vitest";
import { isValidEmail, isValidOptionalEmail } from "./emailValidation";

describe("isValidEmail", () => {
  it("accepts common addresses", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("user+tag@sub.example.com")).toBe(true);
    expect(isValidEmail("you@example.com")).toBe(true);
  });

  it("rejects empty and malformed", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("missing@tld")).toBe(false);
    expect(isValidEmail("@nodomain.com")).toBe(false);
    expect(isValidEmail("spaces in@x.com")).toBe(false);
  });
});

describe("isValidOptionalEmail", () => {
  it("allows empty", () => {
    expect(isValidOptionalEmail("")).toBe(true);
    expect(isValidOptionalEmail("   ".trim())).toBe(true);
  });

  it("delegates to isValidEmail when non-empty", () => {
    expect(isValidOptionalEmail("ok@yes.com")).toBe(true);
    expect(isValidOptionalEmail("bad")).toBe(false);
  });
});
