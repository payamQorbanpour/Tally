import Ionicons from "@expo/vector-icons/Ionicons";

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
