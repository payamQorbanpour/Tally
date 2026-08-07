/**
 * ISO 4217 codes with human-readable labels. Minor-unit exponents follow ISO.
 *
 * IRR / IRT use two decimal places in the UI (like USD): amounts are stored in
 * 1/100 of a unit (see one-time SQLite migration `irt_irr_minor_x100_v1`).
 * 10 rials = 1 toman (e.g. 1000 IRR and 100 IRT represent the same value).
 */
import type { AppLocale } from "../i18n/translations";

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

/** Rials in one toman — the "drop a zero" everyone in Iran does in their
 *  head: 10,000 IRR is 1,000 IRT. */
export const IRR_PER_IRT = 10;

/**
 * Convert an integer minor-unit amount between the rial and the toman, or
 * return `null` when the pair isn't that pair.
 *
 * Iranian receipts are almost always printed in rials while people speak,
 * think, and keep their group's books in tomans, so a scan comes back an
 * order of magnitude away from what the group expects. This is the one
 * conversion in the app that is a fixed definition rather than an exchange
 * rate: the toman is not a currency floating against the rial, it *is* ten
 * rials — so this needs no rate source and can never go stale.
 *
 * Operating directly on minor units is safe precisely because IRR and IRT
 * share minor exponent 2 (see this module's header and the SQLite migration
 * `irt_irr_minor_x100_v1`): the exponents cancel, leaving a plain factor of
 * {@link IRR_PER_IRT}. If that ever stopped being true this would have to
 * route through major units instead.
 *
 * Rial → toman divides and therefore rounds — a lone rial has no exact
 * representation in tomans. `Math.round` rather than truncation keeps the
 * error centred instead of biasing every converted receipt downward.
 * Toman → rial multiplies and is exact.
 *
 * Returns `null` — rather than the input unchanged — for every other pair,
 * so a caller can never mistake "nothing to convert" for "converted".
 */
export function convertRialTomanMinor(
  amountMinor: number,
  from: string,
  to: string,
): number | null {
  if (!Number.isFinite(amountMinor)) return null;
  const f = from.trim().toUpperCase();
  const t = to.trim().toUpperCase();
  if (f === "IRR" && t === "IRT") return Math.round(amountMinor / IRR_PER_IRT);
  if (f === "IRT" && t === "IRR") return Math.round(amountMinor * IRR_PER_IRT);
  return null;
}

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/**
 * ASCII 0–9 → Persian digits.
 *
 * Safe for editable TextInput values as well as read-only text: every parser
 * and formatter here funnels its input through {@link normalizeAsciiDigits}
 * first, so a field whose *display string* holds Persian digits round-trips
 * through `parseMoneyToMinor` / `formatUnsignedMoneyInputDisplay` unchanged.
 * Count-style fields (percent, shares) must use {@link parseCountInput} rather
 * than a bare `Number.parseInt`, which does not understand Persian digits.
 */
