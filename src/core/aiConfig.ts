/**
 * The client's view of remote AI config: what is switched on, and what
 * request limits to pre-validate against.
 *
 * Pure — no I/O — so the parsing rules are testable in isolation, the same
 * split `aiAccess.ts` and `aiCreditCost.ts` already use. The fetch lives in
 * `aiConfigClient.ts`.
 *
 * Everything defaults to ENABLED. The client fails open by design: `ai-proxy`
 * enforces the same flags server-side, so a stale client is never a bypass —
 * it just shows a button and gets a clean 403 back.
 */
import type { AiProxyAction } from "./aiCreditCost";

/**
 * Client action → server flag key. `aiConfig.test.ts` greps
 * `supabase/functions/_shared/aiConfigResolve.ts` and fails if the two copies
 * drift, since Deno cannot import from `src/`.
 */
const ACTION_FLAG_KEYS: Readonly<Record<AiProxyAction, string>> = {
  "parse-receipt": "ai_action_parse_receipt",
  "parse-description": "ai_action_parse_description",
  "classify-category": "ai_action_classify_category",
  transcribe: "ai_action_transcribe",
};

export type AiConfig = {
  /** Master switch. False hides the AI section entirely. */
  aiEnabled: boolean;
  actions: Record<AiProxyAction, boolean>;
  /** Reject an image larger than this before uploading it. */
  maxImageBytes: number;
  /** Stop a voice recording at this length. */
  maxAudioSeconds: number;
};

export const DEFAULT_AI_CONFIG: AiConfig = {
  aiEnabled: true,
  actions: {
    "parse-receipt": true,
    "parse-description": true,
    "classify-category": true,
    transcribe: true,
  },
  // Matches the threshold currently hardcoded in `downscaleReceiptImage.ts:37`
  // — base64 characters, not bytes on disk. Changing this number changes when
  // receipts get downscaled, so it must stay in step with the migration seed.
  maxImageBytes: 4_000_000,
  maxAudioSeconds: 120,
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function boolAt(source: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = source[key];
  return typeof v === "boolean" ? v : fallback;
}

function intAt(source: Record<string, unknown>, key: string, fallback: number): number {
  const v = source[key];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback;
}

/**
 * Parse a `get-ai-config` response. Never throws.
 *
 * Falls back **per key**: one malformed value costs only that key, not the
 * whole config. Discarding everything would mean a single server-side typo
 * silently reverted every flag.
 */
export function parseAiConfig(input: unknown): AiConfig {
  if (!isRecord(input)) return DEFAULT_AI_CONFIG;

  const flags = isRecord(input.flags) ? input.flags : {};
  const limits = isRecord(input.limits) ? input.limits : {};

  const actions = {} as Record<AiProxyAction, boolean>;
  for (const action of Object.keys(ACTION_FLAG_KEYS) as AiProxyAction[]) {
    actions[action] = boolAt(flags, ACTION_FLAG_KEYS[action], DEFAULT_AI_CONFIG.actions[action]);
  }

  return {
    aiEnabled: boolAt(flags, "ai_enabled", DEFAULT_AI_CONFIG.aiEnabled),
    actions,
    maxImageBytes: intAt(limits, "ai_max_image_bytes", DEFAULT_AI_CONFIG.maxImageBytes),
    maxAudioSeconds: intAt(limits, "ai_max_audio_seconds", DEFAULT_AI_CONFIG.maxAudioSeconds),
  };
}

/** An action runs only if both the master switch and its own flag are on. */
export function isActionEnabled(config: AiConfig, action: AiProxyAction): boolean {
  return config.aiEnabled && config.actions[action];
}
