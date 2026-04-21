import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import * as jose from "npm:jose@5.2.3";

function decodeSignedTransactionPayload(jws: string): Record<string, unknown> {
  const parts = jws.split(".");
  if (parts.length < 2) throw new Error("invalid_jws");
  const b64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const json = atob(b64 + pad);
  return JSON.parse(json) as Record<string, unknown>;
}

async function fetchAppleTransaction(transactionId: string): Promise<{ signedTransactionInfo: string }> {
  const keyPem = Deno.env.get("APP_STORE_CONNECT_P8")?.replace(/\\n/g, "\n");
  const kid = Deno.env.get("APP_STORE_KEY_ID");
  const iss = Deno.env.get("APP_STORE_ISSUER_ID");
  if (!keyPem || !kid || !iss) {
    throw new Error("missing_app_store_connect_env");
  }
  const key = await jose.importPKCS8(keyPem, "ES256");
  const token = await new jose.SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid, typ: "JWT" })
    .setIssuer(iss)
    .setAudience("appstoreconnect-v1")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);

  const hosts = [
    "https://api.storekit.itunes.apple.com",
    "https://api.storekit-sandbox.itunes.apple.com",
  ];
  let last: Response | null = null;
  for (const host of hosts) {
    const url = `${host}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    last = res;
    if (res.status === 200) {
      return (await res.json()) as { signedTransactionInfo: string };
    }
  }
  const body = last ? await last.text() : "";
  throw new Error(`apple_transaction_lookup_failed:${last?.status ?? "?"}:${body.slice(0, 200)}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const transactionId =
    typeof body === "object" && body !== null && "transactionId" in body
      ? (body as { transactionId?: unknown }).transactionId
      : undefined;
  if (typeof transactionId !== "string" || !transactionId.trim()) {
    return new Response(JSON.stringify({ error: "transactionId_required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "server_misconfigured" }), { status: 500 });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const bundleId = Deno.env.get("APPLE_BUNDLE_ID")?.trim();
  const productCsv = Deno.env.get("APPLE_PREMIUM_PRODUCT_IDS")?.trim() ?? "";
  const productIds = productCsv.split(",").map((s) => s.trim()).filter(Boolean);

  if (!bundleId || productIds.length === 0) {
    return new Response(JSON.stringify({ error: "function_env_incomplete" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  let appleBody: { signedTransactionInfo: string };
  try {
    appleBody = await fetchAppleTransaction(transactionId.trim());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const payload = decodeSignedTransactionPayload(appleBody.signedTransactionInfo);
  if (String(payload.bundleId ?? "") !== bundleId) {
    return new Response(JSON.stringify({ error: "bundle_mismatch" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const productId = String(payload.productId ?? "");
  if (!productIds.includes(productId)) {
    return new Response(JSON.stringify({ error: "product_mismatch" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = Date.now();
  const expiresRaw = payload.expiresDate;
  const expires =
    typeof expiresRaw === "number"
      ? expiresRaw
      : typeof expiresRaw === "string"
        ? Number(expiresRaw) || 0
        : 0;
  const revRaw = payload.revocationDate;
  const rev =
    typeof revRaw === "number" ? revRaw : typeof revRaw === "string" ? Number(revRaw) || 0 : 0;
  const revoked = rev > 0 && rev <= now;
  const isPremium = !revoked && expires > now;

  const admin = createClient(supabaseUrl, serviceKey);
  const { error: upErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      is_premium: isPremium,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );
  if (upErr) {
    return new Response(JSON.stringify({ error: upErr.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, is_premium: isPremium }), {
    headers: { "Content-Type": "application/json" },
  });
});
