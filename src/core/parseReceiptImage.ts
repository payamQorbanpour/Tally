import { isValidCurrencyCode } from "../data/currencies";
import {
  getOpenAiApiKeyForReceipts,
  getOpenAiReceiptModel,
  getReceiptParseProxyUrl,
} from "./receiptAiEnv";
import type { ParsedReceiptLine, ParsedReceiptPayload } from "./receiptParseTypes";

const RECEIPT_JSON_SCHEMA_HINT = `Return ONLY a JSON object (no markdown) with this shape:
{
  "merchant": string or null,
  "currency": string or null,
  "lines": [ { "label": string, "amount": number } ],
  "subtotal": number or null,
  "tax": number or null,
  "serviceCharge": number or null,
  "discount": number or null,
  "total": number or null,
  "confidence": "high" | "medium" | "low"
}
Rules:
- amounts are in major units of the receipt (e.g. 12.5 for twelve and a half dollars), use a decimal point.
- Put each printed line item in lines[]. Use negative amount for discounts on a line if needed.
- tax, serviceCharge, discount are optional aggregates when shown separately; you may duplicate in lines[] for clarity.
- total should match the printed total when visible.`;

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeLines(raw: unknown): ParsedReceiptLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedReceiptLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const label = typeof o.label === "string" ? o.label.trim() : "";
    const amount = coerceNumber(o.amount);
    if (!label || amount === null) continue;
    out.push({ label, amount });
  }
  return out;
}

/** Exported for unit tests and optional server-side reuse. */
export function parseReceiptJsonContent(jsonText: string): ParsedReceiptPayload {
  const trimmed = jsonText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice =
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const data = JSON.parse(slice) as Record<string, unknown>;
  const currencyRaw = typeof data.currency === "string" ? data.currency.trim().toUpperCase() : null;
  const currency =
    currencyRaw && isValidCurrencyCode(currencyRaw) ? currencyRaw : null;
  const merchant =
    typeof data.merchant === "string" && data.merchant.trim()
      ? data.merchant.trim()
      : null;
  return {
    merchant,
    currency,
    lines: normalizeLines(data.lines),
    subtotal: coerceNumber(data.subtotal),
    tax: coerceNumber(data.tax),
    serviceCharge: coerceNumber(data.serviceCharge),
    discount: coerceNumber(data.discount),
    total: coerceNumber(data.total),
    confidence:
      data.confidence === "high" ||
      data.confidence === "medium" ||
      data.confidence === "low"
        ? data.confidence
        : undefined,
  };
}

async function callOpenAiVision(opts: {
  apiKey: string;
  model: string;
  base64: string;
  mimeType: string;
  currencyHint: string;
}): Promise<ParsedReceiptPayload> {
  const userText = `Parse this receipt image. Interpret monetary amounts in the group's billing currency **${opts.currencyHint}** unless the receipt clearly shows another ISO currency code (then set "currency" and still express numeric amounts as printed). ${RECEIPT_JSON_SCHEMA_HINT}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userText },
            {
              type: "image_url",
              image_url: {
                url: `data:${opts.mimeType};base64,${opts.base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("OpenAI returned no message content");
  }
  return parseReceiptJsonContent(content);
}

async function callProxy(opts: {
  url: string;
  base64: string;
  mimeType: string;
  currencyHint: string;
}): Promise<ParsedReceiptPayload> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageBase64: opts.base64,
      mimeType: opts.mimeType,
      currencyHint: opts.currencyHint,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Receipt proxy HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const text = await res.text();
  return parseReceiptJsonContent(text);
}

export async function parseReceiptImageBase64(input: {
  base64: string;
  mimeType: string;
  /** Group ISO currency — guides the model */
  currencyHint: string;
}): Promise<ParsedReceiptPayload> {
  const proxy = getReceiptParseProxyUrl();
  if (proxy) {
    return callProxy({
      url: proxy,
      base64: input.base64,
      mimeType: input.mimeType,
      currencyHint: input.currencyHint,
    });
  }
  const apiKey = getOpenAiApiKeyForReceipts();
  if (!apiKey) {
    throw new Error("MISSING_OPENAI_KEY");
  }
  return callOpenAiVision({
    apiKey,
    model: getOpenAiReceiptModel(),
    base64: input.base64,
    mimeType: input.mimeType,
    currencyHint: input.currencyHint,
  });
}
