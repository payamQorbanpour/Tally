import { isValidCurrencyCode } from "../data/currencies";
import {
  getAiApiKey,
  getAiBaseUrl,
  getAiModel,
  getExpensePromptTemplate,
  getOpenAiApiKeyForReceipts,
  getOpenAiReceiptModel,
  getReceiptParseProxyUrl,
} from "./receiptAiEnv";
import type {
  ParsedExpenseDescription,
  ParsedExpenseItem,
  ParsedExpenseSplit,
} from "./expenseDescriptionTypes";

const DESCRIPTION_JSON_SCHEMA_HINT = `Instructions:
1. Multiple Expenses: If the description mentions several distinct transactions or purchases (e.g. "Alice paid 20 for coffee and Bob paid 50 for dinner"), return ONE entry per transaction in the "expenses" array. Do not merge unrelated transactions into a single expense.
2. Entity Resolution: Prefer a name from the provided participant list — if the text refers to one of them, copy that participant's name exactly. If the description clearly introduces a new person who is NOT in the participant list (e.g. "Kathy paid 10"), keep the new name verbatim as written; the app will create that person automatically. If a name is ambiguous, use your best judgement but lower the confidence score.
3. Split Logic:
   - If the text says "split equally", divide the total amount by the number of people involved.
   - If specific amounts are mentioned for some people but not others, assign the remainder to the person who "paid for the rest".
4. Validation: For each expense the sum of splits[].amount MUST equal amount (within 0.01).
5. Formatting: Amounts are standard decimal numbers in major currency units (e.g. 12.5 for twelve and a half). Never return amounts as strings.
6. Names: "payer" and every "person" MUST be a single human name (no placeholders like "unknown", no generic labels). Prefer names from the participant list; otherwise use the exact new name the description introduced.

Output Format:
Return ONLY a JSON object (no markdown) with this structure:
{
  "currency": "ISO Code" or null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "Short explanation of how splits were calculated",
  "expenses": [
    {
      "description": string,
      "amount": number,
      "payer": string,
      "splits": [ { "person": string, "amount": number } ]
    }
  ]
}`;

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

function buildSystemPrompt(opts: {
  participantNames: string[];
  currencyHint: string;
}): string {
  const participants = opts.participantNames.map((n) => `"${n}"`).join(", ");
  const override = getExpensePromptTemplate();
  if (override) {
    return override
      .replaceAll("{currency}", opts.currencyHint)
      .replaceAll("{participants}", participants);
  }
  return `You are a financial parsing assistant. Your goal is to convert natural language into a strictly validated JSON format for expense tracking.\n\nContext:\n- Default Currency: ${opts.currencyHint} (interpret amounts in this currency unless the user clearly uses another ISO currency code).\n- Allowed Participants: ${participants}.\n\n${DESCRIPTION_JSON_SCHEMA_HINT}`;
}

async function callOpenAiChat(opts: {
  apiKey: string;
  model: string;
  userPrompt: string;
  participantNames: string[];
  currencyHint: string;
}): Promise<ParsedExpenseDescription> {
  const sys = buildSystemPrompt({
    participantNames: opts.participantNames,
    currencyHint: opts.currencyHint,
  });

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
        { role: "system", content: sys },
        { role: "user", content: opts.userPrompt },
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
  return parseExpenseDescriptionJsonContent(content);
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function callAiChat(opts: {
  apiKey: string | null;
  baseUrl: string;
  model: string;
  userPrompt: string;
  participantNames: string[];
  currencyHint: string;
}): Promise<ParsedExpenseDescription> {
  const sys = buildSystemPrompt({
    participantNames: opts.participantNames,
    currencyHint: opts.currencyHint,
  });

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;

  const res = await fetch(joinUrl(opts.baseUrl, "/chat/completions"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: opts.userPrompt },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`AI HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI returned no message content");
  }
  return parseExpenseDescriptionJsonContent(content);
}

async function callProxy(opts: {
  url: string;
  userPrompt: string;
  participantNames: string[];
  currencyHint: string;
}): Promise<ParsedExpenseDescription> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "expense-description",
      prompt: opts.userPrompt,
      participantNames: opts.participantNames,
      currencyHint: opts.currencyHint,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Describe proxy HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const text = await res.text();
  return parseExpenseDescriptionJsonContent(text);
}

export async function parseExpenseDescription(input: {
  prompt: string;
  currencyHint: string;
  participantNames: string[];
}): Promise<ParsedExpenseDescription> {
  const proxy = getReceiptParseProxyUrl();
  if (proxy) {
    return callProxy({
      url: proxy,
      userPrompt: input.prompt,
      participantNames: input.participantNames,
      currencyHint: input.currencyHint,
    });
  }
  const aiBaseUrl = getAiBaseUrl();
  if (aiBaseUrl) {
    return callAiChat({
      apiKey: getAiApiKey(),
      baseUrl: aiBaseUrl,
      model: getAiModel(),
      userPrompt: input.prompt,
      participantNames: input.participantNames,
      currencyHint: input.currencyHint,
    });
  }
  const apiKey = getOpenAiApiKeyForReceipts();
  if (!apiKey) {
    throw new Error("MISSING_OPENAI_KEY");
  }
  return callOpenAiChat({
    apiKey,
    model: getOpenAiReceiptModel(),
    userPrompt: input.prompt,
    participantNames: input.participantNames,
    currencyHint: input.currencyHint,
  });
}
