import { describe, expect, it } from "vitest";
import {
  applyDecimalSeparatorToAmountInput,
  stripImeSpuriousZeroDotAfterFocus,
  convertRialTomanMinor,
  currencyMinorExponent,
  currencySymbol,
  IRR_PER_IRT,
  formatMinor,
  formatMinorWithSymbol,
  formatSignedMoneyInputDisplay,
  formatUnsignedMoneyInputDisplay,
  localizeDigits,
  minorToAmountInputString,
  minorToAmountString,
  parseCountInput,
  parseMoneyToMinor,
  withSignedLtr,
} from "./currencies";

describe("currencyMinorExponent", () => {
  it("uses two decimals for IRR and IRT (same as USD)", () => {
    expect(currencyMinorExponent("IRR")).toBe(2);
    expect(currencyMinorExponent("IRT")).toBe(2);
    expect(currencyMinorExponent("jpy")).toBe(0);
  });

  it("uses three decimals for KWD", () => {
    expect(currencyMinorExponent("KWD")).toBe(3);
  });

  it("defaults to two decimals for typical currencies", () => {
    expect(currencyMinorExponent("USD")).toBe(2);
    expect(currencyMinorExponent("EUR")).toBe(2);
  });
});

describe("minorToAmountString", () => {
  it("formats zero with two decimals for IRR and IRT", () => {
    expect(minorToAmountString(0, "IRR")).toBe("0.00");
    expect(minorToAmountString(0, "IRT")).toBe("0.00");
  });

  it("formats zero with minor units for typical currencies", () => {
    expect(minorToAmountString(0, "USD")).toBe("0.00");
    expect(minorToAmountString(0, "KWD")).toBe("0.000");
  });

  it("formats editable amounts without unnecessary fractional zeros", () => {
    expect(minorToAmountInputString(0, "USD")).toBe("0");
    expect(minorToAmountInputString(200, "USD")).toBe("2");
    expect(minorToAmountInputString(250, "USD")).toBe("2.5");
    expect(minorToAmountInputString(255, "USD")).toBe("2.55");
    expect(minorToAmountInputString(123456, "USD")).toBe("1,234.56");
  });

  it("groups thousands in the whole part", () => {
    expect(minorToAmountString(100_000_000, "IRT")).toBe("1,000,000.00");
    expect(minorToAmountString(1234_56, "USD")).toBe("1,234.56");
  });
});

describe("formatUnsignedMoneyInputDisplay", () => {
  it("groups every three digits for IRT/IRR whole-number input", () => {
    expect(formatUnsignedMoneyInputDisplay("1500000", "IRT")).toBe(
      "1,500,000",
    );
    expect(formatUnsignedMoneyInputDisplay("1,500,000", "IRR")).toBe(
      "1,500,000",
    );
  });

  it("groups USD whole part and preserves decimals", () => {
    expect(formatUnsignedMoneyInputDisplay("1234.5", "USD")).toBe("1,234.5");
  });

  it("keeps a trailing `.` after a partial fraction while the user still types decimals", () => {
    expect(formatUnsignedMoneyInputDisplay("162.5.", "USD")).toBe("162.5.");
  });

  it("stripImeSpuriousZeroDotAfterFocus drops bogus empty → `0.` from IME focus", () => {
    expect(stripImeSpuriousZeroDotAfterFocus("", "0.")).toBe("");
    expect(stripImeSpuriousZeroDotAfterFocus("0", "0.")).toBe("0.");
    expect(stripImeSpuriousZeroDotAfterFocus("1", "1.5")).toBe("1.5");
  });

  it("formats a lone `.` as empty onChange (focus glitches); numpad `.` uses applyDecimalSeparatorToAmountInput", () => {
    expect(formatUnsignedMoneyInputDisplay(".", "USD")).toBe("");
    expect(formatUnsignedMoneyInputDisplay(".5", "USD")).toBe("0.5");
    expect(formatUnsignedMoneyInputDisplay("2", "USD")).toBe("2");
    expect(applyDecimalSeparatorToAmountInput("", "USD")).toBe("0.");
    expect(applyDecimalSeparatorToAmountInput("12", "USD")).toBe("12.");
  });

  it("normalizes Arabic decimal separator to `.` for fractional input", () => {
    expect(formatUnsignedMoneyInputDisplay("162\u066b5", "USD")).toBe("162.5");
  });
});

