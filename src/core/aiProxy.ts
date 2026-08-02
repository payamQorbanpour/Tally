import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";
import { guardNetworkCall } from "./networkGuard";

/**
 * Thrown when the proxy refuses a call because the user is out of credits.
 * Callers catch this specifically to open the credits panel rather than
 * showing a generic error.
 */
export class AiProxyInsufficientCreditsError extends Error {
  constructor() {
    super("AI_PROXY_INSUFFICIENT_CREDITS");
    this.name = "AiProxyInsufficientCreditsError";
  }
}

/**
 * Thrown for any non-2xx proxy response that isn't the insufficient-credits
 * case above. Carries the HTTP status and the server's parsed `error` code
 * (or "" when the body isn't JSON) so callers can render a specific message
 * (rate limited, server error) instead of one opaque string.
 */
export class AiProxyHttpError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, detail: string) {
    super(`AI proxy HTTP ${status}${code ? ` (${code})` : ""}: ${detail}`);
    this.name = "AiProxyHttpError";
    this.status = status;
    this.code = code;
  }
}

/** Parse a failed proxy response into a typed error. Never throws. */
export function classifyProxyFailure(status: number, body: string): AiProxyHttpError {
  let code = "";
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string") code = parsed.error;
  } catch {
    // Non-JSON body (gateway HTML, empty). Status alone has to carry it.
  }
  return new AiProxyHttpError(status, code, body.slice(0, 400));
}

/**
 * Notified with the caller's remaining balance after every billed call.
 * `AiCreditsContext` registers here so the balance stays in sync with the
 * server without every call site having to thread it back.
 */
let creditsListener: ((remaining: number) => void) | null = null;

export function setAiCreditsListener(fn: ((remaining: number) => void) | null): void {
  creditsListener = fn;
}

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
    const err = classifyProxyFailure(res.status, body);
    if (err.status === 402 && err.code === "insufficient_credits") {
      throw new AiProxyInsufficientCreditsError();
    }
    throw err;
  }

  // Billed calls report the remaining balance in a header — the body is the
  // upstream provider's JSON, passed through verbatim, so there is nowhere in
  // it to put this.
  const remaining = res.headers.get("X-Tally-Credits-Remaining");
  if (remaining !== null && creditsListener) {
    const n = Number.parseInt(remaining, 10);
    if (Number.isFinite(n)) creditsListener(n);
  }

  return res;
}

/** True when the proxy can be reached (sync configured). Sign-in is checked at call time. */
export function isAiProxyAvailable(): boolean {
  return Boolean(getSyncUrl());
}
