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
//   BAZAAR_EXTEND_PRODUCT_MAP  same format, for the `.extend` SKUs, e.g.
//     com.payamqorbanpour.tally.pass.night.extend:night,com.payamqorbanpour.tally.pass.trip.extend:trip,com.payamqorbanpour.tally.pass.explorer.extend:explorer
//
// The two maps are deliberately SEPARATE env vars rather than a third
// `kind` field on one map. A SKU listed in the extend map can never be read
// as a buy, so a typo degrades to `unknown_product` (400) instead of
// granting a full-duration pass for the cheaper extend price. An empty
// extend map disables extensions without affecting buys.

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

// How much time one paid extension adds. Mirrors `PASS_EXTEND_MS` in
// `src/premium/passes.ts`. Kept as its own table rather than reusing
// `PASS_DURATION_MS` — they are equal today, but an extension is a distinct
// price point and the two are free to diverge without silently changing what
// a buy grants.
const PASS_EXTEND_MS: Record<string, number> = {
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
// Never log a purchase token in full: on any path where the row wasn't
// written under the caller (a DB error, or a conflict already claimed by
// someone else), the token is still a live, replayable credential. Anyone
// with log-read access could otherwise copy it and claim/attempt to claim
// the pass themselves. Keep just enough to correlate with a support ticket.
const maskToken = (t: string) =>
  t.length > 12 ? `${t.slice(0, 8)}…${t.slice(-4)}` : `<${t.length} chars>`;

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
// `.extend` SKUs live in their own map (`BAZAAR_EXTEND_PRODUCT_MAP`) for the
// reason given in the module header: a SKU can be a buy or an extension, and
// never silently both.
type ProductKind = "buy" | "extend";

function parseProductMap(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of raw.split(",")) {
    const [sku, passType] = pair.split(":").map((s) => s.trim());
    if (sku && passType && PASS_DURATION_MS[passType]) map.set(sku, passType);
  }
  return map;
}

type ProductMaps = {
  buy: Map<string, string>;
  extend: Map<string, string>;
  /** SKUs present in BOTH maps — always a deploy-time mistake. */
  conflicts: string[];
};

let cachedProductMaps: ProductMaps | null = null;

function productMaps(): ProductMaps {
  if (cachedProductMaps) return cachedProductMaps;
  const buy = parseProductMap(env("BAZAAR_PASS_PRODUCT_MAP"));
  const extend = parseProductMap(env("BAZAAR_EXTEND_PRODUCT_MAP"));
  const conflicts = [...buy.keys()].filter((sku) => extend.has(sku));
  cachedProductMaps = { buy, extend, conflicts };
  return cachedProductMaps;
}

/**
 * Server-side SKU → (passType, kind) lookup. The client-supplied `passType`
 * can't be trusted to state this honestly (a cheap `.extend` SKU could be
 * paired with an expensive `passType`, or an extend SKU claimed as a buy to
 * get full duration at half price), so both the duration table and the
 * buy/extend decision are derived here and nowhere else.
 */
