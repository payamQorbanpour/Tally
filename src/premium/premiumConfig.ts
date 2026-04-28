import type { PassType } from "./passes";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

/**
 * Pass product IDs (one-time, non-consumable IAPs). Same SKU on both
 * stores when possible. `null` when not configured (local dev / web).
 *
 * Each pass has two SKUs: the initial purchase and a cheaper "extend"
 * SKU the user redeems from the expired-pass prompt.
 */
export function getPassProductId(type: PassType): string | null {
  switch (type) {
    case "night":
      return trim(process.env.EXPO_PUBLIC_NIGHT_OUT_PASS_ID) ?? null;
    case "trip":
      return trim(process.env.EXPO_PUBLIC_TRIP_PASS_ID) ?? null;
    case "explorer":
      return trim(process.env.EXPO_PUBLIC_EXPLORER_PASS_ID) ?? null;
  }
}

export function getPassExtendProductId(type: PassType): string | null {
  switch (type) {
    case "night":
      return trim(process.env.EXPO_PUBLIC_NIGHT_OUT_EXTEND_ID) ?? null;
    case "trip":
      return trim(process.env.EXPO_PUBLIC_TRIP_EXTEND_ID) ?? null;
    case "explorer":
      return trim(process.env.EXPO_PUBLIC_EXPLORER_EXTEND_ID) ?? null;
  }
}

/**
 * Legacy: comma-separated subscription product IDs. Kept on the public
 * surface so older builds (where premium was a recurring subscription)
 * still grandfather their existing subscribers in via
 * `mod.hasActiveSubscriptions(skus)`. New builds should leave it unset.
 */
export function getLegacySubscriptionProductIds(): string[] {
  const raw = trim(process.env.EXPO_PUBLIC_PREMIUM_SUBSCRIPTION_IDS);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * True when at least one IAP product ID — pass or legacy subscription —
 * is configured. Used to decide whether to offer in-app purchase or fall
 * back to the web subscribe URL.
 */
export function isIapConfigured(): boolean {
  if (getLegacySubscriptionProductIds().length > 0) return true;
  if (getPassProductId("night")) return true;
  if (getPassProductId("trip")) return true;
  if (getPassProductId("explorer")) return true;
  return false;
}

/** Supabase Edge Function slug (no leading slash). */
export function getSyncAppleSubscriptionFunctionSlug(): string {
  return trim(process.env.EXPO_PUBLIC_SYNC_APPLE_SUBSCRIPTION_SLUG) ?? "sync-apple-subscription";
}

/**
 * External web checkout page (e.g. https://tally.example.com/plans).
 * Surfaced as a fallback CTA on the Plans screen when in-app purchases
 * are unavailable — web builds, dev, or stores that disallow IAP for
 * the user's region. When unset, no fallback button is shown.
 */
export function getSubscriptionWebUrl(): string | null {
  const raw = trim(process.env.EXPO_PUBLIC_SUBSCRIPTION_URL);
  if (!raw) return null;
  // Refuse anything that isn't an http(s) URL — opening custom schemes here
  // would be a footgun (we'd send users to e.g. `tally://` and bounce back).
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw;
}