describe("formatMinor / parseMoneyToMinor", () => {
  it("round-trips IRR with two decimal places in storage", () => {
    const m = parseMoneyToMinor("150000", "IRR");
    expect(m).toBe(15_000_000);
    expect(formatMinor(m!, "IRR")).toBe("IRR 150,000");
  });

  it("round-trips IRT with two decimal places in storage", () => {
    const m = parseMoneyToMinor("15000", "IRT");
    expect(m).toBe(1_500_000);
    expect(formatMinor(m!, "IRT")).toBe("IRT 15,000");
  });

  it("accepts comma-separated input", () => {
    expect(parseMoneyToMinor("1,500,000", "IRT")).toBe(150_000_000);
    expect(parseMoneyToMinor("12,345.67", "USD")).toBe(1234567);
  });

  it("round-trips USD with cents", () => {
    const m = parseMoneyToMinor("12.50", "USD");
    expect(m).toBe(1250);
    expect(formatMinor(m!, "USD")).toBe("USD 12.50");
  });

  it("parses amounts with invisible chars between digits and decimal (RTL / IME)", () => {
    expect(parseMoneyToMinor("162\u200b.5", "USD")).toBe(16250);
    expect(parseMoneyToMinor("162.\u200b5", "USD")).toBe(16250);
    expect(parseMoneyToMinor("162\u00ad.5", "USD")).toBe(16250);
  });

  it("parses zero for exact split lines (expense total still requires > 0 at save)", () => {
    expect(parseMoneyToMinor("0", "USD")).toBe(0);
    expect(parseMoneyToMinor("0.00", "USD")).toBe(0);
  });

  it("formats three-decimal currencies", () => {
    const m = parseMoneyToMinor("1.234", "KWD");
    expect(m).toBe(1234);
    expect(formatMinor(m!, "KWD")).toBe("KWD 1.234");
  });

  it("groups thousands in formatMinor for large whole parts", () => {
    expect(formatMinor(1_000_000_00, "USD")).toBe("USD 1,000,000");
  });

  it("omits fractional part when it is zero", () => {
    expect(formatMinor(1400_00, "USD")).toBe("USD 1,400");
    expect(formatMinor(0, "USD")).toBe("USD 0");
  });
});

describe('Farsi currency labels (locale: "fa")', () => {
  it("puts the Farsi word for IRT/IRR after the amount in formatMinor (natural Farsi order)", () => {
    expect(formatMinor(1_500_000, "IRT", "fa")).toBe("‏۱۵,۰۰۰ تومان");
    expect(formatMinor(15_000_000, "IRR", "fa")).toBe("‏۱۵۰,۰۰۰ ریال");
  });

  it("puts the Farsi word for IRT/IRR after the amount in currencySymbol and formatMinorWithSymbol", () => {
    expect(currencySymbol("IRT", "fa")).toBe("تومان");
    expect(currencySymbol("IRR", "fa")).toBe("ریال");
    expect(formatMinorWithSymbol(1_500_000, "IRT", "fa")).toBe("‏۱۵,۰۰۰ تومان");
    expect(formatMinorWithSymbol(15_000_000, "IRR", "fa")).toBe("‏۱۵۰,۰۰۰ ریال");
  });

  it("leads with an RTL mark so the currency word lays out on the LEFT of the digits (paragraphs are LTR-based: no forceRTL)", () => {
    // U+200F opens a right-to-left run, so the logical "۱۵,۰۰۰ تومان" renders
    // as "تومان ۱۵,۰۰۰". Without it the digits win the first visual slot under
    // an LTR base and the word is stranded to their right.
    expect(formatMinorWithSymbol(1_500_000, "IRT", "fa").startsWith("‏")).toBe(true);
    expect(formatMinor(1_500_000, "IRT", "fa").startsWith("‏")).toBe(true);
    // Non-Farsi output stays free of the mark.
    expect(formatMinorWithSymbol(1250, "USD", "fa")).not.toContain("‏");
  });

  it("isolates sign + digits so a signed Farsi amount keeps the sign left of the number, word further left still", () => {
    // U+2066 … U+2069 — an LTR isolate nested inside the RTL run.
    expect(formatMinorWithSymbol(-1_500_000, "IRT", "fa")).toBe(
      "‏⁦−۱۵,۰۰۰⁩ تومان",
    );
    expect(
      formatMinorWithSymbol(1_500_000, "IRT", "fa", { explicitPlus: true }),
    ).toBe("‏⁦+۱۵,۰۰۰⁩ تومان");
  });

  it("emits an explicit + only when asked, and never on zero or negatives", () => {
    expect(
      formatMinorWithSymbol(1250, "USD", undefined, { explicitPlus: true }),
    ).toBe("‎+$12.50");
    expect(
      formatMinorWithSymbol(0, "USD", undefined, { explicitPlus: true }),
    ).toBe("$0");
    expect(
      formatMinorWithSymbol(-1250, "USD", undefined, { explicitPlus: true }),
    ).toBe("‎−$12.50");
    expect(formatMinorWithSymbol(1250, "USD")).toBe("$12.50");
  });

  it('renders Persian digits for an unrelated currency code under locale: "fa" (label stays the ISO code/symbol)', () => {
    expect(formatMinor(1250, "USD", "fa")).toBe("USD ۱۲.۵۰");
    expect(currencySymbol("USD", "fa")).toBe("$");
    expect(formatMinorWithSymbol(1250, "USD", "fa")).toBe("$۱۲.۵۰");
  });

  it("glues the minus sign to the left of the digits with an LTR isolate (bidi would flip a bare sign to the right of the number)", () => {
    expect(formatMinorWithSymbol(-1_042_200_00, "IRT", "fa")).toBe(
      "‏⁦−۱,۰۴۲,۲۰۰⁩ تومان",
    );
    expect(formatMinor(-1_500_000, "IRT", "fa")).toBe("‏⁦−۱۵,۰۰۰⁩ تومان");
  });

  it("leaves positive amounts free of the sign isolate", () => {
    expect(formatMinorWithSymbol(1_500_000, "IRT", "fa")).not.toContain("⁦");
    expect(formatMinor(0, "IRT", "fa")).not.toContain("⁦");
  });

  it("reproduces today's exact output when locale is omitted (backward-compatibility guard)", () => {
    expect(formatMinor(1_500_000, "IRT")).toBe("IRT 15,000");
    expect(formatMinor(15_000_000, "IRR")).toBe("IRR 150,000");
    expect(currencySymbol("IRR")).toBe("﷼");
    expect(formatMinorWithSymbol(15_000_000, "IRR")).toBe("﷼150,000");
  });
});