function resolveProduct(productId: string): { passType: string; kind: ProductKind } | null {
  const maps = productMaps();
  const buyType = maps.buy.get(productId);
  if (buyType) return { passType: buyType, kind: "buy" };
  const extendType = maps.extend.get(productId);
  if (extendType) return { passType: extendType, kind: "extend" };
  return null;
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
  // `productMap()` is cached for the isolate's lifetime — if
  // `BAZAAR_PASS_PRODUCT_MAP` is unset/mistyped at deploy time it silently
  // caches an EMPTY map, and every legitimate paid purchase would otherwise
  // fall through to `unknown_product` (400), wrongly blaming the client for
  // a server deploy-ordering mistake. Fail loudly instead.
  if (productMaps().buy.size === 0) {
    console.error("verify_bazaar_purchase_empty_product_map");
    return json(500, { error: "server_misconfigured" });
  }
  // A SKU in both maps is ambiguous: whichever map wins decides whether the
  // user gets a full pass or an extension, for the same money. Refuse to
  // guess. (An empty extend map is fine — extensions are simply off.)
  if (productMaps().conflicts.length > 0) {
    console.error(
      "verify_bazaar_purchase_sku_in_both_maps",
      productMaps().conflicts.join(","),
    );
    return json(500, { error: "server_misconfigured" });
  }

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

  // Server-side SKU → (passType, kind) lookup. Must happen before the Bazaar
  // call so an unrecognised SKU never even attempts validation.
  const product = resolveProduct(productId);
  if (!product) {
    // The empty-buy-map case is already caught above (500, before this
    // point), so reaching here means the maps are populated but this
    // specific SKU is in neither — could be a client sending garbage, or a
    // partial map misconfiguration (a missing SKU, or an `.extend` SKU that
    // was never added to `BAZAAR_EXTEND_PRODUCT_MAP`). Logging both sizes
    // lets that distinction be made from the logs.
    console.warn(
      "verify_bazaar_purchase_unknown_product",
      productId,
      `buy_map_size=${productMaps().buy.size}`,
      `extend_map_size=${productMaps().extend.size}`,
    );
    return json(400, { error: "unknown_product" });
  }
  const { passType, kind } = product;

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
    // `not_found` is the ONLY reason that proves the purchase never happened.
    // Cafe Bazaar's reference is explicit about this:
    //
    //   "You can be sure that requested purchase is not done, only when
    //    `error` is equal to `not_found`."
    //   https://developers.cafebazaar.ir/document/in-app-billing/api/validation/
    //
    // So `malformed` is treated as an outage, not a rejection. A body we
    // can't parse (a proxy error page, a Bazaar-side incident) says nothing
    // about whether the user paid, and answering 402 there is terminal on the
    // client (TERMINAL_STATUSES in verifyBazaarPurchase.ts): it clears the
    // pending record and never retries, permanently costing a paying user
    // their pass. 503 keeps the token replayable.
    if (result.reason !== "not_found") {
      return json(503, { error: "verification_unavailable" });
    }
    return json(402, { error: "purchase_invalid" });
  }
  if (!result.purchase.purchased) return json(402, { error: "purchase_invalid" });

  const admin = createClient(url, serviceKey);

  // Bazaar's `purchaseTime` is milliseconds since epoch — confirmed against
  // their reference, see bazaarApi.ts. The sane-window clamp below is kept as
  // defence in depth: a value in seconds (or a missing field) would otherwise
  // compute an `expires_at` in 1970 — silently expired, 200 ok, no trace.
  // Falling back to "now" costs the user at most the verification delay.
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
  let expiresAt: string;
  if (kind === "buy") {
    expiresAt = new Date(startedMs + PASS_DURATION_MS[passType]!).toISOString();
  } else {
    // An extension stacks onto whatever the user already holds. Mirrors
    // `extendedPass()` in `src/premium/passes.ts`: stack onto the current
    // expiry while the pass is still live, restart from the purchase time
    // once it has lapsed — so extending early is never a penalty.
    //
    // `ended_at` is deliberately NOT filtered here. It is client-writable
    // (see 20260802000000_pass_verification.sql) and only means "the user
    // marked the bound trip complete"; a lapsed or ended pass still proves
    // they own this pass type, which is all eligibility requires.
    const { data: current, error: currentErr } = await admin
      .from("pass_entitlements")
      .select("expires_at")
      .eq("user_id", userId)
      .eq("pass_type", passType)
      .not("verified_at", "is", null)
      // `nullsFirst: false` matters: `expires_at` is nullable (the reserved
      // "ends when the bound trip completes" case), and Postgres sorts NULLs
      // FIRST on a DESC order by default — which would pick an unbounded row
      // over the real furthest expiry and fall through to the NaN guard below.
      .order("expires_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (currentErr) {
      console.error(
        "verify_bazaar_purchase_extend_lookup_failed",
        userId,
        productId,
        maskToken(purchaseToken),
        currentErr.message,
      );
      return json(500, { error: "record_failed" });
    }
    if (!current) {
      // Extensions cost roughly half a full pass but grant the same
      // duration, so honouring one with nothing to extend would let a
      // crafted client buy only `.extend` SKUs and never pay full price.
      // The real UI cannot reach this: the extend CTA only renders when
      // `activePass` exists. Reaching it means a hand-rolled request, so
      // refuse — and log it, because Poolakey has already charged and the
      // refund has to be issued by hand.
      console.warn(
        "verify_bazaar_purchase_no_pass_to_extend",
        userId,
        productId,
        maskToken(purchaseToken),
      );
      return json(409, { error: "no_pass_to_extend" });
    }
    const currentExpiryMs = current.expires_at ? Date.parse(current.expires_at) : NaN;
    const baseMs = Number.isFinite(currentExpiryMs)
      ? Math.max(currentExpiryMs, startedMs)
      : startedMs;
    expiresAt = new Date(baseMs + PASS_EXTEND_MS[passType]!).toISOString();
  }

  // `store_transaction_id` is unique per Bazaar purchase, so re-posting the
  // same token is a no-op rather than a second pass — which is also what
  // stops an extension replay from stacking its duration twice: the insert
  // is skipped and the conflict path below returns the stored `expires_at`,
  // never the freshly recomputed one. (Two *different* extend tokens landing
  // concurrently could still both read the same base expiry and lose one
  // increment; that needs a purchase in flight during another purchase, and
  // is not guarded here.) `.select().maybeSingle()`
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
        kind,
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
      maskToken(purchaseToken),
      insertErr.message,
    );
    return json(500, { error: "record_failed" });
  }

  if (upserted) {
    // Fresh insert — the row we just wrote.
    if (upserted.user_id !== userId) {
      // Should be unreachable (we just inserted it under `userId`), but
      // don't trust a locally-computed value over what's actually stored.
      console.error(
        "verify_bazaar_purchase_user_mismatch",
        userId,
        productId,
        maskToken(purchaseToken),
      );
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
      maskToken(purchaseToken),
      lookupErr?.message,
    );
    return json(500, { error: "record_failed" });
  }
  if (existing.user_id !== userId) {
    console.warn(
      "verify_bazaar_purchase_token_claimed_by_other_user",
      userId,
      maskToken(purchaseToken),
    );
    return json(409, { error: "purchase_already_claimed" });
  }
  return json(200, { ok: true, expiresAt: existing.expires_at });
});
