// AI proxy: keeps the Groq / OpenAI / ElevenLabs API keys server-side so they
// never enter the shipped JS bundle. The client posts one of four `action`s
// with a JSON body; this function:
//   1. accepts CORS preflight (so a future web build works)
//   2. verifies the caller's Supabase JWT
//   3. bills the call: premium callers are unlimited, everyone else spends one
//      credit from the ledger (refunded if the upstream call fails)
//   4. enforces a per-user-per-minute rate limit (so a tampered client can't
//      run up the model bill)
//   5. forwards the request to the configured upstream provider
//   6. returns the upstream JSON shape (the client already knows how to parse)
//
// Required Supabase project secrets (`supabase secrets set ...`):
//   AI_BASE_URL              base URL of the chat-completions provider (e.g. `https://api.groq.com/openai/v1`)
//   AI_API_KEY               bearer token for that provider (omit for gateway URLs that embed auth in the path)
//   AI_MODEL                 default chat model id
//   AI_RECEIPT_MODEL         vision-capable model id (falls back to AI_MODEL)
//   GEMINI_API_KEY           Google Generative Language key. When set, Gemini is
//                            tried FIRST for any request carrying an image, with
//                            AI_BASE_URL and then OpenAI as automatic fallbacks.
//   GEMINI_MODEL             Gemini model id (default gemini-flash-latest)
//   OPENAI_API_KEY           OpenAI fallback for vision / Whisper / classify
//   OPENAI_RECEIPT_MODEL     OpenAI vision model (default `gpt-4o-mini`)
//   OPENAI_WHISPER_MODEL     OpenAI STT model (default `whisper-1`)
//   STT_API_KEY              ElevenLabs Scribe api key
//   STT_ENDPOINT_URL         STT endpoint (default ElevenLabs Scribe)
//   STT_MODEL                STT model id (default `scribe_v1`)
//   AI_EXPENSE_PROMPT        optional expense-description system-prompt override
//   AI_CATEGORY_PROMPT       optional category-classifier system-prompt override
//
// Optional rate-limit tuning (defaults shown):
//   AI_RATE_LIMIT_PER_MIN          20      free quota per signed-in user, per minute
//   AI_RATE_LIMIT_TRANSCRIBE_PER_MIN  10   transcribe-specific quota (more expensive)
//
// Credit billing (see 20260801000000_ai_credits.sql):
//   Non-premium callers spend one credit per call except `classify-category`.
//   Out of credits → 402 `insufficient_credits`. Ledger unreachable → 503.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  ACTION_FLAG_KEYS,
  configBool,
  configInt,
  configStr,
  resolveConfig,
  type CallerCohorts,
  type ConfigRow,
} from "../_shared/appConfigResolve.ts";

type Json = Record<string, unknown>;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  // Without this the web build cannot read the credits header off the
  // response — cross-origin reads see only the CORS-safelisted headers.
  "Access-Control-Expose-Headers": "X-Tally-Credits-Remaining",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: Json): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function rawJsonResponse(text: string): Response {
  return new Response(text, {
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

function joinUrl(base: string, path: string): string {
  const b = base.endsWith("/") ? base.slice(0, -1) : base;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

// ────────────────────────── Remote config ──────────────────────────
//
// Only `loadConfigRows` (the `app_config` table) is cached in module scope,
// for 30s, so a busy instance does two of those reads a minute rather than
// one per call. `loadIsAlpha` (`profiles.is_alpha`) and `loadAllowlistKeys`
// (`app_config_allowlist`) are per-caller data and are NOT cached — they run
// on every single request, same as the entitlement RPC in `requireAuthed`.
//
// Fail-open on read failure is deliberate: failing closed would let a
// transient DB blip take AI down for every user. The deliberate break-glass
// is AI_KILL_SWITCH=1, which is checked before any DB read and therefore
// still works when the database does not.

const CONFIG_TTL_MS = 30_000;

type CachedConfig = { rows: ConfigRow[]; at: number };
let configCache: CachedConfig | null = null;

async function loadConfigRows(admin: SupabaseClient): Promise<ConfigRow[]> {
  const now = Date.now();
  if (configCache && now - configCache.at < CONFIG_TTL_MS) return configCache.rows;

  const { data, error } = await admin
    .from("app_config")
    .select("key, cohort, value, visibility");
  if (error) {
    console.warn("ai_config_read_failed", error.message);
    // Last-known-good beats nothing; an empty list means every configBool /
    // configInt below takes its env-var fallback, i.e. today's behaviour.
    return configCache?.rows ?? [];
  }

  const rows = (data ?? []) as ConfigRow[];
  configCache = { rows, at: now };
  return rows;
}

async function loadAllowlistKeys(
  admin: SupabaseClient,
  userId: string,
): Promise<ReadonlySet<string>> {
  const { data, error } = await admin
    .from("app_config_allowlist")
    .select("key")
    .eq("user_id", userId);
  if (error) {
    console.warn("ai_config_allowlist_read_failed", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { key: string }) => r.key));
}

/**
 * Loads `profiles.is_alpha` on its own. `requireAuthed` already reports
 * premium via `tally_has_active_entitlement`, but alpha is a distinct
 * rollout cohort — an alpha tester need not be premium.
 */
async function loadIsAlpha(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("profiles")
    .select("is_alpha")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("ai_config_alpha_read_failed", error.message);
    return false;
  }
  return data?.is_alpha === true;
}

// ────────────────────────── Auth + premium + rate limit ──────────────────────────

type AuthedCaller = {
  userId: string;
  isPremium: boolean;
  admin: SupabaseClient;
};

async function requireAuthed(req: Request): Promise<AuthedCaller | Response> {
  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });
  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) return jsonResponse(500, { error: "server_misconfigured" });

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: auth } },
  });
  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) return jsonResponse(401, { error: "unauthorized" });

  const admin = createClient(url, serviceKey);

  // Entitlement is `profiles.is_premium` OR an active server-verified pass.
  // Reading the column directly used to be the whole check, which meant an
  // Android pass buyer — whose purchase never touches `is_premium` — was told
  // "premium_required" after paying. See tally_has_active_entitlement.
  const { data: entitled, error: entitledErr } = await admin.rpc("tally_has_active_entitlement", {
    p_user_id: data.user.id,
  });
  if (entitledErr) {
    // Fail-closed below is correct and must not change — but a silent RPC
    // error here (e.g. the migration defining this function isn't applied
    // yet) means EVERY premium user loses premium with zero trace. Log it.
    console.warn("entitlement_check_failed", entitledErr.message);
  }
  const isPremium = entitled === true;

  // Entitlement is reported, not enforced, here. Non-premium callers are no
  // longer rejected outright — they pay per call from the credit ledger. The
  // billing decision lives in the entry point so it can see the action.
  return { userId: data.user.id, isPremium, admin };
}

