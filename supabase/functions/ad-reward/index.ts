// Grants AI credits for completed rewarded ads.
//
// Routes:
//   POST /ad-reward/nonce       authed — issue a single-use challenge (Tapsell/Adivery)
//   POST /ad-reward/claim       authed — redeem a challenge for credits (Tapsell/Adivery)
//   GET  /ad-reward/admob-ssv   unauthed — AdMob's signed callback
//
// Deployed with `verify_jwt = false` (see config.toml) because AdMob presents
// no JWT. The two POST routes therefore verify the Bearer token themselves;
// the SSV route's only credential is its ECDSA signature.
//
// /nonce and /claim are live for the client-attested networks only (Tapsell,
// Adivery — see CLIENT_ATTESTED_PROVIDERS). A nonce is issued to the caller
// and redeemed by that same caller — that only proves "the same client made
// two requests," not "an ad played." Unlike AdMob's SSV, where Google's ECDSA
// signature is independent proof, this loop has no third party confirming
// anything, so the claim is accepted at face value and granted through
// `ai_credit_grant_capped` rather than the plain `ai_credit_grant` AdMob
// uses: a per-user, per-UTC-day ceiling (AD_REWARD_DAILY_CAP) bounds what a
// forged claim is worth, so spamming claims all day earns no more than
// watching honestly would. AdMob must never be accepted on this path.
//
// Project secrets:
//   AD_REWARD_CREDITS     1   credits granted per completed ad
//   AD_REWARDS_ENABLED    0   kill-switch; "1" to enable grants
//   AD_REWARD_DAILY_CAP   3   max ad_reward credits/user/UTC day (client-attested
//                             providers). One ad is worth one credit, so this is
//                             equivalently a ceiling of 3 rewarded ads per day.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import { verifyAdMobSignature } from "./admobSsv.ts";

type Json = Record<string, unknown>;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

const NONCE_TTL_MS = 5 * 60 * 1000;
// `https://gstatic.com/...` 301-redirects to `www.gstatic.com`; Deno's fetch
// follows it, but pointing at the final host directly skips that round-trip.
const ADMOB_KEYS_URL = "https://www.gstatic.com/admob/reward/verifier-keys.json";
// Postgres's own uuid input format (hex-8-4-4-4-12). AdMob's `user_id` param
// is whatever our client put in `ServerSideVerificationOptions.userId`
// before requesting the ad — a repackaged/hooked client can set that to
// garbage and still get a validly-signed callback back, since the signature
// only vouches for "AdMob sent this," not "user_id is a real user." Reject
// obviously-malformed values before they ever reach the grant RPC.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The networks with no server-side verification, and therefore the only ones
 * allowed on /nonce and /claim. AdMob must never appear here: it has SSV, and
 * accepting a self-issued nonce for it would let a caller bypass Google's
 * signature entirely.
 *
 * Mirrors `NONCE_PROVIDER_IDS` in src/ads/rewardedAdProvider.ts — keep the two
 * in step when adding a network.
 */
const CLIENT_ATTESTED_PROVIDERS = new Set(["tapsell", "adivery"]);

function isClientAttestedProvider(provider: string): boolean {
  return CLIENT_ATTESTED_PROVIDERS.has(provider);
}

