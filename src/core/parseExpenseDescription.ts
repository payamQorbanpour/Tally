import { isValidCurrencyCode } from "../data/currencies";
import { callAiProxy } from "./aiProxy";
import type {
  ParsedExpenseDescription,
  ParsedExpenseItem,
  ParsedExpenseSplit,
} from "./expenseDescriptionTypes";

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeSplits(raw: unknown): ParsedExpenseSplit[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedExpenseSplit[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const personName = typeof o.person === "string" ? o.person.trim() : "";
    const amountMajor = coerceNumber(o.amount);
    if (!personName || amountMajor === null) continue;
    out.push({ personName, amountMajor });
  }
  return out;
}

function normalizeExpenses(raw: unknown): ParsedExpenseItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ParsedExpenseItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const description =
      typeof o.description === "string" && o.description.trim()
        ? o.description.trim()
        : "";
    const amountMajor = coerceNumber(o.amount);
    const payerName = typeof o.payer === "string" ? o.payer.trim() : "";
    const splits = normalizeSplits(o.splits);
    if (!description || amountMajor === null || !payerName || splits.length === 0) continue;
    out.push({ description, amountMajor, payerName, splits });
  }
  return out;
}

/** Exported for unit tests and optional server-side reuse. */
export function parseExpenseDescriptionJsonContent(
  jsonText: string,
): ParsedExpenseDescription {
  const trimmed = jsonText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const slice =
    start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
  const data = JSON.parse(slice) as Record<string, unknown>;
  const currencyRaw =
    typeof data.currency === "string" ? data.currency.trim().toUpperCase() : null;
  const currency =
    currencyRaw && isValidCurrencyCode(currencyRaw) ? currencyRaw : null;
  const reasoning =
    typeof data.reasoning === "string" && data.reasoning.trim()
      ? data.reasoning.trim()
      : undefined;
  return {
    currency,
    expenses: normalizeExpenses(data.expenses),
    confidence:
      data.confidence === "high" ||
      data.confidence === "medium" ||
      data.confidence === "low"
        ? data.confidence
        : undefined,
    reasoning,
  };
}

export async function parseExpenseDescription(input: {
  prompt: string;
  currencyHint: string;
  participantNames: string[];
  /** Optional receipt images to reason about alongside the prompt (multimodal call). */
  images?: { base64: string; mimeType: string }[];
}): Promise<ParsedExpenseDescription> {
  const res = await callAiProxy("parse-description", {
    prompt: input.prompt,
    currencyHint: input.currencyHint,
    participantNames: input.participantNames,
    images: (input.images ?? []).map((i) => ({
      base64: i.base64,
      mimeType: i.mimeType,
    })),
  });
  const text = await res.text();
  return parseExpenseDescriptionJsonContent(text);
}