/**
 * Per-user, per-minute counter stored in a small `ai_proxy_usage` table.
 * Returns `null` when allowed; a 429 Response when over budget. The table is
 * created by the migration `…_ai_proxy_usage.sql`; if it isn't present the
 * function mostly fails open (we'd rather degrade than block every signed-in
 * user on a missing migration). There is no premium gate bounding this
 * anymore — non-premium callers reach here too — but the blast radius of
 * failing open stays small **for billable actions**: those still go through
 * `spendCredit`, which fails closed on its own errors, so an unavailable
 * limiter cannot hand out unmetered model calls.
 *
 * That backstop does not exist for FREE_ACTIONS from a non-premium caller:
 * `spendCredit` is never called for them, so the limiter is the *only* cost
 * control. For that one combination an RPC error fails **closed** (429)
 * instead — otherwise a broken usage table would mean unlimited free LLM
 * calls for any confirmed signup. Premium callers keep failing open (their
 * calls are unlimited by design either way).
 */
async function enforceRateLimit(
  admin: SupabaseClient,
  userId: string,
  action: string,
  isPremium: boolean,
  config: Map<string, unknown>,
): Promise<Response | null> {
  // Config wins; the env var stays the fallback so an unseeded or unreachable
  // table behaves exactly as before this change.
  const generalLimit = configInt(config, "ai_rate_limit_per_min", envInt("AI_RATE_LIMIT_PER_MIN", 20));
  const transcribeLimit = configInt(
    config,
    "ai_rate_limit_transcribe_per_min",
    envInt("AI_RATE_LIMIT_TRANSCRIBE_PER_MIN", 10),
  );
  const limit = action === "transcribe" ? transcribeLimit : generalLimit;

  const rateLimited = () =>
    jsonResponse(429, {
      error: "rate_limited",
      retry_after_seconds: 60 - Math.floor((Date.now() % 60_000) / 1000),
    });

  const minuteBucket = Math.floor(Date.now() / 60_000);
  // Atomic upsert + return new count via stored function. We define it in the
  // migration so the math is one round-trip rather than read-then-write.
  const { data, error } = await admin.rpc("ai_proxy_bump_usage", {
    p_user_id: userId,
    p_minute_bucket: minuteBucket,
    p_action: action,
  });
  if (error) {
    console.warn("rate_limit_unavailable", error.message);
    // A free action from a non-premium caller has no other cost control:
    // `spendCredit` is skipped for FREE_ACTIONS, so failing open here would
    // mean unmetered model calls for every free signup while the usage table
    // is down. Fail closed for exactly that combination.
    if (!isPremium && FREE_ACTIONS.has(action)) return rateLimited();
    // Everything else fails open: premium calls are unlimited anyway, and
    // billable calls from non-premium callers still hit `spendCredit`, which
    // fails closed on its own errors.
    return null;
  }
  const count = typeof data === "number" ? data : Number(data ?? 0);
  if (count > limit) return rateLimited();
  return null;
}

