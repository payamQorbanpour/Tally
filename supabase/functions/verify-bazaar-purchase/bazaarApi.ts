/**
 * Cafe Bazaar Developer API v2 client.
 *
 * Deliberately dependency-free (no Deno.*, no npm: imports) so the parsing and
 * URL construction are unit-testable under Vitest alongside the app code, the
 * same arrangement `ad-reward/admobSsv.ts` uses.
 *
 * Endpoints (from the published v2 reference):
 *   token:    POST https://pardakht.cafebazaar.ir/devapi/v2/auth/token/
 *   validate: GET  .../devapi/v2/api/validate/{package}/inapp/{sku}/purchases/{token}/
 */

const BASE = "https://pardakht.cafebazaar.ir/devapi/v2";

export type BazaarPurchase = {
  purchased: boolean;
  consumed: boolean;
  purchaseTimeMs: number | null;
};

export type BazaarResult =
  | { ok: true; purchase: BazaarPurchase }
  | { ok: false; reason: "auth" | "not_found" | "network" | "malformed" };

/**
 * `sku` and `token` come from the client, so each segment is encoded — an
 * unencoded `../` would otherwise let a caller redirect the request to a
 * different Developer API endpoint.
 */
export function buildValidateUrl(pkg: string, sku: string, token: string): string {
  const seg = (s: string) => encodeURIComponent(s);
  return `${BASE}/api/validate/${seg(pkg)}/inapp/${seg(sku)}/purchases/${seg(token)}/`;
}

export function parsePurchaseResponse(status: number, body: string): BazaarResult {
  if (status === 401 || status === 403) return { ok: false, reason: "auth" };
  if (status === 404) return { ok: false, reason: "not_found" };
  if (status < 200 || status >= 300) return { ok: false, reason: "network" };

  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (raw === null || typeof raw !== "object") {
    return { ok: false, reason: "malformed" };
  }
  const parsed = raw as Record<string, unknown>;
  if (typeof parsed.purchaseState !== "number") {
    return { ok: false, reason: "malformed" };
  }

  // Field semantics confirmed against Cafe Bazaar's own reference:
  // https://developers.cafebazaar.ir/document/in-app-billing/api/validation/
  // (their docs site is a client-rendered SPA, so the readable source is the
  // WordPress API behind it: /wp-json/wp/v2/document/2453)
  //
  //   purchaseState      0 normally, 1 if the purchase was refunded.
  //   consumptionState   0 if consumed, 1 if NOT consumed. This is inverted
  //                      relative to Google Play, where 1 means consumed —
  //                      do not "fix" it to match Play.
  //   purchaseTime       ms since epoch. Note the field is `purchaseTime`,
  //                      not `time`; reading the wrong key silently yields
  //                      null and pushes the caller onto its Date.now()
  //                      fallback for every purchase.
  const purchased = parsed.purchaseState === 0;
  return {
    ok: true,
    purchase: {
      purchased,
      consumed: parsed.consumptionState === 0,
      purchaseTimeMs:
        purchased && typeof parsed.purchaseTime === "number" ? parsed.purchaseTime : null,
    },
  };
}

/** Exchange the long-lived refresh token for an access token. Null on failure. */
export async function fetchAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${BASE}/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        refresh_token: opts.refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: unknown };
    return typeof json.access_token === "string" ? json.access_token : null;
  } catch {
    return null;
  }
}
