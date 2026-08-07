import { describe, expect, it, vi } from "vitest";
import { parseReceiptImageBase64, parseReceiptJsonContent } from "./parseReceiptImage";

// `parseReceiptImage.ts` imports `../core/aiProxy`, which imports
// `../auth/supabaseClient`, which imports React Native. Vitest runs in Node and
// can't parse the Flow-typed RN sources, so stub it out. Only the pure
// `parseReceiptJsonContent` helper is under test here; it never touches
// `react-native` at runtime. `vi.mock` calls are hoisted above imports by
// vitest's compiler, so this still takes effect in time.
vi.mock("react-native", () => ({
  Platform: {
    OS: "web",
    select: (obj: Record<string, unknown>) => obj.web,
  },
}));

const callAiProxyMock = vi.fn(
  async (_action: string, _payload: Record<string, unknown>) =>
    new Response(JSON.stringify({ lines: [] }), { status: 200 }),
);
vi.mock("./aiProxy", () => ({
  callAiProxy: (action: string, payload: Record<string, unknown>) =>
    callAiProxyMock(action, payload),
}));

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

  // `qty` is the receipt's printed quantity, shown as a "x2" badge beside
  // the amount. `amount` stays the row's LINE TOTAL for all of those units,
  // so nothing downstream multiplies by it — these cases pin the "only an
  // integer worth showing survives" rule the badge depends on.
  const lineWithQty = (qty: unknown) =>
    parseReceiptJsonContent(JSON.stringify({ lines: [{ label: "Kebab", amount: 120, qty }] }))
      .lines[0];

  it("keeps a printed quantity of 2 or more", () => {
    expect(lineWithQty(2)?.qty).toBe(2);
    expect(lineWithQty(4)?.qty).toBe(4);
    // The line total is never rescaled by the quantity.
    expect(lineWithQty(4)?.amount).toBe(120);
  });

  it("coerces a numeric-string quantity", () => {
    expect(lineWithQty("3")?.qty).toBe(3);
  });

  it("drops a quantity of one, so it renders no badge", () => {
    // "no quantity printed" and "exactly one" must be indistinguishable.
    expect(lineWithQty(1)?.qty).toBeUndefined();
    expect(lineWithQty(0)?.qty).toBeUndefined();
    expect(lineWithQty(undefined)?.qty).toBeUndefined();
  });

  it("drops a fractional quantity rather than rounding it", () => {
    // 1.5 on a receipt means a weight or a half portion; "x2" would be a
    // confident lie about something we can't render honestly.
    expect(lineWithQty(1.5)?.qty).toBeUndefined();
    expect(lineWithQty(2.5)?.qty).toBeUndefined();
  });

  it("drops a negative or unparseable quantity", () => {
    expect(lineWithQty(-2)?.qty).toBeUndefined();
    expect(lineWithQty("many")?.qty).toBeUndefined();
    expect(lineWithQty(null)?.qty).toBeUndefined();
    expect(lineWithQty({})?.qty).toBeUndefined();
  });

  it("keeps the line itself when only the quantity is junk", () => {
    // A bad badge must never cost the user the line's money.
    const line = lineWithQty("???");
    expect(line?.label).toBe("Kebab");
    expect(line?.amount).toBe(120);
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

  it("carries people attribution through for a line", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [
          { label: "جوجه جنگلی", amount: 100, people: ["Payam"] },
          { label: "جوجه کبک", amount: 200, people: ["Lyra", "Eliana"] },
        ],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.people).toEqual(["Payam"]);
    expect(out.lines[1]?.people).toEqual(["Lyra", "Eliana"]);
  });

  it("leaves people undefined when absent (old cached responses)", () => {
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
    expect(out.lines[0]?.people).toBeUndefined();
  });

  it("degrades a non-array people field to undefined", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [{ label: "Latte", amount: 4.5, people: "Payam" }],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.people).toBeUndefined();
  });

  it("drops non-string and empty-string entries from people, keeping the rest", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [{ label: "Latte", amount: 4.5, people: ["Payam", "", 42, null, "  ", "Lyra"] }],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.people).toEqual(["Payam", "Lyra"]);
  });

  it("degrades an empty people array to undefined", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [{ label: "Latte", amount: 4.5, people: [] }],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.people).toBeUndefined();
  });

  it("degrades a people array that becomes empty after filtering to undefined", () => {
    const out = parseReceiptJsonContent(
      JSON.stringify({
        merchant: null, currency: null,
        lines: [{ label: "Latte", amount: 4.5, people: ["", "   ", 42, null] }],
        subtotal: null, tax: null, serviceCharge: null, discount: null, total: null,
      }),
    );
    expect(out.lines[0]?.people).toBeUndefined();
  });
});

