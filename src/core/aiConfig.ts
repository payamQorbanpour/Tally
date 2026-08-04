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
import { configBool, configInt, type RemoteConfig } from "./remoteConfig";
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
  /**
   * Master switch. False does NOT hide the AI section — the tab and screen
   * still render. It makes `isActionEnabled` return false for every action,
   * so interacting with them shows a "temporarily unavailable" message
   * instead of making a call.
   */
  aiEnabled: boolean;
  actions: Record<AiProxyAction, boolean>;
  /**
   * The base64 length at which `downscaleReceiptImage` ATTEMPTS to resize an
   * image before upload — not a hard reject. Below this it's a no-op; at or
   * above it, `expo-image-manipulator` is used to shrink and recompress.
   * That resize is itself best-effort: if the module is missing or throws,
   * the original (oversized) payload is uploaded anyway.
   */
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

/** Project the general config bag onto the AI-specific shape. */
export function aiConfigFrom(c: RemoteConfig): AiConfig {
  const actions = {} as Record<AiProxyAction, boolean>;
  for (const action of Object.keys(ACTION_FLAG_KEYS) as AiProxyAction[]) {
    actions[action] = configBool(c, ACTION_FLAG_KEYS[action], DEFAULT_AI_CONFIG.actions[action]);
  }
  return {
    aiEnabled: configBool(c, "ai_enabled", DEFAULT_AI_CONFIG.aiEnabled),
    actions,
    maxImageBytes: configInt(c, "ai_max_image_bytes", DEFAULT_AI_CONFIG.maxImageBytes),
    maxAudioSeconds: configInt(c, "ai_max_audio_seconds", DEFAULT_AI_CONFIG.maxAudioSeconds),
  };
}

/** An action runs only if both the master switch and its own flag are on. */
export function isActionEnabled(config: AiConfig, action: AiProxyAction): boolean {
  return config.aiEnabled && config.actions[action];
}
