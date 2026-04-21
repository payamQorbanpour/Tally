const trim = (v: string | undefined) => (v ? v.trim() : undefined);

/**
 * Comma-separated App Store / Play subscription product IDs (same ID on both stores when possible).
 * When empty, premium gating is off (local dev / web builds without IAP).
 */
export function getPremiumSubscriptionProductIds(): string[] {
  const raw = trim(process.env.EXPO_PUBLIC_PREMIUM_SUBSCRIPTION_IDS);
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isPremiumIapConfigured(): boolean {
  return getPremiumSubscriptionProductIds().length > 0;
}

/** Supabase Edge Function slug (no leading slash). */
export function getSyncAppleSubscriptionFunctionSlug(): string {
  return trim(process.env.EXPO_PUBLIC_SYNC_APPLE_SUBSCRIPTION_SLUG) ?? "sync-apple-subscription";
}