// ────────────────────────── Credit billing ──────────────────────────
//
// Non-premium callers pay one credit per call. The canonical copy of this
// rule is `src/core/aiCreditCost.ts`; that module's test greps this file and
// fails if the two lists drift, since Deno cannot import from `src/`.

const FREE_ACTIONS = new Set<string>(["classify-category"]);

/**
 * Spend one credit. Returns the remaining balance, or a Response to return
 * to the caller when the spend cannot proceed.
 *
 * Unlike `enforceRateLimit`, this **always fails closed**. That function may
 * fail open (for billable actions, where this one is the real backstop)
 * because the premium gate used to bound the bill; once non-paying users
 * reach the proxy that reasoning no longer holds, and an unavailable ledger
 * must stop the request rather than hand out free model calls.
 */
async function spendCredit(
  admin: SupabaseClient,
  userId: string,
  action: string,
): Promise<number | Response> {
  const { data, error } = await admin.rpc("ai_credit_spend", {
    p_user_id: userId,
    p_action: action,
  });
  if (error) {
    console.error("credit_spend_unavailable", error.message);
    return jsonResponse(503, { error: "credits_unavailable" });
  }
  const balance = typeof data === "number" ? data : Number(data ?? -1);
  if (balance < 0) {
    return jsonResponse(402, { error: "insufficient_credits", balance: 0 });
  }
  return balance;
}

/**
 * Give a spent credit back when the upstream model call failed. Best-effort:
 * a failed refund is logged, never surfaced, because the user is already
 * getting an error and a second one would not help them.
 */
async function refundCredit(
  admin: SupabaseClient,
  userId: string,
  action: string,
): Promise<void> {
  const { error } = await admin.rpc("ai_credit_grant", {
    p_user_id: userId,
    p_delta: 1,
    p_reason: "refund",
    p_provider: null,
    p_external_id: null,
  });
  if (error) console.error("credit_refund_failed", userId, action, error.message);
}

/** Copy a response, adding the caller's remaining balance as a header. */
function withCreditsHeader(res: Response, remaining: number): Response {
  const headers = new Headers(res.headers);
  headers.set("X-Tally-Credits-Remaining", String(remaining));
  return new Response(res.body, { status: res.status, headers });
}

// ────────────────────────── Chat-completion call ──────────────────────────

type ChatMessage = { role: "system" | "user" | "assistant"; content: unknown };

/**
 * Room for the completion, in tokens.
 *
 * Groq defaults this to 2048, which a reasoning model can spend entirely on
 * its own thinking before it has emitted a single character of the answer.
 * The result is a truncated response that is not valid JSON, which Groq's
 * JSON mode then rejects with a 400 `json_validate_failed` — the proxy turns
 * that into a 502 and the user sees "AI service temporarily unavailable".
 * A long receipt with many line items needs real headroom here even once
 * reasoning is suppressed.
 */
const MAX_COMPLETION_TOKENS = 8192;

/**
 * Per-model parameters that stop a reasoning model from spending the
 * completion budget on thinking tokens.
 *
 * Groq splits this across two mutually exclusive dials, and sending the wrong
 * one for the family is a 400:
 *   - GPT-OSS accepts `include_reasoning` + `reasoning_effort` low|medium|high
 *   - Qwen/MiniMax accept `reasoning_format` + `reasoning_effort` none|default
 *
 * `reasoning_format: "raw"` is rejected outright when JSON mode is on, and
 * the default (`parsed`) still bills the thinking against the output budget —
 * so `hidden` is the only value that both parses and stays cheap here.
 *
 * Returns `{}` for anything unrecognised, which is what keeps the OpenAI
 * fallback path (and any other OpenAI-compatible provider) from being sent
 * Groq-only fields it would reject.
 */
function reasoningParams(model: string): Record<string, unknown> {
  if (model.startsWith("openai/gpt-oss")) {
    return { include_reasoning: false, reasoning_effort: "low" };
  }
  if (model.startsWith("qwen/") || model.startsWith("minimaxai/")) {
    return { reasoning_format: "hidden", reasoning_effort: "none" };
  }
  return {};
}

async function callChatCompletions(opts: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  responseJson?: boolean;
  /** Send Groq's reasoning-suppression and token-budget params. Primary provider only. */
  tuneReasoning?: boolean;
}): Promise<string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.apiKey) headers.Authorization = `Bearer ${opts.apiKey}`;
  const res = await fetch(joinUrl(opts.baseUrl, "/chat/completions"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: opts.model,
      temperature: opts.temperature ?? 0.2,
      ...(opts.responseJson === false
        ? {}
        : { response_format: { type: "json_object" } }),
      ...(opts.tuneReasoning
        ? { max_completion_tokens: MAX_COMPLETION_TOKENS, ...reasoningParams(opts.model) }
        : {}),
      messages: opts.messages,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`upstream_${res.status}:${t.slice(0, 400)}`);
  }
  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") throw new Error("empty_completion");
  return content;
}

