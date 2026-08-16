import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_LOCALE,
  defaultCurrencyForAppLocale,
  resolveAppLocale,
  type DeviceLocale,
} from "./localeDefaults";

const phone = (
  languageCode: string | null,
  languageTag: string | null,
  regionCode: string | null,
): DeviceLocale => ({ languageCode, languageTag, regionCode });

/** The remote override that restores the pre-Farsi-default behaviour. */
const englishDefault = { fallback: "en" };

describe("defaultCurrencyForAppLocale", () => {
  // Load-bearing for the whole first-run currency path: `LocaleProvider`
  // seeds `defaultCurrency` from this, and `landOnFirstScreen` denominates
  // the auto-created starter group in it. Farsi must never yield USD.
  it("gives a Farsi device tomans", () => {
    expect(defaultCurrencyForAppLocale("fa")).toBe("IRT");
  });

  it("leaves the other shipped locales alone", () => {
    expect(defaultCurrencyForAppLocale("en")).toBe("USD");
    expect(defaultCurrencyForAppLocale("es")).toBe("EUR");
  });

  it("covers the bundled default, so a first run always has a currency", () => {
    expect(defaultCurrencyForAppLocale(DEFAULT_APP_LOCALE)).toBeTruthy();
  });
});

describe("resolveAppLocale", () => {
  it("keeps a supported phone language regardless of where the user is", () => {
    expect(resolveAppLocale([phone("fa", "fa-IR", "IR")])).toBe("fa");
    expect(resolveAppLocale([phone("fa", "fa-IR", "ES")])).toBe("fa");
  });

  it("falls back to region when the phone language is not one we ship", () => {
    expect(resolveAppLocale([phone("en", "en-US", "IR")], englishDefault)).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-US", "AF")], englishDefault)).toBe("fa");
    expect(resolveAppLocale([phone("ur", "ur-PK", "PK")], englishDefault)).toBe("fa");
  });

  it("scans the whole preference list, not just the first entry", () => {
    const bothMapped = { regionMap: { US: "en", IR: "fa" } };
    expect(
      resolveAppLocale([phone("de", "de-DE", "IR"), phone("de", "de-DE", "US")], bothMapped),
    ).toBe("fa");
    expect(
      resolveAppLocale([phone("de", "de-DE", "US"), phone("de", "de-DE", "IR")], bothMapped),
    ).toBe("en");
  });

  it("reads the region from the language tag when regionCode is absent", () => {
    expect(resolveAppLocale([phone("en", "en-IR", null)], englishDefault)).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-AF", null)], englishDefault)).toBe("fa");
  });

  it("normalises casing and ignores script subtags", () => {
    expect(resolveAppLocale([phone("EN", "en-US", "ir")], englishDefault)).toBe("fa");
    expect(resolveAppLocale([phone("FA", "FA-ir", null)])).toBe("fa");
    expect(resolveAppLocale([phone("zh", "zh-Hant-TW", "TW")], englishDefault)).toBe("en");
  });

  it("degrades to the bundled default on empty or malformed input", () => {
    expect(resolveAppLocale([])).toBe(DEFAULT_APP_LOCALE);
    expect(resolveAppLocale([phone(null, null, null)])).toBe(DEFAULT_APP_LOCALE);
    expect(resolveAppLocale([phone("", "", "")])).toBe(DEFAULT_APP_LOCALE);
    expect(resolveAppLocale([], englishDefault)).toBe("en");
  });
});

describe("Farsi is the bundled default", () => {
  // Tally ships Farsi-first: every first-run device that does not resolve to
  // something more specific starts in Farsi, not English. `locale_default`
  // reverses this remotely — see the "remote overrides" block below.
  it("is fa", () => {
    expect(DEFAULT_APP_LOCALE).toBe("fa");
  });

  it("gives Farsi to a device with no Farsi signal at all", () => {
    expect(resolveAppLocale([phone("de", "de-DE", "DE")])).toBe("fa");
    expect(resolveAppLocale([phone("fr", "fr-FR", "FR")])).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-US", "US")])).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-CA", "CA")])).toBe("fa");
    expect(resolveAppLocale([phone("zh", "zh-Hant-TW", "TW")])).toBe("fa");
  });

  it("is fully reversible from remote config, with no client release", () => {
    // Restores the previous English-last-resort behaviour exactly: Farsi
    // phones and IR/AF/PK devices still get Farsi, everyone else English.
    expect(resolveAppLocale([phone("en", "en-US", "US")], englishDefault)).toBe("en");
    expect(resolveAppLocale([phone("de", "de-DE", "DE")], englishDefault)).toBe("en");
    expect(resolveAppLocale([phone("fa", "fa-IR", "IR")], englishDefault)).toBe("fa");
    expect(resolveAppLocale([phone("en", "en-US", "IR")], englishDefault)).toBe("fa");
  });
});

