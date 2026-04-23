/**
 * ISO 4217 codes with human-readable labels. Minor-unit exponents follow ISO.
 *
 * IRR / IRT use two decimal places in the UI (like USD): amounts are stored in
 * 1/100 of a unit (see one-time SQLite migration `irt_irr_minor_x100_v1`).
 * 10 rials = 1 toman (e.g. 1000 IRR and 100 IRT represent the same value).
 */

/** Currencies with no fractional minor unit in storage/display. */
const ZERO_DECIMAL = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "ISK",
  "JPY",
  "KMF",
  "KRW",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

/** Currencies that use three decimal places. */
const THREE_DECIMAL = new Set(["BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"]);

export function currencyMinorExponent(code: string): number {
  const c = code.trim().toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/** Persian / Arabic-Indic digits → ASCII 0–9 for consistent grouping. */
function normalizeAsciiDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x06f0 && c <= 0x06f9) {
      out += String(c - 0x06f0);
    } else if (c >= 0x0660 && c <= 0x0669) {
      out += String(c - 0x0660);
    } else if (c === 0x066b) {
      // Arabic decimal separator (common on RTL locale keyboards) → ASCII `.`
      out += ".";
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Strip invisible bidi marks and zero-width / format characters so parsing/formatting stays
 * stable in RTL TextInputs. `parseFloat("162\\u200b.5")` is `162` otherwise — users would see
 * decimals disappear when the OS/IME inserts ZWSP, ZWNJ, soft hyphen, etc.
 */
function stripMoneyFieldDecorators(s: string): string {
  return s.replace(
    /[\u00ad\u200b-\u200d\u200e\u200f\u2060\u2066-\u2069\ufeff]/g,
    "",
  );
}

/** US-style grouping: `1000000` → `1,000,000` (digit-only ASCII string). */
export function addThousandsSeparators(digitString: string): string {
  if (!digitString) return "";
  const digits = normalizeAsciiDigits(digitString).replace(/\D/g, "");
  if (!digits) return "";
  const parts: string[] = [];
  for (let i = digits.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    parts.unshift(digits.slice(start, i));
  }
  return parts.join(",");
}

/**
 * Finalize formatted money for TextInput `value`. We intentionally do **not** prepend U+200E
 * here: a leading LTR embed in controlled React Native TextInputs desyncs `onChangeText` from
 * the `value` prop (digits / “.” flash then disappear on iOS/Android). Use `direction` /
 * `writingDirection: "ltr"` on money fields instead for RTL screens.
 */
function withLtrMoneyDisplay(formatted: string): string {
  if (!formatted) return "";
  return stripMoneyFieldDecorators(formatted);
}

export type CurrencyOption = { code: string; label: string };

const RAW: CurrencyOption[] = [
  { code: "AED", label: "United Arab Emirates — UAE dirham" },
  { code: "AFN", label: "Afghanistan — afghani" },
  { code: "ALL", label: "Albania — lek" },
  { code: "AMD", label: "Armenia — dram" },
  { code: "ANG", label: "Caribbean Netherlands — guilder" },
  { code: "AOA", label: "Angola — kwanza" },
  { code: "ARS", label: "Argentina — peso" },
  { code: "AUD", label: "Australia — dollar" },
  { code: "AWG", label: "Aruba — florin" },
  { code: "AZN", label: "Azerbaijan — manat" },
  { code: "BAM", label: "Bosnia and Herzegovina — convertible mark" },
  { code: "BBD", label: "Barbados — dollar" },
  { code: "BDT", label: "Bangladesh — taka" },
  { code: "BGN", label: "Bulgaria — lev" },
  { code: "BHD", label: "Bahrain — dinar" },
  { code: "BIF", label: "Burundi — franc" },
  { code: "BMD", label: "Bermuda — dollar" },
  { code: "BND", label: "Brunei — dollar" },
  { code: "BOB", label: "Bolivia — boliviano" },
  { code: "BRL", label: "Brazil — real" },
  { code: "BSD", label: "Bahamas — dollar" },
  { code: "BTN", label: "Bhutan — ngultrum" },
  { code: "BWP", label: "Botswana — pula" },
  { code: "BYN", label: "Belarus — ruble" },
  { code: "BZD", label: "Belize — dollar" },
  { code: "CAD", label: "Canada — dollar" },
  { code: "CDF", label: "DR Congo — franc" },
  { code: "CHF", label: "Switzerland — franc" },
  { code: "CLP", label: "Chile — peso" },
  { code: "CNY", label: "China — yuan" },
  { code: "COP", label: "Colombia — peso" },
  { code: "CRC", label: "Costa Rica — colón" },
  { code: "CUP", label: "Cuba — peso" },
  { code: "CVE", label: "Cabo Verde — escudo" },
  { code: "CZK", label: "Czech Republic — koruna" },
  { code: "DJF", label: "Djibouti — franc" },
  { code: "DKK", label: "Denmark — krone" },
  { code: "DOP", label: "Dominican Republic — peso" },
  { code: "DZD", label: "Algeria — dinar" },
  { code: "EGP", label: "Egypt — pound" },
  { code: "ERN", label: "Eritrea — nakfa" },
  { code: "ETB", label: "Ethiopia — birr" },
  { code: "EUR", label: "Eurozone — euro" },
  { code: "FJD", label: "Fiji — dollar" },
  { code: "FKP", label: "Falkland Islands — pound" },
  { code: "GBP", label: "United Kingdom — pound" },
  { code: "GEL", label: "Georgia — lari" },
  { code: "GHS", label: "Ghana — cedi" },
  { code: "GIP", label: "Gibraltar — pound" },
  { code: "GMD", label: "Gambia — dalasi" },
  { code: "GNF", label: "Guinea — franc" },
  { code: "GTQ", label: "Guatemala — quetzal" },
  { code: "GYD", label: "Guyana — dollar" },
  { code: "HKD", label: "Hong Kong — dollar" },
  { code: "HNL", label: "Honduras — lempira" },
  { code: "HTG", label: "Haiti — gourde" },
  { code: "HUF", label: "Hungary — forint" },
  { code: "IDR", label: "Indonesia — rupiah" },
  { code: "ILS", label: "Israel — shekel" },
  { code: "INR", label: "India — rupee" },
  { code: "IQD", label: "Iraq — dinar" },
  { code: "IRR", label: "Iran — Iranian rial" },
  { code: "IRT", label: "Iran — Iranian toman" },
  { code: "ISK", label: "Iceland — króna" },
  { code: "JMD", label: "Jamaica — dollar" },
  { code: "JOD", label: "Jordan — dinar" },
  { code: "JPY", label: "Japan — yen" },
  { code: "KES", label: "Kenya — shilling" },
  { code: "KGS", label: "Kyrgyzstan — som" },
  { code: "KHR", label: "Cambodia — riel" },
  { code: "KMF", label: "Comoros — franc" },
  { code: "KRW", label: "South Korea — won" },
  { code: "KWD", label: "Kuwait — dinar" },
  { code: "KYD", label: "Cayman Islands — dollar" },
  { code: "KZT", label: "Kazakhstan — tenge" },
  { code: "LAK", label: "Laos — kip" },
  { code: "LBP", label: "Lebanon — pound" },
  { code: "LKR", label: "Sri Lanka — rupee" },
  { code: "LRD", label: "Liberia — dollar" },
  { code: "LSL", label: "Lesotho — loti" },
  { code: "LYD", label: "Libya — dinar" },
  { code: "MAD", label: "Morocco — dirham" },
  { code: "MDL", label: "Moldova — leu" },
  { code: "MGA", label: "Madagascar — ariary" },
  { code: "MKD", label: "North Macedonia — denar" },
  { code: "MMK", label: "Myanmar — kyat" },
  { code: "MNT", label: "Mongolia — tögrög" },
  { code: "MOP", label: "Macau — pataca" },
  { code: "MRU", label: "Mauritania — ouguiya" },
  { code: "MUR", label: "Mauritius — rupee" },
  { code: "MVR", label: "Maldives — rufiyaa" },
  { code: "MWK", label: "Malawi — kwacha" },
  { code: "MXN", label: "Mexico — peso" },
  { code: "MYR", label: "Malaysia — ringgit" },
  { code: "MZN", label: "Mozambique — metical" },
  { code: "NAD", label: "Namibia — dollar" },
  { code: "NGN", label: "Nigeria — naira" },
  { code: "NIO", label: "Nicaragua — córdoba" },
  { code: "NOK", label: "Norway — krone" },
  { code: "NPR", label: "Nepal — rupee" },
  { code: "NZD", label: "New Zealand — dollar" },
  { code: "OMR", label: "Oman — rial" },
  { code: "PAB", label: "Panama — balboa" },
  { code: "PEN", label: "Peru — sol" },
  { code: "PGK", label: "Papua New Guinea — kina" },
  { code: "PHP", label: "Philippines — peso" },
  { code: "PKR", label: "Pakistan — rupee" },
  { code: "PLN", label: "Poland — złoty" },
  { code: "PYG", label: "Paraguay — guaraní" },
  { code: "QAR", label: "Qatar — riyal" },
  { code: "RON", label: "Romania — leu" },
  { code: "RSD", label: "Serbia — dinar" },
  { code: "RUB", label: "Russia — ruble" },
  { code: "RWF", label: "Rwanda — franc" },
  { code: "SAR", label: "Saudi Arabia — riyal" },
  { code: "SBD", label: "Solomon Islands — dollar" },
  { code: "SCR", label: "Seychelles — rupee" },
  { code: "SDG", label: "Sudan — pound" },
  { code: "SEK", label: "Sweden — krona" },
  { code: "SGD", label: "Singapore — dollar" },
  { code: "SHP", label: "Saint Helena — pound" },
  { code: "SLE", label: "Sierra Leone — leone" },
  { code: "SOS", label: "Somalia — shilling" },
  { code: "SRD", label: "Suriname — dollar" },
  { code: "SSP", label: "South Sudan — pound" },
  { code: "STN", label: "São Tomé and Príncipe — dobra" },
  { code: "SVC", label: "El Salvador — colón" },
  { code: "SYP", label: "Syria — pound" },
  { code: "SZL", label: "Eswatini — lilangeni" },
  { code: "THB", label: "Thailand — baht" },
  { code: "TJS", label: "Tajikistan — somoni" },
  { code: "TMT", label: "Turkmenistan — manat" },
  { code: "TND", label: "Tunisia — dinar" },
  { code: "TOP", label: "Tonga — paʻanga" },
  { code: "TRY", label: "Türkiye — lira" },
  { code: "TTD", label: "Trinidad and Tobago — dollar" },
  { code: "TWD", label: "Taiwan — dollar" },
  { code: "TZS", label: "Tanzania — shilling" },
  { code: "UAH", label: "Ukraine — hryvnia" },
  { code: "UGX", label: "Uganda — shilling" },
  { code: "USD", label: "United States — dollar" },
  { code: "UYU", label: "Uruguay — peso" },
  { code: "UZS", label: "Uzbekistan — som" },
  { code: "VES", label: "Venezuela — bolívar" },
  { code: "VND", label: "Vietnam — đồng" },
  { code: "VUV", label: "Vanuatu — vatu" },
  { code: "WST", label: "Samoa — tala" },
  { code: "XAF", label: "Central Africa — CFA franc" },
  { code: "XCD", label: "East Caribbean — dollar" },
  { code: "XOF", label: "West Africa — CFA franc" },
  { code: "XPF", label: "French Pacific — franc" },
  { code: "YER", label: "Yemen — rial" },
  { code: "ZAR", label: "South Africa — rand" },
  { code: "ZMW", label: "Zambia — kwacha" },
  { code: "ZWL", label: "Zimbabwe — dollar" },
];

export const CURRENCY_OPTIONS: readonly CurrencyOption[] = [...RAW].sort((a, b) =>
  a.code.localeCompare(b.code),
);

const CURRENCY_CODE_SET = new Set(CURRENCY_OPTIONS.map((c) => c.code));

export function isValidCurrencyCode(code: string): boolean {
  return CURRENCY_CODE_SET.has(code.trim().toUpperCase());
}

export function currencyLabel(code: string): string {
  const c = code.trim().toUpperCase();
  const hit = CURRENCY_OPTIONS.find((x) => x.code === c);
  return hit ? `${hit.code} — ${hit.label}` : c;
}

/** Amount only (no currency code), for form fields. Matches {@link formatUnsignedMoneyInputDisplay} (plain ASCII + grouping, no bidi marks). */
export function minorToAmountString(amountMinor: number, currency: string): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const wholeStr = addThousandsSeparators(String(whole));
  const plain =
    exp === 0
      ? wholeStr
      : `${wholeStr}.${frac.toString().padStart(exp, "0")}`;
  return plain === "" ? "" : withLtrMoneyDisplay(plain);
}