describe("withSignedLtr", () => {
  it("prefixes an LTR mark so the sign stays left of the number", () => {
    expect(withSignedLtr("−", "۱۲۳ تومان")).toBe("‎−۱۲۳ تومان");
    expect(withSignedLtr("+", "۱۲۳ تومان")).toBe("‎+۱۲۳ تومان");
  });

  it("returns the amount untouched when there is no sign", () => {
    expect(withSignedLtr("", "۱۲۳ تومان")).toBe("۱۲۳ تومان");
  });
});

describe("convertRialTomanMinor", () => {
  // IRR and IRT share minor exponent 2, so a minor-unit amount converts by
  // the plain factor of 10 with no exponent bookkeeping. In the user's own
  // terms: 10,000 IRR is 1,000 IRT — as minor units (x100), 1,000,000 →
  // 100,000.
  it("drops a zero going from rials to tomans", () => {
    expect(convertRialTomanMinor(1_000_000, "IRR", "IRT")).toBe(100_000);
  });

  it("adds a zero going from tomans to rials", () => {
    expect(convertRialTomanMinor(100_000, "IRT", "IRR")).toBe(1_000_000);
  });

  it("round-trips a toman amount exactly", () => {
    const toman = 123_456;
    const rial = convertRialTomanMinor(toman, "IRT", "IRR")!;
    expect(convertRialTomanMinor(rial, "IRR", "IRT")).toBe(toman);
  });

  it("rounds a rial amount that has no exact toman representation", () => {
    // 1,234,565 / 10 lands on .5 — rounded, not truncated, so a converted
    // receipt isn't biased downward line by line.
    expect(convertRialTomanMinor(1_234_565, "IRR", "IRT")).toBe(123_457);
    expect(convertRialTomanMinor(1_234_564, "IRR", "IRT")).toBe(123_456);
  });

  it("preserves sign for a negative amount (a discount line)", () => {
    expect(convertRialTomanMinor(-1_000_000, "IRR", "IRT")).toBe(-100_000);
  });

  it("accepts lowercase and padded codes", () => {
    expect(convertRialTomanMinor(1_000_000, " irr ", "irt")).toBe(100_000);
  });

  it("returns null for a same-currency or unrelated pair", () => {
    // null rather than the input unchanged, so a caller can never mistake
    // "nothing to convert" for "converted".
    expect(convertRialTomanMinor(1_000_000, "IRR", "IRR")).toBeNull();
    expect(convertRialTomanMinor(1_000_000, "IRT", "IRT")).toBeNull();
    expect(convertRialTomanMinor(1_000_000, "USD", "IRT")).toBeNull();
    expect(convertRialTomanMinor(1_000_000, "IRR", "USD")).toBeNull();
    expect(convertRialTomanMinor(1_000_000, "", "")).toBeNull();
  });

  it("returns null for a non-finite amount", () => {
    expect(convertRialTomanMinor(Number.NaN, "IRR", "IRT")).toBeNull();
    expect(convertRialTomanMinor(Number.POSITIVE_INFINITY, "IRR", "IRT")).toBeNull();
  });

  it("keeps IRR_PER_IRT as the single source of the factor", () => {
    expect(convertRialTomanMinor(IRR_PER_IRT * 100, "IRR", "IRT")).toBe(100);
  });
});

