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

/**
 * External web subscription page (e.g. https://tally.example.com/subscribe).
 * Used as a fallback "Subscribe" CTA on the premium gate when in-app
 * purchases are unavailable — web builds, dev, or stores that disallow IAP
 * for the user's region. When unset, no fallback button is shown.
 */
export function getSubscriptionWebUrl(): string | null {
  const raw = trim(process.env.EXPO_PUBLIC_SUBSCRIPTION_URL);
  if (!raw) return null;
  // Refuse anything that isn't an http(s) URL — opening custom schemes here
  // would be a footgun (we'd send users to e.g. `tally://` and bounce back).
  if (!/^https?:\/\//i.test(raw)) return null;
  return raw;
}