/**
 * Amount-only string for editable fields: no forced fractional digits (whole dollars
 * stay `12`, not `12.00`; `12.50` can show as `12.5`).
 */
export function minorToAmountInputString(amountMinor: number, currency: string): string {
  const plain = minorToAmountString(amountMinor, currency);
  const exp = currencyMinorExponent(currency);
  if (exp === 0) return plain;
  const dot = plain.lastIndexOf(".");
  if (dot === -1) return plain;
  const whole = plain.slice(0, dot);
  let frac = plain.slice(dot + 1);
  frac = frac.replace(/0+$/, "");
  return frac.length ? `${whole}.${frac}` : whole;
}

export function formatMinor(amountMinor: number, currency: string): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const code = currency.trim().toUpperCase();
  const wholeStr = addThousandsSeparators(String(whole));
  if (exp === 0) return `${sign}${code} ${wholeStr}`;
  if (frac === 0) return `${sign}${code} ${wholeStr}`;
  const fracStr = frac.toString().padStart(exp, "0");
  return `${sign}${code} ${wholeStr}.${fracStr}`;
}

/** Convert a major-unit float (e.g. dollars) to minor units; supports negative amounts (e.g. discounts). */
export function majorFloatToMinor(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) return 0;
  const exp = currencyMinorExponent(currency);
  return Math.round(amount * 10 ** exp);
}

