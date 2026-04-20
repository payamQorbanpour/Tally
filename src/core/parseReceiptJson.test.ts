import { describe, expect, it } from "vitest";
import { parseReceiptJsonContent } from "./parseReceiptImage";

describe("parseReceiptJsonContent", () => {
  it("parses a minimal valid payload", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: "Cafe",
        currency: "USD",
        lines: [{ label: "Latte", amount: 4.5 }],
        subtotal: 4.5,
        tax: 0.36,
        serviceCharge: null,
        discount: null,
        total: 4.86,
        confidence: "high",
      }),
    );
    expect(out.merchant).toBe("Cafe");
    expect(out.currency).toBe("USD");
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]?.label).toBe("Latte");
    expect(out.lines[0]?.amount).toBe(4.5);
    expect(out.tax).toBe(0.36);
    expect(out.confidence).toBe("high");
  });

  it("strips markdown fences if present", () => {
    const out = parseReceiptJsonContent(
      '```json\n{"lines":[{"label":"X","amount":1}],"merchant":null,"currency":null,"subtotal":null,"tax":null,"serviceCharge":null,"discount":null,"total":1}\n```',
    );
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]?.amount).toBe(1);
  });

  it("rejects invalid currency codes", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null,
        currency: "ZZZ",
        lines: [],
        subtotal: null,
        tax: null,
        serviceCharge: null,
        discount: null,
        total: null,
      }),
    );
    expect(out.currency).toBeNull();
  });
});
