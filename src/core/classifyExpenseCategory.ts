import { callAiProxy } from "./aiProxy";
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

/**
 * Best-effort AI category classification via the ai-proxy Edge Function.
 * Falls back to the local keyword heuristic when the proxy is unavailable
 * or returns no usable answer. Never throws.
 */
export async function classifyExpenseCategory(
  title: string,
): Promise<ExpenseCategoryId> {
  const cleaned = title.trim();
  if (!cleaned) return null;

  try {
    const res = await callAiProxy("classify-category", { title: cleaned });
    const text = await res.text().catch(() => "");
    if (text) {
      const out = extractCategoryFromJson(text);
      if (out !== null) return out;
    }
  } catch {
    /* fall through to local heuristic */
  }
  return guessCategoryFromTitle(cleaned);
}
