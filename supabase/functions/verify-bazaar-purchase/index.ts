// supabase/functions/verify-bazaar-purchase/index.ts
//
// Validates a Poolakey purchase token against Cafe Bazaar's Developer API and,
// only on success, writes a `verified_at` pass row. This is the ONLY writer of
// `pass_entitlements.verified_at` — the client cannot set it (column privilege,
// see 20260802000000_pass_verification.sql).
//
// Requires JWT auth: the pass is granted to the caller's own user id, never to
// a user id supplied in the body.
//
// Required Supabase project secrets:
//   BAZAAR_CLIENT_ID, BAZAAR_CLIENT_SECRET, BAZAAR_REFRESH_TOKEN
//   BAZAAR_PACKAGE_NAME   e.g. ir.tally.app
//   BAZAAR_PASS_PRODUCT_MAP   comma-separated sku:passType pairs, e.g.
//     com.payamqorbanpour.tally.pass.night:night,com.payamqorbanpour.tally.pass.trip:trip,com.payamqorbanpour.tally.pass.explorer:explorer

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { buildValidateUrl, fetchAccessToken, parsePurchaseResponse } from "./bazaarApi.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

const PASS_DURATION_MS: Record<string, number> = {
  night: 24 * 60 * 60 * 1000,
  trip: 7 * 24 * 60 * 60 * 1000,
  explorer: 30 * 24 * 60 * 60 * 1000,
};

// Postgres's own uuid input format (hex-8-4-4-4-12). Same shape as
// `ad-reward/index.ts`'s `UUID_RE` — `bound_group_id` is a `uuid` column, and
// a malformed string would otherwise reach Postgres AFTER Bazaar has already
// confirmed the purchase, turning a paid purchase into an opaque 500.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

/** Access tokens are short-lived; cache one and refetch on 401. */
let cachedToken: string | null = null;

async function accessToken(force: boolean): Promise<string | null> {
  if (cachedToken && !force) return cachedToken;
  cachedToken = await fetchAccessToken({
    clientId: env("BAZAAR_CLIENT_ID"),
    clientSecret: env("BAZAAR_CLIENT_SECRET"),
    refreshToken: env("BAZAAR_REFRESH_TOKEN"),
  });
  return cachedToken;
}

// Bazaar's validate endpoint only answers "was this (package, sku, token)
// triple purchased?" — it has no opinion about what entitlement that SKU is
// worth. The client-supplied `passType` can't be trusted to state that
// honestly (a cheap SKU could be paired with an expensive `passType`), so the
// sku → passType mapping must live server-side. Mirrors the product-id
// allowlist pattern in `sync-apple-subscription/index.ts`.
//
// Deliberately excludes the `.extend` SKUs (pass.night.extend etc.) — those
// need "stack time onto an existing pass" (`kind: 'extend'`) logic this
// function doesn't implement yet. Posting one of those SKUs today correctly
// falls through to `unknown_product` (400), not a silently wrong grant.
let cachedProductMap: Map<string, string> | null = null;