export function parseMoneyToMinor(raw: string, currency: string): number | null {
  const t = normalizeAsciiDigits(stripMoneyFieldDecorators(raw.trim())).replace(
    /[,،٬､]/g,
    "",
  );
  if (!t) return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n) || n < 0) return null;
  const exp = currencyMinorExponent(currency);
  return Math.round(n * 10 ** exp);
}

/** Signed amount in minor units; empty string → 0. */
export function parseSignedMoneyToMinor(
  raw: string,
  currency: string,
): number | null {
  const t0 = normalizeAsciiDigits(stripMoneyFieldDecorators(raw.trim())).replace(
    /[,،٬､]/g,
    "",
  );
  if (!t0) return 0;
  const neg = t0.startsWith("-");
  const body = stripMoneyFieldDecorators(
    neg ? normalizeAsciiDigits(t0.slice(1)).trim() : t0,
  );
  if (!body) return null;
  const n = Number.parseFloat(body);
  if (!Number.isFinite(n) || n < 0) return null;
  const exp = currencyMinorExponent(currency);
  const minor = Math.round(n * 10 ** exp);
  return neg ? -minor : minor;
}

/** Normalized money field text for formatting (ASCII digits, one `.`, no grouping). */
export function normalizeMoneyInputRaw(raw: string): string {
  return normalizeAsciiDigits(
    stripMoneyFieldDecorators(raw).replace(/[,،٬､]/g, ""),
  ).trim();
}

