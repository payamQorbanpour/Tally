/**
 * Displayed pass prices, remotely overridable.
 *
 * DISPLAY ONLY. What a user is actually charged is owned by App Store Connect
 * and Cafe Bazaar via the SKUs in `premiumConfig.ts`; nothing here changes an
 * amount. That makes this a SECOND source of truth, and a drift means the user
 * sees one number and is charged another — a refund and store-review problem,
 * not merely a bug. `docs/ops/remote-config.md` lists each key beside the SKU
 * it must match.
 *
 * Falls back to the bundled translation string rather than to another locale's
 * price: showing a Spanish user a dollar amount they will not be charged is
 * worse than showing the shipped string.
 */
import type { PassType } from "../premium/passes";
import { configLocaleMap, type RemoteConfig } from "./remoteConfig";

const PRICE_KEYS: Readonly<Record<PassType, string>> = {
  night: "plans_price_night",
  trip: "plans_price_trip",
  explorer: "plans_price_explorer",
};

export function planPriceFrom(
  config: RemoteConfig,
  type: PassType,
  locale: string,
  fallback: string,
): string {
  const remote = configLocaleMap(config, PRICE_KEYS[type])?.[locale];
  return typeof remote === "string" && remote.trim() !== "" ? remote : fallback;
}