function productMap(): Map<string, string> {
  if (cachedProductMap) return cachedProductMap;
  const map = new Map<string, string>();
  for (const pair of env("BAZAAR_PASS_PRODUCT_MAP").split(",")) {
    const [sku, passType] = pair.split(":").map((s) => s.trim());
    if (sku && passType && PASS_DURATION_MS[passType]) map.set(sku, passType);
  }
  cachedProductMap = map;
  return map;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const pkg = env("BAZAAR_PACKAGE_NAME");
  if (!url || !anon || !serviceKey || !pkg) return json(500, { error: "server_misconfigured" });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const productId = typeof body.productId === "string" ? body.productId : "";
  const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken : "";
  // `body.passType` is advisory-only from here on — it is never used to
  // compute duration or written to the database. See the module comment on
  // `productMap` for why the client cannot be trusted with that mapping.
  if (!productId || !purchaseToken) {
    return json(400, { error: "invalid_request" });
  }
  const boundGroupIdRaw = typeof body.boundGroupId === "string" ? body.boundGroupId : null;
  if (boundGroupIdRaw !== null && !UUID_RE.test(boundGroupIdRaw)) {
    return json(400, { error: "invalid_bound_group_id" });
  }

  // Server-side SKU → passType lookup. Must happen before the Bazaar call so
  // an unrecognised SKU never even attempts validation.
  const passType = productMap().get(productId);
  if (!passType) return json(400, { error: "unknown_product" });

  // Validate, refreshing the access token once on an auth failure.
  let token = await accessToken(false);
  if (!token) return json(503, { error: "verification_unavailable" });

  const call = async (t: string) => {
    try {
      const res = await fetch(buildValidateUrl(pkg, productId, purchaseToken), {
        headers: { Authorization: `Bearer ${t}` },
      });
      return parsePurchaseResponse(res.status, await res.text());
    } catch {
      return { ok: false, reason: "network" } as const;
    }
  };

  let result = await call(token);
  if (!result.ok && result.reason === "auth") {
    token = await accessToken(true);
    if (!token) return json(503, { error: "verification_unavailable" });
    result = await call(token);
  }

  if (!result.ok) {
    // `not_found` and `malformed` mean Bazaar does not recognise this token —
    // that is a rejected purchase, not an outage. Only genuine transport /
    // auth trouble should tell the client to retry later.
    if (result.reason === "network" || result.reason === "auth") {
      return json(503, { error: "verification_unavailable" });
    }
    return json(402, { error: "purchase_invalid" });
  }
  if (!result.purchase.purchased) return json(402, { error: "purchase_invalid" });

  const admin = createClient(url, serviceKey);

  // `purchaseTimeMs`'s unit (ms vs seconds) is explicitly UNVERIFIED —
  // bazaarApi.ts. If it turns out to be Unix seconds, a raw value here
  // computes an `expires_at` in 1970 (silently expired, 200 ok, no trace).
  // Clamp to a sane window around "now" and fall back rather than trust it
  // blindly.
  const rawPurchaseTimeMs = result.purchase.purchaseTimeMs;
  const minSaneMs = Date.now() - 400 * 24 * 60 * 60 * 1000;
  const maxSaneMs = Date.now() + 24 * 60 * 60 * 1000;
  let startedMs: number;
  if (
    typeof rawPurchaseTimeMs === "number" &&
    rawPurchaseTimeMs >= minSaneMs &&
    rawPurchaseTimeMs <= maxSaneMs
  ) {
    startedMs = rawPurchaseTimeMs;
  } else {
    console.warn("bazaar_purchase_time_out_of_range", rawPurchaseTimeMs, productId);
    startedMs = Date.now();
  }
  const expiresAt = new Date(startedMs + PASS_DURATION_MS[passType]!).toISOString();

  // `store_transaction_id` is unique per Bazaar purchase, so re-posting the
  // same token is a no-op rather than a second pass. `.select().maybeSingle()`
  // is required to tell "inserted" apart from "conflict, DO NOTHING skipped
  // it" — with a bare upsert `data` is always null either way, so a locally
  // computed `expiresAt` would be returned even when it belongs to nobody (or
  // to a different user).
  const { data: upserted, error: insertErr } = await admin
    .from("pass_entitlements")
    .upsert(
      {
        user_id: userId,
        pass_type: passType,
        kind: "buy",
        product_id: productId,
        store_transaction_id: purchaseToken,
        activated_at: new Date(startedMs).toISOString(),
        expires_at: expiresAt,
        bound_group_id: boundGroupIdRaw,
        verified_at: new Date().toISOString(),
      },
      { onConflict: "store_transaction_id", ignoreDuplicates: true },
    )
    .select("user_id, pass_type, expires_at")
    .maybeSingle();
  if (insertErr) {
    console.error(
      "verify_bazaar_purchase_record_failed",
      userId,
      productId,
      purchaseToken,
      insertErr.message,
    );
    return json(500, { error: "record_failed" });
  }

  if (upserted) {
    // Fresh insert — the row we just wrote.
    if (upserted.user_id !== userId) {
      // Should be unreachable (we just inserted it under `userId`), but
      // don't trust a locally-computed value over what's actually stored.
      console.error("verify_bazaar_purchase_user_mismatch", userId, productId, purchaseToken);
      return json(409, { error: "purchase_already_claimed" });
    }
    return json(200, { ok: true, expiresAt: upserted.expires_at });
  }

  // Nothing came back: `ignoreDuplicates` skipped the insert because
  // `store_transaction_id` already exists. Find out who it actually belongs
  // to before telling the caller anything succeeded.
  const { data: existing, error: lookupErr } = await admin
    .from("pass_entitlements")
    .select("user_id, pass_type, expires_at")
    .eq("store_transaction_id", purchaseToken)
    .maybeSingle();
  if (lookupErr || !existing) {
    console.error(
      "verify_bazaar_purchase_conflict_lookup_failed",
      userId,
      productId,
      purchaseToken,
      lookupErr?.message,
    );
    return json(500, { error: "record_failed" });
  }
  if (existing.user_id !== userId) {
    console.warn("verify_bazaar_purchase_token_claimed_by_other_user", userId, purchaseToken);
    return json(409, { error: "purchase_already_claimed" });
  }
  return json(200, { ok: true, expiresAt: existing.expires_at });
});
