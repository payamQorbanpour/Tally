// delete-account: removes the caller's row from `auth.users`. The client
// has already wiped its own data (groups / expenses / settlements / users /
// profiles / avatar) via `deleteRemoteAccountData`; this function is the
// last step that the anon-key client cannot do on its own — only the
// service role may delete an auth user.
//
// App Store / Play Store both require true account deletion (not just
// "sign out + opaque flag"), so this function MUST be deployed before the
// in-app "Delete account" button is shown to real users.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the Supabase Edge runtime — no extra secrets needed.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: CORS_HEADERS,
    });
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return jsonResponse(401, { error: "unauthorized" });
  }

  const url = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const anon = (Deno.env.get("SUPABASE_ANON_KEY") ?? "").trim();
  const serviceKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
  if (!url || !anon || !serviceKey) {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  // Resolve the caller via the anon-key + their JWT. We never trust a
  // user_id passed in the body — that would let any signed-in user nuke
  // anyone else's account.
  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) {
    return jsonResponse(401, { error: "unauthorized" });
  }
  const userId = data.user.id;

  // Best-effort safety net: also wipe the profiles row so even if the
  // auth.users delete fails for some reason, we don't leak the row.
  // (`profiles.id` references `auth.users(id) on delete cascade` so this
  // is also covered when the auth delete succeeds — both is fine.)
  const admin = createClient(url, serviceKey);
  await admin.from("profiles").delete().eq("id", userId);

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  if (delErr) {
    return jsonResponse(500, { error: "auth_delete_failed", detail: delErr.message });
  }

  return jsonResponse(200, { ok: true });
});