function jsonResponse(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

function envInt(name: string, fallback: number): number {
  const raw = env(name);
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function rewardsEnabled(): boolean {
  const v = env("AD_REWARDS_ENABLED").toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

function adminClient(): SupabaseClient | null {
  const url = env("SUPABASE_URL");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey);
}

/** Verify the caller's Bearer token; returns the user id or a Response. */
async function requireUser(req: Request): Promise<string | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  if (!url || !anon) return jsonResponse(500, { error: "server_misconfigured" });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return jsonResponse(401, { error: "unauthorized" });
  return data.user.id;
}

// ────────────────────────── AdMob verifier keys ──────────────────────────
//
// Google rotates these. Cached in module scope so a warm instance does not
// refetch per callback, and refetched on a key_id miss so rotation heals
// itself without a redeploy.

type VerifierKey = { keyId: number; pem: string };
let keyCache: Map<string, string> | null = null;
let keyCacheFetchedAt = 0;
// This endpoint is unauthenticated by design (see module comment), which
// means anyone who knows the URL can force a cache miss on demand just by
// sending a bogus `key_id` — with no throttle, every such request costs an
// outbound fetch to Google's key server. Once we have a cache at all, cap
// refetches to once per this interval; a miss inside the cooldown is just
// reported as unknown rather than triggering another fetch. The very first
// fetch (keyCache still null) is never throttled, so a cold instance still
// serves a legitimate first-ever callback normally.
const KEY_REFETCH_MIN_INTERVAL_MS = 60 * 1000;

async function fetchVerifierKeys(): Promise<Map<string, string>> {
  const res = await fetch(ADMOB_KEYS_URL);
  if (!res.ok) throw new Error(`verifier_keys_http_${res.status}`);
  const body = (await res.json()) as { keys?: VerifierKey[] };
  const map = new Map<string, string>();
  for (const k of body.keys ?? []) map.set(String(k.keyId), k.pem);
  return map;
}

async function publicKeyFor(keyId: string): Promise<string | null> {
  if (keyCache?.has(keyId)) return keyCache.get(keyId)!;

  const now = Date.now();
  if (keyCache !== null && now - keyCacheFetchedAt < KEY_REFETCH_MIN_INTERVAL_MS) {
    // Already fetched once and still inside the cooldown — a miss here is
    // reported as unknown rather than spending another fetch on it.
    return null;
  }

  keyCache = await fetchVerifierKeys();
  keyCacheFetchedAt = now;
  return keyCache.get(keyId) ?? null;
}

// ────────────────────────── Routes ──────────────────────────

async function handleNonce(req: Request): Promise<Response> {
  // Mirrors `handleClaim`'s first check. Without this, the (default, off)
  // kill-switch lets a Tapsell user mint a nonce and watch a complete real
  // ad, only to have `handleClaim` reject it afterwards — exactly the
  // "watched a real ad for nothing" outcome this file's own header comment
  // calls out as unacceptable for the AdMob path.
  if (!rewardsEnabled()) return jsonResponse(503, { error: "rewards_disabled" });

  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  // Only providers that genuinely lack server-side verification use this
  // path. AdMob must never appear here: it has SSV, and accepting a
  // self-issued nonce for it would let a caller bypass that signature.
  const provider = typeof body.provider === "string" ? body.provider : "";
  if (!isClientAttestedProvider(provider)) {
    return jsonResponse(400, { error: "provider_unsupported" });
  }

  const admin = adminClient();
  if (!admin) return jsonResponse(500, { error: "server_misconfigured" });

  const nonce = crypto.randomUUID();
  const { error } = await admin.from("ad_reward_nonces").insert({
    nonce,
    user_id: user,
    provider,
    expires_at: new Date(Date.now() + NONCE_TTL_MS).toISOString(),
  });
  if (error) return jsonResponse(500, { error: "nonce_failed" });

  return jsonResponse(200, { nonce });
}

async function handleClaim(req: Request): Promise<Response> {
  if (!rewardsEnabled()) return jsonResponse(503, { error: "rewards_disabled" });

  const user = await requireUser(req);
  if (user instanceof Response) return user;

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }
  const nonce = typeof body.nonce === "string" ? body.nonce : "";
  if (!nonce) return jsonResponse(400, { error: "nonce_required" });

  const admin = adminClient();
  if (!admin) return jsonResponse(500, { error: "server_misconfigured" });

  // Consume the nonce with a conditional update, so two concurrent claims of
  // the same nonce cannot both find it unconsumed.
  const { data: consumed, error: consumeError } = await admin
    .from("ad_reward_nonces")
    .update({ consumed_at: new Date().toISOString() })
    .eq("nonce", nonce)
    .eq("user_id", user)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("nonce, provider")
    .maybeSingle();

  if (consumeError) return jsonResponse(500, { error: "claim_failed" });
  if (!consumed) return jsonResponse(400, { error: "nonce_invalid" });
  // Belt-and-suspenders, matching handleAdMobSsv's independent UUID recheck
  // below: handleNonce is the only writer today and already restricts
  // `provider` to the client-attested set, but nothing at the database level
  // enforces that — there's no CHECK constraint on ad_reward_nonces.provider.
  // Don't let a future write path silently ride this claim route's
  // capped-grant treatment.
  if (!isClientAttestedProvider((consumed as { provider: string }).provider)) {
    return jsonResponse(400, { error: "provider_unsupported" });
  }

  // Client-attested: nothing here proves an ad was watched, only that this
  // user asked for a nonce and returned it within the TTL. The daily cap is
  // what bounds that — see 20260802000001_ad_reward_daily_cap.sql.
  const { data, error } = await admin.rpc("ai_credit_grant_capped", {
    p_user_id: user,
    p_delta: envInt("AD_REWARD_CREDITS", 1),
    p_provider: (consumed as { provider: string }).provider,
    p_external_id: nonce,
    p_daily_cap: envInt("AD_REWARD_DAILY_CAP", 3),
  });
  if (error) return jsonResponse(500, { error: "grant_failed" });

  const balance = typeof data === "number" ? data : Number(data ?? 0);
  if (balance < 0) return jsonResponse(429, { error: "daily_cap_reached" });

  return jsonResponse(200, { balance });
}