// ────────────────────────── Gemini (image scanning) ──────────────────────────
//
// Google's Generative Language API is NOT OpenAI-compatible — different
// endpoint, different auth header, different request and response shapes — so
// it cannot go through `callChatCompletions` and gets its own adapter.
//
// It exists here specifically for the image path. Groq's only vision model
// (qwen/qwen3.6-27b) is a reasoning model that spends its completion budget
// thinking and then truncates mid-JSON; Gemini returns its thinking as a
// separate part and leaves `parts[].text` as clean JSON, which is what the
// receipt parser needs.

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

function getGeminiModel(): string {
  return env("GEMINI_MODEL") || "gemini-flash-latest";
}

type GeminiPart = { text: string } | { inline_data: { mime_type: string; data: string } };

/**
 * Convert one OpenAI-style content value into Gemini parts.
 *
 * Images arrive as `{type:"image_url", image_url:{url:"data:<mime>;base64,<b64>"}}`
 * because that is what the OpenAI-compatible providers take; Gemini wants the
 * mime type and the payload as separate fields, so the data URL is split back
 * apart here. A part that is neither readable text nor a well-formed data URL
 * is dropped rather than sent as `undefined`, which the API rejects.
 */
function toGeminiParts(content: unknown): GeminiPart[] {
  if (typeof content === "string") return content ? [{ text: content }] : [];
  if (!Array.isArray(content)) return [];

  const parts: GeminiPart[] = [];
  for (const raw of content) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as Record<string, unknown>;

    if (p.type === "text" && typeof p.text === "string" && p.text) {
      parts.push({ text: p.text });
      continue;
    }
    if (p.type === "image_url") {
      const holder = p.image_url as Record<string, unknown> | undefined;
      const url = typeof holder?.url === "string" ? holder.url : "";
      const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
      if (m) parts.push({ inline_data: { mime_type: m[1]!, data: m[2]! } });
    }
  }
  return parts;
}

/**
 * Call Gemini's `generateContent` and return the model's raw text.
 *
 * Two shape details matter. System messages become `systemInstruction`
 * rather than a `contents` entry — Gemini has no "system" role. And the
 * response can carry several parts, including internal "thought" parts;
 * only the non-thought text parts are the answer, so they are filtered and
 * joined. Concatenating everything would splice reasoning into the JSON and
 * fail the parser downstream.
 */
