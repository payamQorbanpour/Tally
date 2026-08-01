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
  const passType = typeof body.passType === "string" ? body.passType : "";
  if (!productId || !purchaseToken || !PASS_DURATION_MS[passType]) {
    return json(400, { error: "invalid_request" });
  }

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
  const startedMs = result.purchase.purchaseTimeMs ?? Date.now();
  const expiresAt = new Date(startedMs + PASS_DURATION_MS[passType]!).toISOString();

  // `store_transaction_id` is unique per Bazaar purchase, so re-posting the
  // same token is a no-op rather than a second pass.
  const { error: insertErr } = await admin.from("pass_entitlements").upsert(
    {
      user_id: userId,
      pass_type: passType,
      kind: "buy",
      product_id: productId,
      store_transaction_id: purchaseToken,
      activated_at: new Date(startedMs).toISOString(),
      expires_at: expiresAt,
      bound_group_id: typeof body.boundGroupId === "string" ? body.boundGroupId : null,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "store_transaction_id", ignoreDuplicates: true },
  );
  if (insertErr) return json(500, { error: "record_failed" });

  return json(200, { ok: true, expiresAt });
});
