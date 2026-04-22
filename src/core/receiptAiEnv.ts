function trim(s: string | undefined | null): string {
  return (s ?? "").trim();
}

/** OpenAI API key for receipt vision (Expo: set in `.env` as `EXPO_PUBLIC_OPENAI_API_KEY`). */
export function getOpenAiApiKeyForReceipts(): string | null {
  const k = trim(process.env.EXPO_PUBLIC_OPENAI_API_KEY);
  return k.length > 0 ? k : null;
}

export function getOpenAiReceiptModel(): string {
  const m = trim(process.env.EXPO_PUBLIC_OPENAI_RECEIPT_MODEL);
  return m.length > 0 ? m : "gpt-4o-mini";
}

/**
 * Optional proxy: POST JSON `{ imageBase64, mimeType, currencyHint }` to your server,
 * which calls OpenAI and returns the same JSON shape as {@link ParsedReceiptPayload}.
 * When unset, the app calls OpenAI directly from the device (key must be set).
 */
export function getReceiptParseProxyUrl(): string | null {
  const u = trim(process.env.EXPO_PUBLIC_TALLY_RECEIPT_PARSE_URL);
  return u.length > 0 ? u : null;
}

/** Speech-to-text API key (`EXPO_PUBLIC_STT_API_KEY`). */
export function getSttApiKey(): string | null {
  const k = trim(process.env.EXPO_PUBLIC_STT_API_KEY);
  return k.length > 0 ? k : null;
}

/** Speech-to-text model id. Defaults to `scribe_v1` (ElevenLabs Scribe). */
export function getSttModel(): string {
  const m = trim(process.env.EXPO_PUBLIC_STT_MODEL);
  return m.length > 0 ? m : "scribe_v1";
}

/** Full STT endpoint URL. Defaults to the ElevenLabs Scribe endpoint. */
export function getSttEndpointUrl(): string {
  const u = trim(process.env.EXPO_PUBLIC_STT_ENDPOINT_URL);
  return u.length > 0 ? u : "https://api.elevenlabs.io/v1/speech-to-text";
}

/**
 * AI chat provider API key (`EXPO_PUBLIC_AI_API_KEY`).
 *
 * Only needed when the endpoint uses `Authorization: Bearer <key>` auth.
 * For gateway-style base URLs that embed the token in the path, this can be
 * left unset.
 */
export function getAiApiKey(): string | null {
  const k = trim(process.env.EXPO_PUBLIC_AI_API_KEY);
  return k.length > 0 ? k : null;
}

/**
 * AI chat base URL — everything up to (but not including) `/chat/completions`.
 * No default: paste the full URL from your provider's dashboard. Supports any
 * OpenAI-compatible endpoint (e.g. `https://api.openai.com/v1`).
 */
export function getAiBaseUrl(): string | null {
  const u = trim(process.env.EXPO_PUBLIC_AI_BASE_URL);
  return u.length > 0 ? u : null;
}

/** AI chat model id (`EXPO_PUBLIC_AI_MODEL`). */
export function getAiModel(): string {
  const m = trim(process.env.EXPO_PUBLIC_AI_MODEL);
  return m.length > 0 ? m : "gpt-4o-mini";
}

/** True when the AI chat provider is usable — base URL is set (key is optional for gateway URLs). */
export function isAiConfigured(): boolean {
  return Boolean(getAiBaseUrl());
}

/** True when any AI backend (proxy, OpenAI, STT, or generic AI chat) is configured. */
export function hasAnyAiBackend(): boolean {
  return (
    Boolean(getReceiptParseProxyUrl()) ||
    Boolean(getOpenAiApiKeyForReceipts()) ||
    Boolean(getSttApiKey()) ||
    isAiConfigured()
  );
}

/**
 * Optional system-prompt override for the expense-description parser.
 * The template may contain the placeholders `{currency}` (ISO code like `USD`)
 * and `{participants}` (comma-separated quoted names). Returns `null` when
 * unset — callers then use the built-in default.
 */
export function getExpensePromptTemplate(): string | null {
  const s = trim(process.env.EXPO_PUBLIC_AI_EXPENSE_PROMPT);
  return s.length > 0 ? s : null;
}

/** Optional system-prompt override for the category classifier. */
export function getCategoryPromptTemplate(): string | null {
  const s = trim(process.env.EXPO_PUBLIC_AI_CATEGORY_PROMPT);
  return s.length > 0 ? s : null;
}