async function callGemini(opts: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
}): Promise<string> {
  const systemParts: GeminiPart[] = [];
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [];

  for (const msg of opts.messages) {
    const parts = toGeminiParts(msg.content);
    if (parts.length === 0) continue;
    if (msg.role === "system") {
      systemParts.push(...parts);
    } else {
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
    }
  }
  if (contents.length === 0) throw new Error("gemini_no_content");

  const res = await fetch(
    `${GEMINI_BASE_URL}/models/${encodeURIComponent(opts.model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        contents,
        ...(systemParts.length > 0 ? { systemInstruction: { parts: systemParts } } : {}),
        generationConfig: {
          temperature: opts.temperature ?? 0.2,
          maxOutputTokens: MAX_COMPLETION_TOKENS,
          responseMimeType: "application/json",
        },
      }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`gemini_${res.status}:${t.slice(0, 400)}`);
  }

  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const text = (body.candidates?.[0]?.content?.parts ?? [])
    .filter((p) => p.thought !== true && typeof p.text === "string")
    .map((p) => p.text!)
    .join("")
    .trim();
  if (!text) throw new Error("gemini_empty_completion");
  return text;
}

/**
 * Run a chat completion against the first provider that is configured and
 * working, in order of preference. Returns the model's raw text content.
 *
 * This genuinely fails over: each provider is tried in turn and an error moves
 * on to the next, rather than one bad response taking AI down for everyone —
 * which is exactly how a single retired Groq model produced a total outage.
 * The last error is rethrown when every provider fails, so `detail` on the 502
 * still names a real cause.
 *
 * Gemini goes first for requests carrying an image, because it is the only
 * configured provider that reliably returns clean JSON from a photo. Text-only
 * requests keep the existing primary provider, so the working description and
 * category paths are untouched.
 */
async function chatWithFallback(opts: {
  messages: ChatMessage[];
  /** Used when the primary AI provider is configured. */
  primaryModel: string;
  /** Used when falling back to the OpenAI client. */
  openAiModel: string;
  /** True when the messages carry an image — routes to a vision-capable provider first. */
  hasImages?: boolean;
}): Promise<string> {
  const attempts: (() => Promise<string>)[] = [];

  const geminiKey = env("GEMINI_API_KEY");
  if (geminiKey && opts.hasImages) {
    attempts.push(() =>
      callGemini({ apiKey: geminiKey, model: getGeminiModel(), messages: opts.messages }),
    );
  }

  const aiBase = env("AI_BASE_URL");
  if (aiBase) {
    attempts.push(() =>
      callChatCompletions({
        baseUrl: aiBase,
        apiKey: env("AI_API_KEY") || null,
        model: opts.primaryModel,
        messages: opts.messages,
        tuneReasoning: true,
      }),
    );
  }

  const oai = env("OPENAI_API_KEY");
  if (oai) {
    attempts.push(() =>
      callChatCompletions({
        baseUrl: "https://api.openai.com/v1",
        apiKey: oai,
        model: opts.openAiModel,
        messages: opts.messages,
      }),
    );
  }

  if (attempts.length === 0) throw new Error("no_chat_provider_configured");

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (e) {
      lastError = e;
      // Worth a log line: a silent failover hides a provider that is down for
      // every request while users still get answers from the next one.
      console.warn("chat_provider_failed", e instanceof Error ? e.message : String(e));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

// ────────────────────────── Action handlers ──────────────────────────

const RECEIPT_JSON_SCHEMA_HINT = `Return ONLY a JSON object (no markdown) with this shape:
{
  "merchant": string or null,
  "currency": string or null,
  "lines": [ { "label": string, "amount": number, "qty": number, "kind": "item" | "surcharge" | "discount", "people": string[] } ],
  "subtotal": number or null,
  "tax": number or null,
  "serviceCharge": number or null,
  "discount": number or null,
  "total": number or null,
  "confidence": "high" | "medium" | "low"
}
Rules:
- amounts are in major units of the receipt (e.g. 12.5 for twelve and a half dollars), use a decimal point.
- Put each printed line item in lines[]. Use negative amount for discounts on a line if needed.
- For each line, "label" MUST be the EXACT text printed on the receipt for that item, copied verbatim — preserving the original script (Latin, Arabic, Persian/Farsi, Chinese, Cyrillic, Hebrew, etc.). Do NOT translate, transliterate, or summarize. Do NOT invent placeholder labels like "item 1", "Item N", "line 1", "row 2", "product", or the JSON field names ("serviceCharge", "tax", "discount"). If you cannot read a line's text, omit that line rather than fabricating a label.
- Set "qty" to the quantity printed on that row when the receipt shows one (a quantity/تعداد column, or a "2 x" / "×3" prefix on the item). CRITICAL: "amount" must stay the row's printed LINE TOTAL for all of those units together — never the per-unit price, and never multiplied again by "qty". If the receipt prints only a unit price and a quantity, multiply them yourself and put the product in "amount". Omit "qty" (or use 1) when the row shows no quantity or shows a single unit, and omit it for fractional/weight quantities like 1.5 or 0.75 kg.
- For tax / service-charge / discount lines that appear as their own row on the receipt, use the printed wording in "label" (for example "سرویس", "مالیات", "10%", "Service 10%", "VAT", "Tip") and ALSO populate the matching aggregate field ("tax" / "serviceCharge" / "discount") with the same number.
- Set "kind" on every line. Use "item" for anything the customer ordered — food, drinks, a shared platter, a tea or water service. Use "surcharge" ONLY for a charge computed on top of the order as a whole (VAT, tax, service percentage, tip, cover charge). Use "discount" for a negative adjustment. When in doubt use "item": a named dish or service that people share is an item, even if its name contains a word like "service" or "سرویس".
- Only set "people" on a line when the user's accompanying description (if one was supplied) actually attributes that item to someone by name — silence means silence, never guess; a line the description doesn't mention must come back with no "people" at all. When it does apply, prefer a name from the provided participant list — if the description refers to one of them, copy that participant's name exactly; if it clearly introduces a new person who is NOT in the participant list, keep the new name verbatim as written. The description may refer to a line by its printed label loosely or in another language (e.g. "the chicken", "the pizza") — match it to the closest line, and if genuinely ambiguous between two or more lines, attribute it to neither. One line may list several people, and the same person may appear on several lines.
- total should match the printed total when visible.`;

/**
 * Appended to the receipt prompt only when the caller sent more than one
 * image — a single-image call must not see any of this text, so its prompt
 * stays byte-identical to what this handler sent before multi-image support
 * existed.
 *
 * Covers the four failure modes that matter for a receipt split across
 * photos: (1) returning one list instead of per-image lists, (2) keeping
 * the receipt's printed order, (3) not double-counting the line(s) that
 * usually get recaptured at each photo boundary, and (4) a line whose text
 * is cut off across the boundary being reported once, complete.
 */
const RECEIPT_MULTI_IMAGE_HINT = ` Multiple-image rules: these images are ONE receipt split into parts because it didn't fit in a single photo, supplied in order from the top of the receipt to the bottom — never treat them as separate receipts and never return more than one "lines" array. Merge everything into the single combined "lines" array, keeping the receipt's printed top-to-bottom order across every image. Consecutive images usually overlap at the seam: the operator often recaptures the last printed line or two of one image as the first line(s) of the next so nothing is missed. Before adding a line, check whether a line with the same (or effectively the same) printed text and amount was already added from the previous image — if so it is the SAME printed line, not a new one; do not emit it twice. If a line's printed text is cut off at the bottom edge of one image and continues at the top of the next, that is still ONE printed line — combine the fragments into a single complete line and emit it once, never as two partial lines. The printed subtotal / tax / service charge / discount / total normally appear only near the bottom of the LAST image; when present there they describe the WHOLE receipt (every image combined, not just that image), so populate "subtotal" / "tax" / "serviceCharge" / "discount" / "total" from wherever they are printed even though earlier images show none of those fields.`;

const DESCRIPTION_JSON_SCHEMA_HINT = `Instructions:
1. Multiple Expenses: If the description mentions several distinct transactions or purchases (e.g. "Alice paid 20 for coffee and Bob paid 50 for dinner"), return ONE entry per transaction in the "expenses" array. Do not merge unrelated transactions into a single expense.
2. Entity Resolution: Prefer a name from the provided participant list — if the text refers to one of them, copy that participant's name exactly. If the description clearly introduces a new person who is NOT in the participant list (e.g. "Kathy paid 10"), keep the new name verbatim as written; the app will create that person automatically. If a name is ambiguous, use your best judgement but lower the confidence score.
3. Split Logic:
   - If the text says "split equally", divide the total amount by the number of people involved.
   - If specific amounts are mentioned for some people but not others, assign the remainder to the person who "paid for the rest".
4. Validation: For each expense the sum of splits[].amount MUST equal amount (within 0.01).
5. Formatting: Amounts are standard decimal numbers in major currency units (e.g. 12.5 for twelve and a half). Never return amounts as strings.
6. Names: "payer" and every "person" MUST be a single human name (no placeholders like "unknown", no generic labels). Prefer names from the participant list; otherwise use the exact new name the description introduced.

Output Format:
Return ONLY a JSON object (no markdown) with this structure:
{
  "currency": "ISO Code" or null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "Short explanation of how splits were calculated",
  "expenses": [
    {
      "description": string,
      "amount": number,
      "payer": string,
      "splits": [ { "person": string, "amount": number } ]
    }
  ]
}`;

const DEFAULT_CATEGORY_SYSTEM_PROMPT = `You classify an expense title into exactly one of these category ids:
- "food"      (meals, restaurants, groceries, coffee, food delivery)
- "snack"     (chips, candy, convenience snacks, supermarket snacks)
- "drink"     (alcohol, soda, juice, bottled water)
- "home"      (rent, utilities, furniture, cleaning, household repairs)
- "transport" (taxi, rideshare, fuel, parking, plane/train/bus tickets)
- "general"   (anything that does not clearly fit the above)

Reply with ONLY a JSON object: {"category": "<id>"} — no prose, no markdown.`;

/**
 * A receipt can be split across up to 3 photos when it's too long for one
 * frame (a long thermal-printer tape, for example). Matches the client's
 * `MAX_RECEIPT_IMAGES` in `src/core/parseReceiptImage.ts`. Enforced again
 * here — not just trusted from the client — because the client cap can be
 * bypassed by anyone calling this endpoint directly; a request over the cap
 * is rejected outright rather than silently truncated, for the same reason
 * the client rejects rather than truncates.
 */
const MAX_RECEIPT_IMAGES = 3;

/**
 * A receipt image arrives in one of two wire shapes: the current
 * `images: [{base64, mimeType}, …]` array (1-3 entries, receipt order), or
 * the original single-image `imageBase64`/`mimeType` top-level fields that
 * predate multi-image support. Both are accepted so the byte-identical
 * single-image request the client still sends keeps working. `images` wins
 * when both happen to be present.
 */
function parseReceiptImages(body: Json): { base64: string; mimeType: string }[] {
  if (Array.isArray(body.images)) {
    const out = (body.images as unknown[])
      .map((row) => {
        if (!row || typeof row !== "object") return null;
        const o = row as Record<string, unknown>;
        const b64 = typeof o.base64 === "string" ? o.base64 : "";
        const mt = typeof o.mimeType === "string" ? o.mimeType : "";
        return b64 && mt ? { base64: b64, mimeType: mt } : null;
      })
      .filter((v): v is { base64: string; mimeType: string } => !!v);
    if (out.length > 0) return out;
  }
  const base64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  return base64 && mimeType ? [{ base64, mimeType }] : [];
}

async function handleParseReceipt(body: Json, config: Map<string, unknown>): Promise<Response> {
  const images = parseReceiptImages(body);
  const currencyHint = typeof body.currencyHint === "string" ? body.currencyHint : "USD";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const participantNames = Array.isArray(body.participantNames)
    ? (body.participantNames as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  if (images.length === 0) return jsonResponse(400, { error: "image_required" });
  if (images.length > MAX_RECEIPT_IMAGES) return jsonResponse(400, { error: "too_many_images" });

  // Only present when the caller supplied a description — a photo-only
  // parse must produce the exact same prompt it did before this field
  // existed, so nothing is appended when `description` is empty.
  const attributionBlock = description
    ? ` The user also described who had what: "${description}". Allowed Participants: ${participantNames
        .map((n) => `"${n}"`)
        .join(", ")}. Use this description to populate "people" on the matching line(s) per the rules above.`
    : "";

  // A single image keeps the exact lead sentence this handler has always
  // sent; only 2-3 images add the multi-image lead-in and rules below, so a
  // single-image call's prompt is byte-identical to before this feature.
  const leadSentence =
    images.length > 1
      ? `Parse this receipt. It was photographed as ${images.length} separate images, supplied in order from the top of the receipt to the bottom, because the whole receipt did not fit in one photo.`
      : `Parse this receipt image.`;

  const userText = `${leadSentence} Interpret monetary amounts in the group's billing currency **${currencyHint}** unless the receipt clearly shows another ISO currency code (then set "currency" and still express numeric amounts as printed). ${RECEIPT_JSON_SCHEMA_HINT}${
    images.length > 1 ? RECEIPT_MULTI_IMAGE_HINT : ""
  }${attributionBlock}`;

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        ...images.map((img) => ({
          type: "image_url" as const,
          image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
        })),
      ],
    },
  ];

  const text = await chatWithFallback({
    messages,
    primaryModel: configStr(
      config,
      "ai_receipt_model",
      env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini",
    ),
    openAiModel: env("OPENAI_RECEIPT_MODEL") || "gpt-4o-mini",
    // Always an image — this is the receipt scanner.
    hasImages: true,
  });
  return rawJsonResponse(text);
}

