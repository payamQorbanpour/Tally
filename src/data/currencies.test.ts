import { describe, expect, it } from "vitest";
import {
  currencyMinorExponent,
  formatMinor,
  formatUnsignedMoneyInputDisplay,
  minorToAmountString,
  parseMoneyToMinor,
} from "./currencies";

const LTR = "\u200e";

describe("currencyMinorExponent", () => {
  it("uses zero decimals for IRR, IRT, and JPY", () => {
    expect(currencyMinorExponent("IRR")).toBe(0);
    expect(currencyMinorExponent("IRT")).toBe(0);
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
  it("formats zero without decimals for IRR and IRT", () => {
    expect(minorToAmountString(0, "IRR")).toBe(`${LTR}0`);
    expect(minorToAmountString(0, "IRT")).toBe(`${LTR}0`);
  });

  it("formats zero with minor units for typical currencies", () => {
    expect(minorToAmountString(0, "USD")).toBe(`${LTR}0.00`);
    expect(minorToAmountString(0, "KWD")).toBe(`${LTR}0.000`);
  });

  it("groups thousands in the whole part", () => {
    expect(minorToAmountString(1_000_000, "IRT")).toBe(`${LTR}1,000,000`);
    expect(minorToAmountString(1234_56, "USD")).toBe(`${LTR}1,234.56`);
  });
});

describe("formatUnsignedMoneyInputDisplay", () => {
  it("groups every three digits for zero-decimal currencies (RTL-safe LTR embed)", () => {
    expect(formatUnsignedMoneyInputDisplay("1500000", "IRT")).toBe(
      `${LTR}1,500,000`,
    );
    expect(formatUnsignedMoneyInputDisplay("1,500,000", "IRR")).toBe(
      `${LTR}1,500,000`,
    );
  });

  it("groups USD whole part and preserves decimals", () => {
    expect(formatUnsignedMoneyInputDisplay("1234.5", "USD")).toBe(
      `${LTR}1,234.5`,
    );
  });
});

describe("formatMinor / parseMoneyToMinor", () => {
  it("round-trips IRR as whole units", () => {
    const m = parseMoneyToMinor("150000", "IRR");
    expect(m).toBe(150000);
    expect(formatMinor(m!, "IRR")).toBe("IRR 150,000");
  });

  it("round-trips IRT as whole tomans (same economic scale as IRR/10)", () => {
    const m = parseMoneyToMinor("15000", "IRT");
    expect(m).toBe(15000);
    expect(formatMinor(m!, "IRT")).toBe("IRT 15,000");
  });

  it("accepts comma-separated input", () => {
    expect(parseMoneyToMinor("1,500,000", "IRT")).toBe(1_500_000);
    expect(parseMoneyToMinor("12,345.67", "USD")).toBe(1234567);
  });

  it("round-trips USD with cents", () => {
    const m = parseMoneyToMinor("12.50", "USD");
    expect(m).toBe(1250);
    expect(formatMinor(m!, "USD")).toBe("USD 12.50");
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
    expect(formatMinor(1_000_000_00, "USD")).toBe("USD 1,000,000.00");
  });
});