describe("localizeDigits", () => {
  it("converts ASCII 0-9 to Persian digits for locale fa", () => {
    expect(localizeDigits("1,234.50", "fa")).toBe("۱,۲۳۴.۵۰");
  });

  it("leaves non-fa locales (and omitted locale) unchanged", () => {
    expect(localizeDigits("1,234.50", "en")).toBe("1,234.50");
    expect(localizeDigits("1,234.50")).toBe("1,234.50");
  });
});

describe("Farsi digits in editable money fields", () => {
  it("groups and shapes a toman amount as the user types", () => {
    expect(formatUnsignedMoneyInputDisplay("1500000", "IRT", "fa")).toBe(
      "۱,۵۰۰,۰۰۰",
    );
  });

  it("accepts Persian digits back as input, so the field round-trips", () => {
    const shaped = formatUnsignedMoneyInputDisplay("1234.5", "USD", "fa");
    expect(shaped).toBe("۱,۲۳۴.۵");
    // Re-feeding the shaped value (what `onChangeText` sees after a re-render)
    // must be a fixed point, else digits would churn on every keystroke.
    expect(formatUnsignedMoneyInputDisplay(shaped, "USD", "fa")).toBe(shaped);
    expect(parseMoneyToMinor(shaped, "USD")).toBe(123450);
  });

  it("trims trailing zeros before shaping, not after", () => {
    // `/0+$/` cannot match `۰`, so a naive shape-then-trim would leave `۲.۵۰`.
    expect(minorToAmountInputString(250, "USD", "fa")).toBe("۲.۵");
    expect(minorToAmountInputString(123456, "USD", "fa")).toBe("۱,۲۳۴.۵۶");
    expect(minorToAmountInputString(0, "USD", "fa")).toBe("۰");
  });

  it("shapes the numpad decimal key's `0.` seed", () => {
    expect(applyDecimalSeparatorToAmountInput("", "USD", "fa")).toBe("۰.");
    expect(applyDecimalSeparatorToAmountInput("۱۲", "USD", "fa")).toBe("۱۲.");
  });

  it("still strips the IME's spurious `0.` when the field holds Persian digits", () => {
    expect(stripImeSpuriousZeroDotAfterFocus("", "۰.")).toBe("");
    expect(stripImeSpuriousZeroDotAfterFocus("", "0.")).toBe("");
    expect(stripImeSpuriousZeroDotAfterFocus("۱۰", "۱۰.", true)).toBe("۱۰");
    // Outside the focus window a trailing `.` is real typing.
    expect(stripImeSpuriousZeroDotAfterFocus("۱۰", "۱۰.", false)).toBe("۱۰.");
  });

  it("keeps the minus sign ASCII on a shaped adjustment", () => {
    expect(formatSignedMoneyInputDisplay("-12.5", "USD", "fa")).toBe("-۱۲.۵");
  });

  it("leaves every formatter byte-identical when no locale is passed", () => {
    expect(formatUnsignedMoneyInputDisplay("1234.5", "USD")).toBe("1,234.5");
    expect(formatSignedMoneyInputDisplay("-12.5", "USD")).toBe("-12.5");
    expect(minorToAmountInputString(250, "USD")).toBe("2.5");
    expect(applyDecimalSeparatorToAmountInput("", "USD")).toBe("0.");
  });
});

describe("parseCountInput", () => {
  it("reads Persian digits that `Number.parseInt` cannot", () => {
    expect(Number.parseInt("۵۰", 10)).toBeNaN(); // the bug this exists to avoid
    expect(parseCountInput("۵۰")).toBe(50);
    expect(parseCountInput("۱۰۰")).toBe(100);
  });

  it("reads ASCII and Arabic-Indic digits too", () => {
    expect(parseCountInput("50")).toBe(50);
    expect(parseCountInput("٥٠")).toBe(50);
  });

  it("distinguishes blank from zero so callers can skip empty slots", () => {
    expect(parseCountInput("")).toBeNull();
    expect(parseCountInput("   ")).toBeNull();
    expect(parseCountInput("abc")).toBeNull();
    expect(parseCountInput("۰")).toBe(0);
  });
});
