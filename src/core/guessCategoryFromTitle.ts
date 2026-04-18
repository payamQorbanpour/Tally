/**
 * Infer expense category from free-text title (English keywords).
 * Returns `null` for General when nothing matches.
 */

export type GuessableCategory = "food" | "home" | "transport";

type Rule = { re: RegExp; category: GuessableCategory };

/** Order matters: first match wins (put more specific patterns first). */
const ENTERTAINMENT_TICKET =
  /\b(movie|concert|show|theater|theatre|sports)\s+ticket\b/i;

const RULES: Rule[] = [
  { re: /uber\s*eats|doordash|grubhub|postmates/i, category: "food" },
  {
    re: /\b(plane|train|bus|metro|subway)\s+ticket\b/i,
    category: "transport",
  },
  {
    re: /\b(ticket|tickets|uber|lyft|taxi|cab|rideshare|transit|commute|commuting)\b/i,
    category: "transport",
  },
  {
    re: /\b(bus|train|metro|subway|tram|flight|flights|airport|parking|toll|gas|fuel|highway|car\s*rental|rent-a-car)\b/i,
    category: "transport",
  },
  {
    re: /\b(rent|mortgage|lease|utilities|electricity|water\s+bill|internet|wifi|furniture|ikea|home\s+depot|lowe'?s|cleaning|plumber|hardware)\b/i,
    category: "home",
  },
  {
    re: /\b(burger|pizza|pasta|sushi|dinner|lunch|brunch|breakfast|coffee|grocer|groceries|grocery|restaurant|bar|drinks|snack|snacks|food|meal|cafe)\b/i,
    category: "food",
  },
];

export function guessCategoryFromTitle(title: string): GuessableCategory | null {
  const t = title.trim();
  if (!t) return null;
  if (ENTERTAINMENT_TICKET.test(t)) return null;
  for (const { re, category } of RULES) {
    if (re.test(t)) return category;
  }
  return null;
}
