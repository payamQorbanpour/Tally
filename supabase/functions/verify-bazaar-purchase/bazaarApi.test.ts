import { describe, expect, it } from "vitest";
import { buildValidateUrl, parsePurchaseResponse } from "./bazaarApi";

describe("buildValidateUrl", () => {
  it("matches the Developer API v2 template", () => {
    expect(buildValidateUrl("ir.tally.app", "night_pass", "tok123")).toBe(
      "https://pardakht.cafebazaar.ir/devapi/v2/api/validate/ir.tally.app/inapp/night_pass/purchases/tok123/",
    );
  });

  it("percent-encodes path segments so a crafted sku cannot escape the path", () => {
    expect(buildValidateUrl("ir.tally.app", "a/../b", "t")).toContain("a%2F..%2Fb");
  });
});

describe("parsePurchaseResponse", () => {
  it("accepts a paid, unconsumed purchase", () => {
    const r = parsePurchaseResponse(
      200,
      '{"purchaseState":0,"consumptionState":1,"purchaseTime":1700000000000}',
    );
    expect(r).toEqual({
      ok: true,
      purchase: { purchased: true, consumed: false, purchaseTimeMs: 1700000000000 },
    });
  });

  it("reads consumptionState 0 as consumed (inverted vs Google Play)", () => {
    const r = parsePurchaseResponse(200, '{"purchaseState":0,"consumptionState":0}');
    expect(r).toEqual({
      ok: true,
      purchase: { purchased: true, consumed: true, purchaseTimeMs: null },
    });
  });

  it("ignores a legacy `time` key — Bazaar's field is `purchaseTime`", () => {
    const r = parsePurchaseResponse(
      200,
      '{"purchaseState":0,"consumptionState":1,"time":1700000000000}',
    );
    expect(r).toEqual({
      ok: true,
      purchase: { purchased: true, consumed: false, purchaseTimeMs: null },
    });
  });

  it("treats a refunded purchase as not purchased", () => {
    const r = parsePurchaseResponse(200, '{"purchaseState":1,"consumptionState":1}');
    expect(r).toEqual({
      ok: true,
      purchase: { purchased: false, consumed: false, purchaseTimeMs: null },
    });
  });

  it("maps 401 to auth so the caller refreshes the token", () => {
    expect(parsePurchaseResponse(401, "")).toEqual({ ok: false, reason: "auth" });
  });

  it("maps 404 to not_found", () => {
    expect(parsePurchaseResponse(404, "")).toEqual({ ok: false, reason: "not_found" });
  });

  it("maps unparseable success bodies to malformed", () => {
    expect(parsePurchaseResponse(200, "<html>")).toEqual({ ok: false, reason: "malformed" });
  });

  it("maps a literal JSON null body to malformed without throwing", () => {
    expect(parsePurchaseResponse(200, "null")).toEqual({ ok: false, reason: "malformed" });
  });

  it("maps a bare JSON number body to malformed", () => {
    expect(parsePurchaseResponse(200, "42")).toEqual({ ok: false, reason: "malformed" });
  });

  it("maps a bare JSON array body to malformed", () => {
    expect(parsePurchaseResponse(200, "[]")).toEqual({ ok: false, reason: "malformed" });
  });
});
