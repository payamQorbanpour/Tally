import { describe, expect, it } from "vitest";
import { resolveAppLocale, type DeviceLocale } from "./localeDefaults";

const phone = (
  languageCode: string | null,
  languageTag: string | null,
  regionCode: string | null,
): DeviceLocale => ({ languageCode, languageTag, regionCode });

describe("resolveAppLocale", () => {
  it("keeps a supported phone language regardless of where the user is", () => {
    expect(resolveAppLocale([phone("fa", "fa-IR", "IR")])).toBe("fa");
    expect(resolveAppLocale([phone("fa", "fa-IR", "ES")])).toBe("fa");
    expect(resolveAppLocale([phone("es", "es-ES", "ES")])).toBe("es");
    expect(resolveAppLocale([phone("es", "es-MX", "MX")])).toBe("es");
  });

  it("falls back to region when the phone language is not one we ship", () => {
    expect(resolveAppLocale([phone("en", "en-US", "IR")])).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-US", "AF")])).toBe("fa");
    expect(resolveAppLocale([phone("ur", "ur-PK", "PK")])).toBe("fa");
    expect(resolveAppLocale([phone("ca", "ca-ES", "ES")])).toBe("es");
    expect(resolveAppLocale([phone("en", "en-GB", "ES")])).toBe("es");
  });

  it("defaults to English for Europe and the Americas", () => {
    expect(resolveAppLocale([phone("de", "de-DE", "DE")])).toBe("en");
    expect(resolveAppLocale([phone("fr", "fr-FR", "FR")])).toBe("en");
    expect(resolveAppLocale([phone("en", "en-US", "US")])).toBe("en");
    expect(resolveAppLocale([phone("en", "en-CA", "CA")])).toBe("en");
  });

  it("honours the order of the OS preference list", () => {
    expect(
      resolveAppLocale([phone("de", "de-DE", "DE"), phone("es", "es-ES", "DE")]),
    ).toBe("es");
    expect(
      resolveAppLocale([phone("es", "es-ES", "DE"), phone("fa", "fa-IR", "DE")]),
    ).toBe("es");
  });

  it("reads the region from the language tag when regionCode is absent", () => {
    expect(resolveAppLocale([phone("en", "en-IR", null)])).toBe("fa");
    expect(resolveAppLocale([phone(null, "en-ES", null)])).toBe("es");
  });

  it("normalises casing and ignores script subtags", () => {
    expect(resolveAppLocale([phone("EN", "en-US", "ir")])).toBe("fa");
    expect(resolveAppLocale([phone("FA", "FA-ir", null)])).toBe("fa");
    expect(resolveAppLocale([phone("zh", "zh-Hant-TW", "TW")])).toBe("en");
  });

  it("degrades to English on empty or malformed input", () => {
    expect(resolveAppLocale([])).toBe("en");
    expect(resolveAppLocale([phone(null, null, null)])).toBe("en");
    expect(resolveAppLocale([phone("", "", "")])).toBe("en");
  });
});

describe("resolveAppLocale with remote overrides", () => {
  const en = [{ languageCode: "en", languageTag: "en-US", regionCode: "US" }];
  const enInTurkey = [{ languageCode: "en", languageTag: "en-TR", regionCode: "TR" }];
  const farsiPhone = [{ languageCode: "fa", languageTag: "fa-IR", regionCode: "IR" }];

  it("uses a remote region map to reach a region the bundle does not know", () => {
    expect(resolveAppLocale(enInTurkey)).toBe("en"); // bundled: TR is unmapped
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "fa" } })).toBe("fa");
  });

  it("merges the remote region map over the bundled one rather than replacing it", () => {
    // An operator adding a single region must not silently drop the bundled
    // ones. Losing IR -> fa would break first-run Farsi for Iran, which is
    // the exact case this remote-config system was built in-house for.
    const onlyTurkey = { regionMap: { TR: "fa" } };
    expect(resolveAppLocale(enInTurkey, onlyTurkey)).toBe("fa"); // the added region
    expect(resolveAppLocale([phone("en", "en-US", "IR")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "AF")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "PK")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-GB", "ES")], onlyTurkey)).toBe("es"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "US")], onlyTurkey)).toBe("en"); // unmapped
  });

  it("lets a remote entry override a bundled region for that region only", () => {
    const overrideIran = { regionMap: { IR: "en" } };
    expect(resolveAppLocale([phone("de", "de-DE", "IR")], overrideIran)).toBe("en");
    expect(resolveAppLocale([phone("de", "de-DE", "AF")], overrideIran)).toBe("fa"); // untouched
  });

  it("uses a remote fallback when neither language nor region matches", () => {
    expect(resolveAppLocale(en, { fallback: "es" })).toBe("es");
  });

  it("never lets a remote value override an explicit device language", () => {
    // A Farsi phone stays Farsi no matter what the server says. Language is
    // the strongest preference a user expresses without opening settings.
    expect(resolveAppLocale(farsiPhone, { regionMap: { IR: "es" }, fallback: "en" })).toBe("fa");
  });

  it("ignores remote values that are not locales we ship", () => {
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "de" } })).toBe("en");
    expect(resolveAppLocale(en, { fallback: "de" })).toBe("en");
  });
});