describe("parseReceiptImageBase64", () => {
  it("sends a byte-identical payload for a single image (backward compatibility)", async () => {
    callAiProxyMock.mockClear();
    await parseReceiptImageBase64({
      images: [{ base64: "abc123", mimeType: "image/jpeg" }],
      currencyHint: "USD",
    });
    expect(callAiProxyMock).toHaveBeenCalledTimes(1);
    // Exactly the shape this function has always sent for one image: no
    // `images` array, just the legacy top-level `imageBase64`/`mimeType`
    // fields. This is what proves a single-image call is unaffected by
    // multi-image support.
    expect(callAiProxyMock).toHaveBeenCalledWith("parse-receipt", {
      imageBase64: "abc123",
      mimeType: "image/jpeg",
      currencyHint: "USD",
    });
  });

  it("forwards description and participantNames when supplied (single image)", async () => {
    callAiProxyMock.mockClear();
    await parseReceiptImageBase64({
      images: [{ base64: "abc123", mimeType: "image/jpeg" }],
      currencyHint: "USD",
      description: "جوجه جنگلی was mine, Lyra and Eliana shared the جوجه کبک",
      participantNames: ["Payam", "Lyra", "Eliana"],
    });
    expect(callAiProxyMock).toHaveBeenCalledWith("parse-receipt", {
      imageBase64: "abc123",
      mimeType: "image/jpeg",
      currencyHint: "USD",
      description: "جوجه جنگلی was mine, Lyra and Eliana shared the جوجه کبک",
      participantNames: ["Payam", "Lyra", "Eliana"],
    });
  });

  it("sends an `images` array, in order, for multiple images", async () => {
    callAiProxyMock.mockClear();
    await parseReceiptImageBase64({
      images: [
        { base64: "page1", mimeType: "image/jpeg" },
        { base64: "page2", mimeType: "image/png" },
      ],
      currencyHint: "USD",
    });
    expect(callAiProxyMock).toHaveBeenCalledWith("parse-receipt", {
      images: [
        { base64: "page1", mimeType: "image/jpeg" },
        { base64: "page2", mimeType: "image/png" },
      ],
      currencyHint: "USD",
    });
  });

  it("forwards description and participantNames alongside multiple images", async () => {
    callAiProxyMock.mockClear();
    await parseReceiptImageBase64({
      images: [
        { base64: "page1", mimeType: "image/jpeg" },
        { base64: "page2", mimeType: "image/jpeg" },
        { base64: "page3", mimeType: "image/jpeg" },
      ],
      currencyHint: "USD",
      description: "Payam had the چلوکباب",
      participantNames: ["Payam", "Lyra"],
    });
    expect(callAiProxyMock).toHaveBeenCalledWith("parse-receipt", {
      images: [
        { base64: "page1", mimeType: "image/jpeg" },
        { base64: "page2", mimeType: "image/jpeg" },
        { base64: "page3", mimeType: "image/jpeg" },
      ],
      currencyHint: "USD",
      description: "Payam had the چلوکباب",
      participantNames: ["Payam", "Lyra"],
    });
  });

  it("rejects an empty images array without calling the proxy", async () => {
    callAiProxyMock.mockClear();
    await expect(
      parseReceiptImageBase64({ images: [], currencyHint: "USD" }),
    ).rejects.toThrow();
    expect(callAiProxyMock).not.toHaveBeenCalled();
  });

  it("rejects more than 3 images without calling the proxy", async () => {
    callAiProxyMock.mockClear();
    await expect(
      parseReceiptImageBase64({
        images: [
          { base64: "a", mimeType: "image/jpeg" },
          { base64: "b", mimeType: "image/jpeg" },
          { base64: "c", mimeType: "image/jpeg" },
          { base64: "d", mimeType: "image/jpeg" },
        ],
        currencyHint: "USD",
      }),
    ).rejects.toThrow();
    expect(callAiProxyMock).not.toHaveBeenCalled();
  });
});
