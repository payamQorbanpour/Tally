import Ionicons from "@expo/vector-icons/Ionicons";

export const EXPENSE_CATEGORIES = [
  "general",
  "food",
  "snack",
  "drink",
  "home",
  "transport",
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

function isKnownCategory(key: string | null): key is ExpenseCategory {
  if (!key) return false;
  return (EXPENSE_CATEGORIES as readonly string[]).includes(key);
}

/** Ionicons name for expense category chips and list rows. */
export function categoryIconName(
  key: string | null,
): keyof typeof Ionicons.glyphMap {
  switch (key) {
    case "food":
      return "restaurant-outline";
    case "snack":
      return "fast-food-outline";
    case "drink":
      return "beer-outline";
    case "home":
      return "home-outline";
    case "transport":
      return "car-outline";
    default:
      return "receipt-outline";
  }
}

/** i18n key for the category label (falls back to "general" when unknown). */
export function categoryLabelKey(
  key: string | null,
): `categories.${ExpenseCategory}` {
  return `categories.${isKnownCategory(key) ? key : "general"}`;
}
