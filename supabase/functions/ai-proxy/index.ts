// AI proxy: keeps the Groq / OpenAI / ElevenLabs API keys server-side so they
// never enter the shipped JS bundle. The client posts one of four `action`s
// with a JSON body; this function:
//   1. accepts CORS preflight (so a future web build works)
//   2. verifies the caller's Supabase JWT
//   3. enforces the premium gate (server-side — the client copy is just a hint)
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
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are auto-injected.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.49.1";

type Json = Record<string, unknown>;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
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
  const { data: profile } = await admin
    .from("profiles")
    .select("is_premium")
    .eq("id", data.user.id)
    .maybeSingle();

  const isPremium = Boolean(profile?.is_premium);
  if (!isPremium) {
    return jsonResponse(402, { error: "premium_required" });
  }
  return { userId: data.user.id, isPremium, admin };
}

/**
 * Per-user, per-minute counter stored in a small `ai_proxy_usage` table.
 * Returns `null` when allowed; a 429 Response when over budget. The table is
 * created by the migration `…_ai_proxy_usage.sql`; if it isn't present the
 * function fails open (we'd rather degrade than block all paying users on a
 * missing migration — the bill blast radius is bounded by the premium gate).
 */
async function enforceRateLimit(
  admin: SupabaseClient,
  userId: string,
  action: string,
): Promise<Response | null> {
  const generalLimit = envInt("AI_RATE_LIMIT_PER_MIN", 20);
  const transcribeLimit = envInt("AI_RATE_LIMIT_TRANSCRIBE_PER_MIN", 10);
  const limit = action === "transcribe" ? transcribeLimit : generalLimit;

  const minuteBucket = Math.floor(Date.now() / 60_000);
  // Atomic upsert + return new count via stored function. We define it in the
  // migration so the math is one round-trip rather than read-then-write.
  const { data, error } = await admin.rpc("ai_proxy_bump_usage", {
    p_user_id: userId,
    p_minute_bucket: minuteBucket,
    p_action: action,
  });
  if (error) {
    // Table or function missing → fail open (premium gate still bounds spend).
    console.warn("rate_limit_unavailable", error.message);
    return null;
  }
  const count = typeof data === "number" ? data : Number(data ?? 0);
  if (count > limit) {
    return jsonResponse(429, {
      error: "rate_limited",
      retry_after_seconds: 60 - Math.floor((Date.now() % 60_000) / 1000),
    });
  }
  return null;
}

// ────────────────────────── Chat-completion call ──────────────────────────

type ChatMessage = { role: "system" | "user" | "assistant"; content: unknown };

async function callChatCompletions(opts: {
  baseUrl: string;
  apiKey: string | null;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  responseJson?: boolean;
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

/** Try the AI base-URL provider first, fall back to OpenAI directly. Returns the model's raw text content. */
async function chatWithFallback(opts: {
  messages: ChatMessage[];
  /** Used when the primary AI provider is configured. */
  primaryModel: string;
  /** Used when falling back to the OpenAI client. */
  openAiModel: string;
}): Promise<string> {
  const aiBase = env("AI_BASE_URL");
  if (aiBase) {
    return await callChatCompletions({
      baseUrl: aiBase,
      apiKey: env("AI_API_KEY") || null,
      model: opts.primaryModel,
      messages: opts.messages,
    });
  }
  const oai = env("OPENAI_API_KEY");
  if (oai) {
    return await callChatCompletions({
      baseUrl: "https://api.openai.com/v1",
      apiKey: oai,
      model: opts.openAiModel,
      messages: opts.messages,
    });
  }
  throw new Error("no_chat_provider_configured");
}

// ────────────────────────── Action handlers ──────────────────────────

const RECEIPT_JSON_SCHEMA_HINT = `Return ONLY a JSON object (no markdown) with this shape:
{
  "merchant": string or null,
  "currency": string or null,
  "lines": [ { "label": string, "amount": number } ],
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
- For tax / service-charge / discount lines that appear as their own row on the receipt, use the printed wording in "label" (for example "سرویس", "مالیات", "10%", "Service 10%", "VAT", "Tip") and ALSO populate the matching aggregate field ("tax" / "serviceCharge" / "discount") with the same number.
- total should match the printed total when visible.`;

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

async function handleParseReceipt(body: Json): Promise<Response> {
  const base64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";
  const currencyHint = typeof body.currencyHint === "string" ? body.currencyHint : "USD";
  if (!base64 || !mimeType) return jsonResponse(400, { error: "image_required" });

  const userText = `Parse this receipt image. Interpret monetary amounts in the group's billing currency **${currencyHint}** unless the receipt clearly shows another ISO currency code (then set "currency" and still express numeric amounts as printed). ${RECEIPT_JSON_SCHEMA_HINT}`;

  const messages: ChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: userText },
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
        },
      ],
    },
  ];

  const text = await chatWithFallback({
    messages,
    primaryModel: env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini",
    openAiModel: env("OPENAI_RECEIPT_MODEL") || "gpt-4o-mini",
  });
  return rawJsonResponse(text);
}

async function handleParseDescription(body: Json): Promise<Response> {
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
  const promptOverride = env("AI_EXPENSE_PROMPT");
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
        ? env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini"
        : env("AI_MODEL") || "gpt-4o-mini",
    openAiModel: env("OPENAI_RECEIPT_MODEL") || "gpt-4o-mini",
  });
  return rawJsonResponse(text);
}

async function handleClassifyCategory(body: Json): Promise<Response> {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return jsonResponse(400, { error: "title_required" });

  const sys = env("AI_CATEGORY_PROMPT") || DEFAULT_CATEGORY_SYSTEM_PROMPT;

  try {
    const text = await chatWithFallback({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Title: ${title}` },
      ],
      primaryModel: env("AI_MODEL") || "gpt-4o-mini",
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

  const limited = await enforceRateLimit(auth.admin, auth.userId, action);
  if (limited) return limited;

  try {
    switch (action) {
      case "parse-receipt":
        return await handleParseReceipt(body);
      case "parse-description":
        return await handleParseDescription(body);
      case "classify-category":
        return await handleClassifyCategory(body);
      case "transcribe":
        return await handleTranscribe(body);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse(502, { error: "upstream_failed", detail: msg.slice(0, 400) });
  }
});
