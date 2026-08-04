// Returns the caller's resolved config.
//
// JWT is OPTIONAL (verify_jwt = false in config.toml; auth is checked by hand
// below). Anonymous callers get `public` keys only, from a payload identical
// for every install and therefore CDN-cacheable. Authenticated callers
// additionally get `client` keys, resolved against their cohort.
//
// The request takes NO parameters, deliberately. Sending platform or app
// version would multiply cache keys, and client-asserted attributes are
// spoofable — a server that branches on a claimed version can be told any
// version. Instead the server ships the data (`min_supported_version`,
// `locale_region_map`) and the client performs the comparison it is already
// qualified to make.
//
// `server`-visibility keys — prompts, model ids, rate limits — cannot reach
// here at all: `resolveForAudience` filters them out before serialization.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the platform.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  ANON_CALLER,
  resolveForAudience,
  type CallerCohorts,
  type ConfigRow,
} from "../_shared/appConfigResolve.ts";
import { cacheHeaders, TTL_SECONDS } from "../_shared/appConfigResponse.ts";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  extra: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS, ...extra },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

const CONFIG_SELECT = "key, cohort, value, visibility";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  // Break-glass, checked before any DB read and before the anonymous /
  // authenticated split, so it holds for every caller — same placement and
  // same trigger as ai-proxy's and get-ai-config's kill switch. An env-var
  // flip must work when the database is the thing that is broken.
  //
  // A 200 (not a 503) because this is a definite, authoritative "off", not a
  // failure to determine state: the client should treat it exactly like a
  // healthy response and stop offering AI. `ttlSeconds` is short so clients
  // come back quickly once the incident is over.
  //
  // Deliberately NOT `cacheHeaders("public")`, unlike the normal anonymous
  // response below: a CDN-cached "kill switch on" payload would outlive the
  // incident and keep AI dark for up to its max-age after the switch is
  // flipped back. `no-store` keeps the recovery as fast as the trip.
  if (env("AI_KILL_SWITCH") === "1") {
    return jsonResponse(
      200,
      { config: { ai_enabled: false }, ttlSeconds: 60 },
      { "Cache-Control": "no-store" },
    );
  }

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  const admin = createClient(url, serviceKey);
  const auth = req.headers.get("Authorization");

  // ── Anonymous ─────────────────────────────────────────────────────────
  if (!auth?.startsWith("Bearer ")) {
    const rows = await admin.from("app_config").select(CONFIG_SELECT);
    if (rows.error) {
      // 503, never a 200. A 200 saying "no restrictions apply" is
      // indistinguishable from a healthy response, so it would be CDN-cached
      // and would permanently clobber a correctly-cached `false`. The client
      // must be able to tell "nothing restricts you" from "I could not find
      // out".
      console.warn("app_config_read_failed", rows.error.message);
      return jsonResponse(503, { error: "config_unavailable" });
    }
    const config = resolveForAudience((rows.data ?? []) as ConfigRow[], ANON_CALLER, "public");
    return jsonResponse(200, { config, ttlSeconds: TTL_SECONDS.public }, cacheHeaders("public"));
  }

  // ── Authenticated ─────────────────────────────────────────────────────
  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(401, { error: "unauthorized" });
  const userId = userData.user.id;

  const [entitlement, profile, allowlist, rows] = await Promise.all([
    admin.rpc("tally_has_active_entitlement", { p_user_id: userId }),
    admin.from("profiles").select("is_alpha").eq("id", userId).maybeSingle(),
    admin.from("app_config_allowlist").select("key").eq("user_id", userId),
    admin.from("app_config").select(CONFIG_SELECT),
  ]);

  if (rows.error) {
    console.warn("app_config_read_failed", rows.error.message);
    return jsonResponse(503, { error: "config_unavailable" });
  }

  if (entitlement.error) console.warn("entitlement_check_failed", entitlement.error.message);
  if (profile.error) console.warn("app_config_alpha_read_failed", profile.error.message);
  if (allowlist.error) console.warn("app_config_allowlist_read_failed", allowlist.error.message);

  // Entitlement and alpha status pick the caller's cohort. An error reading
  // either means we cannot tell which cohort this caller is in, so resolving
  // anyway would silently fall through to `everyone` — exactly the
  // client/server disagreement the shared resolver exists to prevent. Fail
  // closed rather than serve a wrong-cohort answer.
  //
  // The allowlist is different: it is purely additive, so failing to read it
  // only means "not specially targeted". Warn and continue.
  if (entitlement.error || profile.error) {
    return jsonResponse(503, { error: "config_unavailable" });
  }

  const caller: CallerCohorts = {
    premium: entitlement.data === true,
    alpha: profile.data?.is_alpha === true,
    allowlistKeys: new Set((allowlist.data ?? []).map((r: { key: string }) => r.key)),
  };

  const config = resolveForAudience((rows.data ?? []) as ConfigRow[], caller, "client");
  return jsonResponse(200, { config, ttlSeconds: TTL_SECONDS.client }, cacheHeaders("client"));
});
