/**
 * Infer expense category from free-text title (English + Farsi keywords).
 * Returns `null` for General when nothing matches.
 */

export type GuessableCategory = "food" | "snack" | "drink" | "home" | "transport";

type Rule = { re: RegExp; category: GuessableCategory };

/** Order matters: first match wins (put more specific patterns first). */
const ENTERTAINMENT_TICKET =
  /\b(movie|concert|show|theater|theatre|sports)\s+ticket\b/i;

const RULES: Rule[] = [
  {
    re: /uber\s*eats|doordash|grubhub|postmates|snapp\s*food|اسنپ(?:‌|\s)*فود/i,
    category: "food",
  },
  {
    re: /\b(plane|train|bus|metro|subway)\s+ticket\b/i,
    category: "transport",
  },
  {
    re: /\b(ticket|tickets|uber|lyft|taxi|cab|rideshare|transit|commute|commuting)\b|تاکسی|تپسی|اسنپ(?!\s*مارکت|(?:‌|\s)*مارکت)/i,
    category: "transport",
  },
  {
    re: /\b(bus|train|metro|subway|tram|flight|flights|airport|parking|toll|gas|fuel|highway|car\s*rental|rent-a-car)\b|اتوبوس|مترو|قطار|پرواز|فرودگاه|پارکینگ|عوارض|بنزین/i,
    category: "transport",
  },
  {
    re: /\b(rent|mortgage|lease|utilities|electricity|water\s+bill|internet|wifi|furniture|ikea|home\s+depot|lowe'?s|cleaning|plumber|hardware)\b|اجاره|رهن|قبض|برق|آب|گاز|اینترنت|وای(?:‌|\s)*فای|مبلمان|نظافت|لوله(?:‌|\s)*کش/i,
    category: "home",
  },
  {
    re: /\b(snack|snacks|chips|crisps|nuts|popcorn|candy|chocolate)\b|سوپر(?:‌|\s)*مارکت|اسنپ(?:‌|\s)*مارکت|فروشگاه/i,
    category: "snack",
  },
  {
    re: /\b(wine|beer|whiskey|vodka|rum|cocktail|coke|coca\s*cola|soda|fanta|delster|water)\b|خمر|می|شراب|عرق|نوشابه|فانتا|دلستر|آبجو|کوکا(?:کولا)?|کوکاکولا|زهرماری|آب(?:‌|\s)*(?:معدنی|میوه)/i,
    category: "drink",
  },
  {
    re: /\b(burger|pizza|pasta|sushi|dinner|lunch|brunch|breakfast|coffee|grocer|groceries|grocery|restaurant|food|meal|cafe)\b|غذا|رستوران|کافه|قهوه|صبحانه|ناهار|شام|خواربار|گوشت|مرغ|جوجه|کباب/i,
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