export function localizeDigits(s: string, locale?: AppLocale): string {
  if (locale !== "fa" || !s) return s;
  return s.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * Persian / Arabic-Indic digits → ASCII 0–9 for consistent grouping.
 *
 * Exported for count-style fields that shape their own text rather than going
 * through a money formatter (see the percent input in `AddExpenseScreen`):
 * normalize first so a field mixing IME-produced ASCII with already-shaped
 * Persian digits comes out in one consistent set.
 */
export function normalizeAsciiDigits(s: string): string {
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
  { code: "ARS", label: "Argentina — peso" },
  { code: "AUD", label: "Australia — dollar" },
  { code: "BRL", label: "Brazil — real" },
  { code: "CAD", label: "Canada — dollar" },
  { code: "CHF", label: "Switzerland — franc" },
  { code: "CNY", label: "China — yuan" },
  { code: "CZK", label: "Czech Republic — koruna" },
  { code: "DKK", label: "Denmark — krone" },
  { code: "EGP", label: "Egypt — pound" },
  { code: "EUR", label: "Eurozone — euro" },
  { code: "GBP", label: "United Kingdom — pound" },
  { code: "HKD", label: "Hong Kong — dollar" },
  { code: "HUF", label: "Hungary — forint" },
  { code: "IDR", label: "Indonesia — rupiah" },
  { code: "ILS", label: "Israel — shekel" },
  { code: "INR", label: "India — rupee" },
  { code: "IRR", label: "Iran — Iranian rial" },
  { code: "IRT", label: "Iran — Iranian toman" },
  { code: "JPY", label: "Japan — yen" },
  { code: "KRW", label: "South Korea — won" },
  { code: "MXN", label: "Mexico — peso" },
  { code: "MYR", label: "Malaysia — ringgit" },
  { code: "NOK", label: "Norway — krone" },
  { code: "NZD", label: "New Zealand — dollar" },
  { code: "PHP", label: "Philippines — peso" },
  { code: "PKR", label: "Pakistan — rupee" },
  { code: "PLN", label: "Poland — złoty" },
  { code: "QAR", label: "Qatar — riyal" },
  { code: "RON", label: "Romania — leu" },
  { code: "RUB", label: "Russia — ruble" },
  { code: "SAR", label: "Saudi Arabia — riyal" },
  { code: "SEK", label: "Sweden — krona" },
  { code: "SGD", label: "Singapore — dollar" },
  { code: "THB", label: "Thailand — baht" },
  { code: "TRY", label: "Türkiye — lira" },
  { code: "UAH", label: "Ukraine — hryvnia" },
  { code: "USD", label: "United States — dollar" },
  { code: "VND", label: "Vietnam — đồng" },
  { code: "ZAR", label: "South Africa — rand" },
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
 *
 * Trailing-zero trimming runs on the ASCII form — `/0+$/` would not match `۰` —
 * so `locale` is applied only once the string is final.
 */
export function minorToAmountInputString(
  amountMinor: number,
  currency: string,
  locale?: AppLocale,
): string {
  const plain = minorToAmountString(amountMinor, currency);
  const exp = currencyMinorExponent(currency);
  if (exp === 0) return localizeDigits(plain, locale);
  const dot = plain.lastIndexOf(".");
  if (dot === -1) return localizeDigits(plain, locale);
  const whole = plain.slice(0, dot);
  let frac = plain.slice(dot + 1);
  frac = frac.replace(/0+$/, "");
  return localizeDigits(frac.length ? `${whole}.${frac}` : whole, locale);
}

/**
 * Farsi-language overrides for the currency code/symbol slot. Scoped
 * narrowly to IRT/IRR per the Farsi/RTL Batch A design doc — not a general
 * ISO-currency-name-to-Farsi map.
 */
const FARSI_CURRENCY_LABELS: Readonly<Record<string, string>> = {
  IRT: "تومان",
  IRR: "ریال",
};

function farsiCurrencyLabel(code: string, locale?: AppLocale): string | undefined {
  return locale === "fa" ? FARSI_CURRENCY_LABELS[code] : undefined;
}

/** U+200E LEFT-TO-RIGHT MARK. */
const LTR_MARK = "‎";
/** U+200F RIGHT-TO-LEFT MARK. */
const RTL_MARK = "‏";
/** U+2066 LEFT-TO-RIGHT ISOLATE … U+2069 POP DIRECTIONAL ISOLATE. */
const LTR_ISOLATE = "⁦";
const POP_ISOLATE = "⁩";

/**
 * Lay out "<digits> <تومان>" so it *renders* with the currency word on the left
 * of the number, the way Farsi reads it.
 *
 * The app never calls `I18nManager.forceRTL`, so every paragraph is LTR-based
 * even in Farsi. Under an LTR base, bidi resolves the digits as the first visual
 * run and strands the word to their right. The leading RTL mark turns the whole
 * thing into one right-to-left run, so it lays out as "تومان ۱۵,۰۰۰" while the
 * logical order stays the one Farsi readers and screen readers expect. An
 * isolate around sign + digits keeps a "+"/"−" glued to the left of the number
 * instead of drifting past the word.
 */
function farsiMoneyRun(sign: string, amountStr: string, word: string): string {
  const digits = sign
    ? `${LTR_ISOLATE}${sign}${amountStr}${POP_ISOLATE}`
    : amountStr;
  return `${RTL_MARK}${digits} ${word}`;
}

/**
 * Glue a leading "+"/"−" to the left of the digits it belongs to.
 *
 * Bidi treats a lone sign before Persian digits as neutral and resolves it to the
 * surrounding direction, which can flip it to the far right of the run
 * ("۱٬۰۴۲٬۲۰۰−"). The LTR mark makes sign + digits a single left-to-right run.
 * Style-level `writingDirection: "ltr"` is not a substitute: RN Web ignores it on
 * mixed digit/letter runs.
 *
 * For amounts that carry a Farsi currency word use `farsiMoneyRun` instead — the
 * word needs an RTL run around it, which an LTR mark would cancel.
 */
export function withSignedLtr(sign: string, formatted: string): string {
  return sign ? `${LTR_MARK}${sign}${formatted}` : formatted;
}

export function formatMinor(amountMinor: number, currency: string, locale?: AppLocale): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign = amountMinor < 0 ? "−" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const code = currency.trim().toUpperCase();
  const farsiWord = farsiCurrencyLabel(code, locale);
  const label = farsiWord ?? code;
  const wholeStr = addThousandsSeparators(String(whole));
  const amountStr =
    frac === 0 ? wholeStr : `${wholeStr}.${frac.toString().padStart(exp, "0")}`;
  // Farsi currency words (تومان/ریال) read after the amount ("۶,۰۰۰ تومان") and
  // lay out to its left; ISO codes read before it ("USD 12.50").
  const body = farsiWord
    ? farsiMoneyRun(sign, amountStr, label)
    : withSignedLtr(sign, `${label} ${amountStr}`);
  return localizeDigits(body, locale);
}

/**
 * Glyph shown on group cards and the home summary instead of the 3-letter code.
 * Covers the common cases; falls back to the code for currencies without a
 * universally recognised symbol (`PLN`, `XOF`, etc.).
 */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$", CAD: "$", AUD: "$", NZD: "$", SGD: "$", HKD: "$", MXN: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥", CNY: "¥",
  KRW: "₩",
  INR: "₹",
  RUB: "₽",
  TRY: "₺",
  BRL: "R$",
  CHF: "CHF",
  ZAR: "R",
  THB: "฿",
  ILS: "₪",
  SEK: "kr", NOK: "kr", DKK: "kr",
  IRR: "﷼", AED: "د.إ", SAR: "﷼",
};

