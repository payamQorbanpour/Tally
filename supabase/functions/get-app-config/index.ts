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

// The database itself is broken, so there is no resolved bag for this
// caller to override `ai_enabled` on top of — the bare fallback is all the
// kill switch can offer. This is the "must work when the database is the
// broken thing" guarantee the break-glass exists for, so it stays
// unconditional on DB health.
//
// 200 (not 503) because this is a definite, authoritative "off", not a
// failure to determine state: the client should treat it exactly like a
// healthy response and stop offering AI. `ttlSeconds` is short so clients
// come back quickly once the incident is over. `no-store` (never
// `cacheHeaders(...)`) because a CDN-cached "kill switch on" payload would
// outlive the incident and keep AI dark for up to its max-age after the
// switch is flipped back.
function killSwitchFallback(): Response {
  return jsonResponse(
    200,
    { config: { ai_enabled: false }, ttlSeconds: 60 },
    { "Cache-Control": "no-store" },
  );
}

// The DB read succeeded, so override `ai_enabled` on the caller's REAL
// resolved config instead of replacing the whole bag — see the top-level
// `killSwitch` comment for why that distinction matters. Same 200 /
// short-`ttlSeconds` / `no-store` reasoning as `killSwitchFallback` above.
function killSwitchOverride(config: Record<string, unknown>): Response {
  return jsonResponse(
    200,
    { config: { ...config, ai_enabled: false }, ttlSeconds: 60 },
    { "Cache-Control": "no-store" },
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  // Break-glass, read once up front — same trigger as ai-proxy's and
  // get-ai-config's kill switch — but NOT unconditionally returned from
  // here. It used to short-circuit at this point and return a hardcoded
  // `{ai_enabled: false}` bag for every caller; that replaced the client's
  // ENTIRE remote config, not just the AI flag, so an operator's
  // `sync_enabled: false` (or an active force-update / maintenance banner /
  // plan-price override) would silently revert the instant someone else
  // flipped the AI kill switch. Two incident controls must not be able to
  // undo each other. Overriding just `ai_enabled` on the normally-resolved
  // bag (below, per audience, once a branch's config resolution succeeds)
  // fixes that. The bare fallback (`killSwitchFallback`) is reserved for
  // cases where there is no resolved bag to override — either the
  // env-var check just below fails, or a branch's own DB read fails later —
  // because the break-glass must still work when the infrastructure it
  // would normally read through is what's broken.
  const killSwitch = env("AI_KILL_SWITCH") === "1";

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) {
    // The bare fallback needs none of these — it never talks to the
    // database. So a misconfigured deploy is just another "the
    // infrastructure this endpoint depends on is broken" case, and the
    // break-glass must survive it exactly like it survives a DB outage.
    if (killSwitch) return killSwitchFallback();
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  const admin = createClient(url, serviceKey);
  const auth = req.headers.get("Authorization");

  // ── Anonymous ─────────────────────────────────────────────────────────
  if (!auth?.startsWith("Bearer ")) {
    const rows = await admin.from("app_config").select(CONFIG_SELECT);
    if (rows.error) {
      // 503, never a plain 200. A 200 saying "no restrictions apply" is
      // indistinguishable from a healthy response, so it would be CDN-cached
      // and would permanently clobber a correctly-cached `false`. The client
      // must be able to tell "nothing restricts you" from "I could not find
      // out". The one exception is the kill switch's own break-glass
      // fallback below, which is a deliberate, authoritative "off", not an
      // ambiguous "unknown".
      console.warn("app_config_read_failed", rows.error.message);
      if (killSwitch) return killSwitchFallback();
      return jsonResponse(503, { error: "config_unavailable" });
    }
    const config = resolveForAudience((rows.data ?? []) as ConfigRow[], ANON_CALLER, "public");
    if (killSwitch) return killSwitchOverride(config);
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
    if (killSwitch) return killSwitchFallback();
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
  if (killSwitch) return killSwitchOverride(config);
  return jsonResponse(200, { config, ttlSeconds: TTL_SECONDS.client }, cacheHeaders("client"));
});