describe("Spanish is disabled: no longer resolved from device signals", () => {
  it("falls through an es-language phone to the next shipped preference, or the default", () => {
    expect(resolveAppLocale([phone("es", "es-ES", "ES")], englishDefault)).toBe("en");
    expect(resolveAppLocale([phone("es", "es-MX", "MX")], englishDefault)).toBe("en");
    expect(
      resolveAppLocale([phone("es", "es-ES", "DE"), phone("fa", "fa-IR", "DE")]),
    ).toBe("fa"); // es no longer intercepts the language loop; fa (next preference) wins
  });

  it("falls through an ES-region device to the default, since the bundled region map no longer includes ES", () => {
    expect(resolveAppLocale([phone("ca", "ca-ES", "ES")], englishDefault)).toBe("en");
    expect(resolveAppLocale([phone("en", "en-GB", "ES")], englishDefault)).toBe("en");
    expect(resolveAppLocale([phone(null, "en-ES", null)], englishDefault)).toBe("en");
  });
});

describe("resolveAppLocale with remote overrides", () => {
  const en = [{ languageCode: "en", languageTag: "en-US", regionCode: "US" }];
  const enInTurkey = [{ languageCode: "en", languageTag: "en-TR", regionCode: "TR" }];
  const farsiPhone = [{ languageCode: "fa", languageTag: "fa-IR", regionCode: "IR" }];

  it("uses a remote region map to reach a region the bundle does not know", () => {
    expect(resolveAppLocale(enInTurkey, englishDefault)).toBe("en"); // bundled: TR is unmapped
    expect(resolveAppLocale(enInTurkey, { ...englishDefault, regionMap: { TR: "fa" } })).toBe("fa");
  });

  it("merges the remote region map over the bundled one rather than replacing it", () => {
    // An operator adding a single region must not silently drop the bundled
    // ones. Losing IR -> fa would break first-run Farsi for Iran, which is
    // the exact case this remote-config system was built in-house for.
    // `fallback: "en"` here is what makes a dropped region observable at all —
    // with the bundled Farsi default every miss would read as "fa" anyway.
    const onlyTurkey = { regionMap: { TR: "fa" }, fallback: "en" };
    expect(resolveAppLocale(enInTurkey, onlyTurkey)).toBe("fa"); // the added region
    expect(resolveAppLocale([phone("en", "en-US", "IR")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "AF")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-US", "PK")], onlyTurkey)).toBe("fa"); // bundled
    expect(resolveAppLocale([phone("en", "en-GB", "ES")], onlyTurkey)).toBe("en"); // ES is no longer bundled now that Spanish is disabled
    expect(resolveAppLocale([phone("en", "en-US", "US")], onlyTurkey)).toBe("en"); // unmapped
  });

  it("lets a remote entry override a bundled region for that region only", () => {
    const overrideIran = { regionMap: { IR: "en" } };
    expect(resolveAppLocale([phone("de", "de-DE", "IR")], overrideIran)).toBe("en");
    expect(resolveAppLocale([phone("de", "de-DE", "AF")], overrideIran)).toBe("fa"); // untouched
  });

  it("uses a remote fallback when neither language nor region matches", () => {
    // Deliberately still reachable: disabling Spanish removed it from the
    // picker and from device-driven detection only, not from AppLocale or
    // the remote-config fallback path (see the Farsi/RTL Batch A design doc).
    expect(resolveAppLocale(en, { fallback: "es" })).toBe("es");
    // The reversal path this soft-disable relies on: an operator can
    // remotely re-enable Spain via locale_region_map, no rebuild needed.
    expect(resolveAppLocale([phone("en", "en-GB", "ES")], { regionMap: { ES: "es" } })).toBe("es");
  });

  it("never lets a remote value override an explicit device language", () => {
    // A Farsi phone stays Farsi no matter what the server says. Language is
    // the strongest preference a user expresses without opening settings.
    expect(resolveAppLocale(farsiPhone, { regionMap: { IR: "es" }, fallback: "en" })).toBe("fa");
  });

  it("ignores remote values that are not locales we ship", () => {
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "de" } })).toBe(DEFAULT_APP_LOCALE);
    expect(resolveAppLocale(en, { fallback: "de" })).toBe(DEFAULT_APP_LOCALE);
    expect(resolveAppLocale(enInTurkey, { regionMap: { TR: "de" }, fallback: "en" })).toBe("en");
  });
});