async function handleParseDescription(body: Json, config: Map<string, unknown>): Promise<Response> {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  const currencyHint = typeof body.currencyHint === "string" ? body.currencyHint : "USD";
  const participantNames = Array.isArray(body.participantNames)
    ? (body.participantNames as unknown[]).filter((s): s is string => typeof s === "string")
    : [];
  const images = Array.isArray(body.images)
    ? (body.images as unknown[])
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const o = row as Record<string, unknown>;
          const b64 = typeof o.base64 === "string" ? o.base64 : "";
          const mt = typeof o.mimeType === "string" ? o.mimeType : "";
          return b64 && mt ? { base64: b64, mimeType: mt } : null;
        })
        .filter((v): v is { base64: string; mimeType: string } => !!v)
    : [];

  if (!prompt.trim()) return jsonResponse(400, { error: "prompt_required" });

  const participantsList = participantNames.map((n) => `"${n}"`).join(", ");
  const promptOverride = configStr(config, "ai_expense_prompt", env("AI_EXPENSE_PROMPT"));
  const sys = promptOverride
    ? promptOverride
        .replaceAll("{currency}", currencyHint)
        .replaceAll("{participants}", participantsList)
    : `You are a financial parsing assistant. Your goal is to convert natural language into a strictly validated JSON format for expense tracking.\n\nContext:\n- Default Currency: ${currencyHint} (interpret amounts in this currency unless the user clearly uses another ISO currency code).\n- Allowed Participants: ${participantsList}.\n\n${DESCRIPTION_JSON_SCHEMA_HINT}`;

  let userContent: unknown = prompt;
  if (images.length > 0) {
    const parts: unknown[] = [{ type: "text", text: prompt }];
    for (const img of images) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${img.mimeType};base64,${img.base64}`, detail: "high" },
      });
    }
    userContent = parts;
  }

  const text = await chatWithFallback({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userContent },
    ],
    primaryModel:
      images.length > 0
        ? configStr(
            config,
            "ai_receipt_model",
            env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini",
          )
        : configStr(config, "ai_model", env("AI_MODEL") || "gpt-4o-mini"),
    openAiModel: env("OPENAI_RECEIPT_MODEL") || "gpt-4o-mini",
    hasImages: images.length > 0,
  });
  return rawJsonResponse(text);
}

async function handleClassifyCategory(body: Json, config: Map<string, unknown>): Promise<Response> {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return jsonResponse(400, { error: "title_required" });

  const sys = configStr(
    config,
    "ai_category_prompt",
    env("AI_CATEGORY_PROMPT") || DEFAULT_CATEGORY_SYSTEM_PROMPT,
  );

  try {
    const text = await chatWithFallback({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Title: ${title}` },
      ],
      primaryModel: configStr(config, "ai_model", env("AI_MODEL") || "gpt-4o-mini"),
      openAiModel: env("OPENAI_RECEIPT_MODEL") || "gpt-4o-mini",
    });
    return rawJsonResponse(text);
  } catch {
    // Classifier is best-effort. Return null so the client falls back to its
    // local keyword heuristic without surfacing an error to the user.
    return jsonResponse(200, { category: null });
  }
}

