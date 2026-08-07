import { isValidCurrencyCode } from "../data/currencies";
import { callAiProxy } from "./aiProxy";
import type { ParsedReceiptLine, ParsedReceiptPayload } from "./receiptParseTypes";

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Some models — especially weaker open-weights vision models — sidestep OCR
 * on non-Latin scripts (e.g. Persian receipts) and respond with placeholder
 * labels like `item 1`, `Item 02`, `line3`, or even the JSON schema field
 * names (`serviceCharge`, `tax`, `discount`). When that happens we'd rather
 * surface a clear human-readable category in the UI ("Item", "Service
 * charge", "Tax", …) than echo a stub label that pretends the model read
 * the receipt — the user can rename the line themselves and at least the
 * category-specific labels stay informative for tax / service-charge rows.
 *
 * Returns the cleaned label, or null when the model gave us a fully
 * generic placeholder for a normal item (we replace it with "Item").
 */
function normalizePlaceholderLabel(label: string): string | null {
  const s = label.trim().toLowerCase();
  if (!s) return "Item";
  if (/^items?[\s_-]*\d+$/.test(s)) return "Item";
  if (/^lines?[\s_-]*\d+$/.test(s)) return "Item";
  if (/^rows?[\s_-]*\d+$/.test(s)) return "Item";
  if (/^products?[\s_-]*\d*$/.test(s)) return "Item";
  if (s === "servicecharge" || s === "service_charge" || s === "service charge") {
    return "Service charge";
  }
  if (s === "tax") return "Tax";
  if (s === "discount") return "Discount";
  // Subtotal / total never belong inside the per-line list — drop the row.
  if (s === "subtotal" || s === "total") return null;
  return label;
}

function coerceLineKind(v: unknown): ParsedReceiptLine["kind"] {
  return v === "item" || v === "surcharge" || v === "discount" ? v : undefined;
}

/**
 * Defensive coercion for the model's per-line `people` attribution: a
 * missing field, a non-array, non-string entries, and empty strings all
 * degrade to `undefined` rather than propagating junk to the UI layer,
 * which is the only place these names get resolved to member ids.
 */
function coerceLinePeople(v: unknown): ParsedReceiptLine["people"] {
  if (!Array.isArray(v)) return undefined;
  const names = v
    .filter((s): s is string => typeof s === "string")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return names.length > 0 ? names : undefined;
}

function normalizeLines(raw: unknown): ParsedReceiptLine[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedReceiptLine[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const rawLabel = typeof o.label === "string" ? o.label.trim() : "";
    const amount = coerceNumber(o.amount);
    if (!rawLabel || amount === null) continue;
    const label = normalizePlaceholderLabel(rawLabel);
    if (label === null) continue;
    out.push({
      label,
      amount,
      kind: coerceLineKind(o.kind),
      people: coerceLinePeople(o.people),
    });
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

export async function parseReceiptImageBase64(input: {
  base64: string;
  mimeType: string;
  /** Group ISO currency — guides the model */
  currencyHint: string;
  /**
   * Optional free-text description accompanying the photo (e.g. "جوجه
   * جنگلی was mine, Lyra and Eliana shared the جوجه کبک"), same idea as
   * `parseExpenseDescription`'s `prompt`. When supplied together with
   * `participantNames`, the model may attribute lines to people via
   * `ParsedReceiptLine.people`. Omitted entirely from the request when
   * absent, so a photo-only parse is byte-identical to today.
   */
  description?: string;
  /** Candidate names the model should prefer when attributing a line to someone. */
  participantNames?: string[];
}): Promise<ParsedReceiptPayload> {
  const payload: Record<string, unknown> = {
    imageBase64: input.base64,
    mimeType: input.mimeType,
    currencyHint: input.currencyHint,
  };
  if (input.description) payload.description = input.description;
  if (input.participantNames) payload.participantNames = input.participantNames;
  const res = await callAiProxy("parse-receipt", payload);
  const text = await res.text();
  return parseReceiptJsonContent(text);
}