async function handleAdMobSsv(req: Request): Promise<Response> {
  // AdMob retries non-2xx responses. Return 200 for anything we have decided
  // about — including a rejected signature — and reserve non-2xx for our own
  // transient failures, so Google retries only what a retry could fix.
  if (!rewardsEnabled()) return new Response("disabled", { status: 200 });

  const url = new URL(req.url);
  const params = url.searchParams;
  const signature = params.get("signature") ?? "";
  const keyId = params.get("key_id") ?? "";
  const userId = params.get("user_id") ?? "";
  const transactionId = params.get("transaction_id") ?? "";

  if (!signature || !keyId || !userId || !transactionId) {
    console.warn("ssv_missing_params");
    return new Response("bad request", { status: 200 });
  }

  let pem: string | null;
  try {
    pem = await publicKeyFor(keyId);
  } catch (e) {
    // Google's key server is unreachable — this one IS worth retrying.
    console.error("ssv_keys_unavailable", e instanceof Error ? e.message : String(e));
    return new Response("key server unavailable", { status: 503 });
  }
  if (!pem) {
    console.warn("ssv_unknown_key_id", keyId);
    return new Response("unknown key", { status: 200 });
  }

  const ok = await verifyAdMobSignature({
    rawQuery: url.search,
    signatureB64Url: signature,
    publicKeyPem: pem,
  });
  if (!ok) {
    // The only authentication this route has. Never fail open.
    console.warn("ssv_bad_signature", transactionId);
    return new Response("invalid signature", { status: 200 });
  }

  // `user_id` is client-supplied (set before the ad was even requested), so
  // a validly-signed callback can still carry a `user_id` that was never a
  // real user — the signature vouches for "AdMob sent this," not for the
  // parameter's content. A malformed value would otherwise fail the RPC's
  // `uuid` cast and get retried by AdMob forever for a request that can
  // never succeed; reject the obvious case up front instead.
  if (!UUID_RE.test(userId)) {
    console.warn("ssv_invalid_user_id", transactionId);
    return new Response("invalid user_id", { status: 200 });
  }

  const admin = adminClient();
  if (!admin) return new Response("misconfigured", { status: 503 });

  // `transaction_id` as the idempotency key: AdMob may deliver the same
  // callback more than once, and the ledger's unique index makes the repeat
  // a no-op.
  const { error } = await admin.rpc("ai_credit_grant", {
    p_user_id: userId,
    p_delta: envInt("AD_REWARD_CREDITS", 1),
    p_reason: "ad_reward",
    p_provider: "admob",
    p_external_id: transactionId,
  });
  if (error) {
    // 22P02 = invalid uuid syntax (belt-and-suspenders past the regex
    // above), 23503 = well-formed uuid but no matching auth.users row (the
    // regex can't catch this one). Both mean "this user_id will never
    // work," not "try again later" — AdMob would otherwise retry a
    // callback that fails identically forever.
    if (error.code === "22P02" || error.code === "23503") {
      console.warn("ssv_invalid_user_id", transactionId, error.code);
      return new Response("invalid user_id", { status: 200 });
    }
    console.error("ssv_grant_failed", transactionId, error.message);
    return new Response("grant failed", { status: 503 });
  }

  return new Response("ok", { status: 200 });
}

// ────────────────────────── Entry point ──────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const path = new URL(req.url).pathname.replace(/\/+$/, "");

  if (req.method === "GET" && path.endsWith("/admob-ssv")) {
    return await handleAdMobSsv(req);
  }
  if (req.method === "POST" && path.endsWith("/nonce")) {
    return await handleNonce(req);
  }
  if (req.method === "POST" && path.endsWith("/claim")) {
    return await handleClaim(req);
  }

  return jsonResponse(404, { error: "not_found" });
});