async function handleTranscribe(body: Json): Promise<Response> {
  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "audio/m4a";
  const filename = typeof body.filename === "string" ? body.filename : "recording.m4a";
  if (!audioBase64) return jsonResponse(400, { error: "audio_required" });

  // Decode base64 → Uint8Array → Blob for multipart upload.
  const binary = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  const blob = new Blob([binary], { type: mimeType });

  const sttKey = env("STT_API_KEY");
  if (sttKey) {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("model_id", env("STT_MODEL") || "scribe_v1");
    const endpoint = env("STT_ENDPOINT_URL") || "https://api.elevenlabs.io/v1/speech-to-text";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "xi-api-key": sttKey },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return jsonResponse(502, { error: `stt_${res.status}`, detail: t.slice(0, 400) });
    }
    const out = (await res.json()) as { text?: string };
    return jsonResponse(200, { text: (out.text ?? "").trim() });
  }

  const oai = env("OPENAI_API_KEY");
  if (oai) {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("model", env("OPENAI_WHISPER_MODEL") || "whisper-1");
    form.append("response_format", "json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${oai}` },
      body: form,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return jsonResponse(502, { error: `whisper_${res.status}`, detail: t.slice(0, 400) });
    }
    const out = (await res.json()) as { text?: string };
    return jsonResponse(200, { text: (out.text ?? "").trim() });
  }

  return jsonResponse(500, { error: "no_stt_provider_configured" });
}