/**
 * Numpad “.” on a money field: empty fractional currency → visible `0.`; otherwise append `.`.
 * Do not use for raw `onChangeText` — lone `.` is formatted as "" there so focus glitches
 * do not show `0.`.
 */
export function applyDecimalSeparatorToAmountInput(
  prev: string,
  currency: string,
): string {
  const p = prev.trim();
  if (!p) {
    return currencyMinorExponent(currency) > 0 ? "0." : "";
  }
  return formatUnsignedMoneyInputDisplay(`${p}.`, currency);
}

/**
 * Some mobile IMEs emit a single `onChangeText` that jumps from empty to `0.` when a decimal
 * field gains focus (e.g. “Next” from another field). That cannot come from normal typing
 * (`""` → `"0"` → `"0."` is separate events) or from the accessory “.” key (that uses
 * {@link applyDecimalSeparatorToAmountInput} and does not go through raw `onChangeText`).
 *
 * The same IME pattern has been observed appending a trailing `.` to existing integer
 * text on focus (e.g. `"10"` → `"10."`). We only strip that case inside the caller-supplied
 * `justFocused` window; after the window a trailing `.` is normal user typing.
 */
export function stripImeSpuriousZeroDotAfterFocus(
  prevDisplay: string,
  nextDisplay: string,
  justFocused = false,
): string {
  if (prevDisplay === "" && nextDisplay === "0.") return "";
  if (
    justFocused &&
    prevDisplay.length > 0 &&
    !prevDisplay.includes(".") &&
    nextDisplay === `${prevDisplay}.`
  ) {
    return prevDisplay;
  }
  return nextDisplay;
}

