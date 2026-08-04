// Returns the caller's resolved, client-visible AI config.
//
// The client never sees the rule set — only the values that apply to it.
// Prompts, model ids, and rate limits are `client_visible = false` and are
// filtered out by `resolveClientConfig`, so they cannot leak here even if a
// client asks for them.
//
// Requires a JWT (verify_jwt = true in config.toml). A signed-out user
// therefore has no server config and keeps the app's bundled defaults; AI is
// gated behind sign-in anyway, and `ai-proxy` rejects anonymous calls.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the platform.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  resolveClientConfig,
  type CallerCohorts,
  type ConfigRow,
} from "../_shared/aiConfigResolve.ts";

const TTL_SECONDS = 900; // 15 minutes; the client refreshes on foreground past this.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(401, { error: "unauthorized" });
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey);

  // Premium is the same notion ai-proxy uses: `profiles.is_premium` OR an
  // active server-verified pass. Reusing the RPC keeps the two in step.
  const [entitlement, profile, allowlist, rows] = await Promise.all([
    admin.rpc("tally_has_active_entitlement", { p_user_id: userId }),
    admin.from("profiles").select("is_alpha").eq("id", userId).maybeSingle(),
    admin.from("ai_config_allowlist").select("key").eq("user_id", userId),
    admin.from("ai_config").select("key, cohort, value, client_visible"),
  ]);

  if (rows.error) {
    // Fail open: return an empty config and let the client keep its bundled
    // defaults. `ai-proxy` still enforces, so this cannot become a bypass.
    console.warn("ai_config_read_failed", rows.error.message);
    return jsonResponse(200, { flags: {}, limits: {}, ttlSeconds: 60 });
  }

  const caller: CallerCohorts = {
    premium: entitlement.data === true,
    alpha: profile.data?.is_alpha === true,
    allowlistKeys: new Set((allowlist.data ?? []).map((r: { key: string }) => r.key)),
  };

  const resolved = resolveClientConfig((rows.data ?? []) as ConfigRow[], caller);

  // Split by value type so the client has two typed maps rather than one
  // untyped bag. Booleans are flags; numbers are limits.
  const flags: Record<string, boolean> = {};
  const limits: Record<string, number> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "boolean") flags[key] = value;
    else if (typeof value === "number") limits[key] = value;
    // Anything else is a config mistake for a client-visible key; drop it
    // rather than shipping a shape the client cannot parse.
  }

  return jsonResponse(200, { flags, limits, ttlSeconds: TTL_SECONDS });
});
