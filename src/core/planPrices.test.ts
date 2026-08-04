import { describe, expect, it } from "vitest";
import { planPriceFrom } from "./planPrices";
import { parseRemoteConfig } from "./remoteConfig";

const config = parseRemoteConfig({
  config: { plans_price_night: { en: "$4.99", fa: "۹۹٬۰۰۰ تومان" } },
});

describe("planPriceFrom", () => {
  it("returns the remote price for the current locale", () => {
    expect(planPriceFrom(config, "night", "en", "BUNDLED")).toBe("$4.99");
    expect(planPriceFrom(config, "night", "fa", "BUNDLED")).toBe("۹۹٬۰۰۰ تومان");
  });

  it("falls back to the bundled string when the locale is missing", () => {
    // Never show another locale's price: a Spanish user seeing a dollar amount
    // they will not be charged is worse than the bundled string.
    expect(planPriceFrom(config, "night", "es", "BUNDLED")).toBe("BUNDLED");
  });

  it("falls back when the key is absent or malformed", () => {
    expect(planPriceFrom(config, "trip", "en", "BUNDLED")).toBe("BUNDLED");
    const bad = parseRemoteConfig({ config: { plans_price_trip: { en: 5 } } });
    expect(planPriceFrom(bad, "trip", "en", "BUNDLED")).toBe("BUNDLED");
  });

  it("treats a blank remote price as absent", () => {
    const blank = parseRemoteConfig({ config: { plans_price_night: { en: "  " } } });
    expect(planPriceFrom(blank, "night", "en", "BUNDLED")).toBe("BUNDLED");
  });
});
