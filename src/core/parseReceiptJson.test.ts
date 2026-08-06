import { describe, expect, it, vi } from "vitest";

// Mock react-native to allow parseReceiptImage to import supabaseClient in Node environment.
// parseReceiptJsonContent doesn't use react-native features, so a minimal mock suffices.
vi.mock("react-native", () => ({
  Platform: {
    OS: "web",
    select: (obj: Record<string, unknown>) => obj.web,
  },
}));

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

  it("carries a surcharge kind through", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [
          { label: "جوجه کبک", amount: 26000000, kind: "item" },
          { label: "مالیات بر ارزش افزوده", amount: 9244560, kind: "surcharge" },
        ],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.kind).toBe("item");
    expect(out.lines[1]?.kind).toBe("surcharge");
  });

  it("leaves kind undefined when absent or unrecognized", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [
          { label: "Latte", amount: 4.5 },
          { label: "Mystery", amount: 1, kind: "gratuity" },
        ],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.kind).toBeUndefined();
    expect(out.lines[1]?.kind).toBeUndefined();
  });
});
