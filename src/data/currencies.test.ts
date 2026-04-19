import { describe, expect, it } from "vitest";
import {
  applyDecimalSeparatorToAmountInput,
  stripImeSpuriousZeroDotAfterFocus,
  currencyMinorExponent,
  formatMinor,
  formatUnsignedMoneyInputDisplay,
  minorToAmountInputString,
  minorToAmountString,
  parseMoneyToMinor,
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