// ────────────────────────── Entry point ──────────────────────────

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

  let body: Json;
  try {
    body = (await req.json()) as Json;
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  // Break-glass: checked before requireAuthed, and therefore before any DB
  // read (auth's own entitlement RPC included), so it still works when the
  // database is the thing that is unhealthy. Needs a redeploy by design.
  //
  // Placing it ahead of auth means an unauthenticated caller gets 403
  // ai_disabled instead of 401 unauthorized while the switch is on. That is
  // accepted: the feature is off for everyone, and that is the honest answer
  // regardless of who is asking.
  if (env("AI_KILL_SWITCH") === "1") {
    return jsonResponse(403, { error: "ai_disabled" });
  }

  const auth = await requireAuthed(req);
  if (auth instanceof Response) return auth;

  const action = typeof body.action === "string" ? body.action : "";
  if (
    action !== "parse-receipt" &&
    action !== "parse-description" &&
    action !== "classify-category" &&
    action !== "transcribe"
  ) {
    return jsonResponse(400, { error: "unknown_action" });
  }

  // Resolve this caller's config BEFORE billing — a disabled action must
  // never spend a credit.
  const [rows, alpha, allowlistKeys] = await Promise.all([
    loadConfigRows(auth.admin),
    loadIsAlpha(auth.admin, auth.userId),
    loadAllowlistKeys(auth.admin, auth.userId),
  ]);
  const caller: CallerCohorts = { premium: auth.isPremium, alpha, allowlistKeys };
  const config = resolveConfig(rows, caller);

  // Absent keys default to `true`: an unseeded table must not disable AI.
  if (!configBool(config, "ai_enabled", true)) {
    return jsonResponse(403, { error: "ai_disabled" });
  }
  const actionFlagKey = ACTION_FLAG_KEYS[action];
  if (actionFlagKey && !configBool(config, actionFlagKey, true)) {
    return jsonResponse(403, { error: "action_disabled", action });
  }

  const limited = await enforceRateLimit(auth.admin, auth.userId, action, auth.isPremium, config);
  if (limited) return limited;

  // Premium here means tally_has_active_entitlement: `profiles.is_premium`
  // OR an active server-verified pass (see requireAuthed). A pass buyer is
  // therefore unlimited here too, same as an is_premium subscriber.
  // `classify-category` is never billed, regardless of premium status.
  // Everyone else who isn't entitled pays a credit.
  const billable = !auth.isPremium && !FREE_ACTIONS.has(action);
  let remaining: number | null = null;
  if (billable) {
    const spent = await spendCredit(auth.admin, auth.userId, action);
    if (spent instanceof Response) return spent;
    remaining = spent;
  }

  const runAction = async (): Promise<Response> => {
    switch (action) {
      case "parse-receipt":
        return await handleParseReceipt(body, config);
      case "parse-description":
        return await handleParseDescription(body, config);
      case "classify-category":
        return await handleClassifyCategory(body, config);
      case "transcribe":
        return await handleTranscribe(body);
    }
    return jsonResponse(400, { error: "unknown_action" });
  };

  try {
    const res = await runAction();
    // A provider outage must not cost the user an ad. Handlers signal
    // failure either by throwing or by returning a non-2xx Response, so
    // both paths refund.
    if (billable && !res.ok) {
      await refundCredit(auth.admin, auth.userId, action);
      return res;
    }
    return remaining === null ? res : withCreditsHeader(res, remaining);
  } catch (e) {
    if (billable) await refundCredit(auth.admin, auth.userId, action);
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(502, { error: "upstream_failed", detail: msg.slice(0, 400) });
  }
});