/**
 * Live formatting for positive money fields: thousands separators, respects
 * minor exponent (integer-only vs decimal).
 */
export function formatUnsignedMoneyInputDisplay(
  raw: string,
  currency: string,
): string {
  const exp = currencyMinorExponent(currency);
  const t = normalizeMoneyInputRaw(raw);
  if (!t) return "";

  if (exp === 0) {
    const digits = t.replace(/\D/g, "");
    return digits ? withLtrMoneyDisplay(addThousandsSeparators(digits)) : "";
  }

  const dot = t.indexOf(".");
  const intRaw = dot === -1 ? t : t.slice(0, dot);
  const fracRaw = dot === -1 ? undefined : t.slice(dot + 1).replace(/\./g, "");

  const intDigits = intRaw.replace(/\D/g, "");
  const intGrouped = intDigits === "" ? "" : addThousandsSeparators(intDigits);

  if (dot === -1) return intGrouped ? withLtrMoneyDisplay(intGrouped) : "";

  const fracDigits = (fracRaw ?? "").replace(/\D/g, "").slice(0, exp);
  if (t.endsWith(".") && fracDigits.length === 0) {
    // Lone `.` from the IME (e.g. on focus) must not become `0.`; use
    // {@link applyDecimalSeparatorToAmountInput} for the numpad `.` key instead.
    if (intDigits === "" && dot === 0) {
      return "";
    }
    const leading = intGrouped || "0";
    return withLtrMoneyDisplay(`${leading}.`);
  }

  const whole =
    intDigits === "" && dot === 0 ? "0" : intGrouped || "0";
  // Keep a trailing `.` while fractional digits are still incomplete (e.g. `162.5.` → `162.50`).
  if (t.endsWith(".") && fracDigits.length > 0 && fracDigits.length < exp) {
    return withLtrMoneyDisplay(`${whole}.${fracDigits}.`);
  }
  return withLtrMoneyDisplay(`${whole}.${fracDigits}`);
}

/** Like {@link formatUnsignedMoneyInputDisplay} but allows a leading minus (adjustments). */
export function formatSignedMoneyInputDisplay(
  raw: string,
  currency: string,
): string {
  const t0 = normalizeAsciiDigits(
    stripMoneyFieldDecorators(raw).replace(/[,،٬､]/g, ""),
  ).trim();
  const neg = t0.startsWith("-");
  const inner = neg ? t0.slice(1).trim() : t0;
  const u = formatUnsignedMoneyInputDisplay(inner, currency);
  if (!neg) return u;
  if (u === "" && t0 === "-") return "-";
  if (u === "") return "-";
  const core = stripMoneyFieldDecorators(u);
  return withLtrMoneyDisplay(`-${core}`);
}