export function currencySymbol(currency: string, locale?: AppLocale): string {
  const code = currency.trim().toUpperCase();
  return farsiCurrencyLabel(code, locale) ?? CURRENCY_SYMBOLS[code] ?? code;
}

/**
 * Like `formatMinor` but uses the currency glyph (`$`, `€`, `¥`) instead of the
 * 3-letter ISO code. Use on dense surfaces (group rows, summary card) where the
 * code is too long; keep `formatMinor` where the explicit code is helpful
 * (modals listing per-currency totals, exports, etc).
 */
export function formatMinorWithSymbol(
  amountMinor: number,
  currency: string,
  locale?: AppLocale,
  opts?: { explicitPlus?: boolean },
): string {
  const exp = currencyMinorExponent(currency);
  const divisor = 10 ** exp;
  const sign =
    amountMinor < 0 ? "−" : amountMinor > 0 && opts?.explicitPlus ? "+" : "";
  const abs = Math.abs(amountMinor);
  const whole = Math.floor(abs / divisor);
  const frac = abs % divisor;
  const code = currency.trim().toUpperCase();
  const farsiWord = farsiCurrencyLabel(code, locale);
  const sym = farsiWord ?? CURRENCY_SYMBOLS[code] ?? code;
  const wholeStr = addThousandsSeparators(String(whole));
  const amountStr =
    frac === 0 ? wholeStr : `${wholeStr}.${frac.toString().padStart(exp, "0")}`;
  // Farsi currency words (تومان/ریال) read after the amount, with a space, and
  // lay out to its left; symbol glyphs ($/€/¥) stay glued before it, no space.
  const body = farsiWord
    ? farsiMoneyRun(sign, amountStr, sym)
    : withSignedLtr(sign, `${sym}${amountStr}`);
  return localizeDigits(body, locale);
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

/**
 * Whole-number parse for count-style fields (percent, shares) whose display
 * text may hold Persian digits. `Number.parseInt("۵۰", 10)` is `NaN`, so those
 * fields must not parse their own state directly.
 *
 * Returns `null` for blank or non-numeric text, letting callers distinguish
 * "nothing entered" from a real `0`.
 */
export function parseCountInput(raw: string): number | null {
  const t = normalizeAsciiDigits(stripMoneyFieldDecorators(raw))
    .replace(/[,،٬､]/g, "")
    .trim();
  if (!t) return null;
  const n = Number.parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
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
  locale?: AppLocale,
): string {
  const p = prev.trim();
  if (!p) {
    return currencyMinorExponent(currency) > 0 ? localizeDigits("0.", locale) : "";
  }
  return formatUnsignedMoneyInputDisplay(`${p}.`, currency, locale);
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
 *
 * Both display strings may carry Persian digits under a Farsi locale, so the
 * `0.` probe compares normalized text rather than the literal — but the return
 * value is always one of the arguments, unshaped.
 */
export function stripImeSpuriousZeroDotAfterFocus(
  prevDisplay: string,
  nextDisplay: string,
  justFocused = false,
): string {
  if (prevDisplay === "" && normalizeMoneyInputRaw(nextDisplay) === "0.") return "";
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
  locale?: AppLocale,
): string {
  return localizeDigits(formatUnsignedMoneyInputAscii(raw, currency), locale);
}

/** {@link formatUnsignedMoneyInputDisplay} before digit shaping. */
function formatUnsignedMoneyInputAscii(raw: string, currency: string): string {
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
  locale?: AppLocale,
): string {
  const t0 = normalizeAsciiDigits(
    stripMoneyFieldDecorators(raw).replace(/[,،٬､]/g, ""),
  ).trim();
  const neg = t0.startsWith("-");
  const inner = neg ? t0.slice(1).trim() : t0;
  const u = formatUnsignedMoneyInputAscii(inner, currency);
  if (!neg) return localizeDigits(u, locale);
  if (u === "" && t0 === "-") return "-";
  if (u === "") return "-";
  const core = stripMoneyFieldDecorators(u);
  return localizeDigits(withLtrMoneyDisplay(`-${core}`), locale);
}
