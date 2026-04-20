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
