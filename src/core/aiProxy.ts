import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";
import { guardNetworkCall } from "./networkGuard";

/**
 * Routes every AI call through a Supabase Edge Function so the upstream
 * provider keys (Groq / OpenAI / ElevenLabs) live as Supabase project
 * secrets server-side instead of being baked into the shipped JS bundle.
 *
 * Auth: the active Supabase session JWT is forwarded; the Edge Function
 * verifies it before forwarding to the upstream model. Anonymous callers
 * are rejected — AI features are gated behind sign-in by design.
 *
 * Returns the raw `Response` so callers can keep their existing parsers
 * (some return text, some JSON; the proxy mirrors the upstream shape).
 */
export async function callAiProxy(
  action:
    | "parse-receipt"
    | "parse-description"
    | "classify-category"
    | "transcribe",
  payload: Record<string, unknown>,
): Promise<Response> {
  const urlBase = getSyncUrl();
  if (!urlBase) throw new Error("AI_PROXY_NOT_CONFIGURED");

  const supabase = createTallySupabaseClient();
  if (!supabase) throw new Error("AI_PROXY_NOT_CONFIGURED");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("AI_PROXY_NOT_SIGNED_IN");

  const url = `${urlBase.replace(/\/$/, "")}/functions/v1/ai-proxy`;
  const res = await guardNetworkCall(() =>
    fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, ...payload }),
    }),
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI proxy HTTP ${res.status}: ${body.slice(0, 400)}`);
  }
  return res;
}

/** True when the proxy can be reached (sync configured). Sign-in is checked at call time. */
export function isAiProxyAvailable(): boolean {
  return Boolean(getSyncUrl());
}
