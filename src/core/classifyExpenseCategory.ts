import {
  getAiApiKey,
  getAiBaseUrl,
  getAiModel,
  getCategoryPromptTemplate,
  getOpenAiApiKeyForReceipts,
  getOpenAiReceiptModel,
  getReceiptParseProxyUrl,
} from "./receiptAiEnv";
import {
  type GuessableCategory,
  guessCategoryFromTitle,
} from "./guessCategoryFromTitle";

export type ExpenseCategoryId = GuessableCategory | null;

const VALID_CATEGORIES: ReadonlySet<string> = new Set<string>([
  "food",
  "snack",
  "drink",
  "home",
  "transport",
]);

const DEFAULT_SYSTEM_PROMPT = `You classify an expense title into exactly one of these category ids:
- "food"      (meals, restaurants, groceries, coffee, food delivery)
- "snack"     (chips, candy, convenience snacks, supermarket snacks)
- "drink"     (alcohol, soda, juice, bottled water)
- "home"      (rent, utilities, furniture, cleaning, household repairs)
- "transport" (taxi, rideshare, fuel, parking, plane/train/bus tickets)
- "general"   (anything that does not clearly fit the above)

Reply with ONLY a JSON object: {"category": "<id>"} — no prose, no markdown.`;

function getSystemPrompt(): string {
  return getCategoryPromptTemplate() ?? DEFAULT_SYSTEM_PROMPT;
}

function normalizeCategory(raw: unknown): ExpenseCategoryId {
  if (typeof raw !== "string") return null;
  const key = raw.trim().toLowerCase();
  if (key === "general" || key === "") return null;
  return VALID_CATEGORIES.has(key) ? (key as GuessableCategory) : null;
}

function extractCategoryFromJson(jsonText: string): ExpenseCategoryId {
  try {
    const trimmed = jsonText.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    const slice =
      start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
    const data = JSON.parse(slice) as { category?: unknown };
    return normalizeCategory(data.category);
  } catch {
    return null;
  }
}

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

async function callChat(opts: {
  url: string;
  apiKey: string | null;
  model: string;
  title: string;
}): Promise<ExpenseCategoryId> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const res = await fetch(opts.url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: getSystemPrompt() },
        { role: "user", content: `Title: ${opts.title}` },
      ],
    }),
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    choices?: { message?: { content?: string } }[];
  } | null;
  const content = body?.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") return null;
  return extractCategoryFromJson(content);
}

async function callProxy(opts: {
  url: string;
  title: string;
}): Promise<ExpenseCategoryId> {
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kind: "classify-category", title: opts.title }),
  });
  if (!res.ok) return null;
  const text = await res.text().catch(() => "");
  if (!text) return null;
  return extractCategoryFromJson(text);
}

/**
 * Best-effort AI category classification. Use AI model
 * then a proxy server, then the local keyword heuristic. Returns
 * `null` (General) if all paths fail — this function never throws.
 */
export async function classifyExpenseCategory(
  title: string,
): Promise<ExpenseCategoryId> {
  const cleaned = title.trim();
  if (!cleaned) return null;

  try {
    const aiBaseUrl = getAiBaseUrl();
    if (aiBaseUrl) {
      const out = await callChat({
        url: joinUrl(aiBaseUrl, "/chat/completions"),
        apiKey: getAiApiKey(),
        model: getAiModel(),
        title: cleaned,
      });
      if (out !== null) return out;
    }

    const openAiKey = getOpenAiApiKeyForReceipts();
    if (openAiKey) {
      const out = await callChat({
        url: "https://api.openai.com/v1/chat/completions",
        apiKey: openAiKey,
        model: getOpenAiReceiptModel(),
        title: cleaned,
      });
      if (out !== null) return out;
    }

    const proxy = getReceiptParseProxyUrl();
    if (proxy) {
      const out = await callProxy({ url: proxy, title: cleaned });
      if (out !== null) return out;
    }
  } catch {
    /* fall through to local heuristic */
  }

  return guessCategoryFromTitle(cleaned);
}
