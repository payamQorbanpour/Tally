/**
 * Upstream provider selection for `ai-proxy`.
 *
 * Deliberately dependency-free (no `Deno.*`, no `npm:` imports) so Vitest can
 * run it under Node — the same constraint `appConfigResolve.ts` follows. All
 * I/O lives in the calling function's `index.ts`, and `resolveModel` takes an
 * env lookup as a parameter rather than importing one.
 *
 * Everything here is config-first with an env fallback, so an unseeded or
 * unreachable `app_config` behaves exactly as the shipped defaults.
 */

import { configInt, configStr } from "./appConfigResolve.ts";

/**
 * The providers wired into `ai-proxy`.
 *
 * `groq` is really "whatever `AI_BASE_URL` points at" — any OpenAI-compatible
 * endpoint. It is named for the vendor actually in use because these strings
 * get typed by hand into SQL during an incident, and `groq` reads better there
 * than `openai_compatible`. Adding a fourth provider is a code change by
 * design: the database picks between wired providers, it does not define them.
 */
export type ProviderName = "groq" | "gemini" | "openai";

const PROVIDER_NAMES: readonly string[] = ["groq", "gemini", "openai"];

/** Whether the request carries an image. Decides both order and model. */
export type RequestKind = "text" | "image";

/** Injected `Deno.env.get`-alike. Unset names return "". */
export type EnvLookup = (name: string) => string;

/**
 * Order used when the config key is absent, empty, or names nothing known.
 *
 * Gemini leads for images because it is the only configured provider that
 * reliably returns clean JSON from a photo — Groq's vision model spends its
 * completion budget on reasoning and truncates mid-JSON. Groq leads for text
 * because it is cheaper and faster there, with Gemini behind it so a Groq
 * rate-limit no longer takes the whole text path down.
 */
const DEFAULT_ORDER: Readonly<Record<RequestKind, readonly ProviderName[]>> = {
  text: ["groq", "gemini"],
  image: ["gemini", "groq"],
};

const ORDER_KEYS: Readonly<Record<RequestKind, string>> = {
  text: "ai_provider_order_text",
  image: "ai_provider_order_image",
};

function isProviderName(v: string): v is ProviderName {
  return PROVIDER_NAMES.includes(v);
}

/**
 * Parse a comma-separated provider list.
 *
 * Unknown names are dropped rather than throwing: a typo in an incident-time
 * `UPDATE` must not take AI down harder than the incident being mitigated. A
 * repeat collapses to its first occurrence so `groq,gemini,groq` does not
 * retry a provider that already failed. Returns `[]` when nothing survives —
 * `resolveProviderOrder` substitutes the default.
 */
export function parseProviderOrder(raw: string): ProviderName[] {
  const out: ProviderName[] = [];
  for (const part of raw.split(",")) {
    const name = part.trim().toLowerCase();
    if (!isProviderName(name)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
}

/** The provider order to try for this request kind. Never empty. */
export function resolveProviderOrder(
  config: Map<string, unknown>,
  kind: RequestKind,
): ProviderName[] {
  const configured = parseProviderOrder(configStr(config, ORDER_KEYS[kind], ""));
  return configured.length > 0 ? configured : [...DEFAULT_ORDER[kind]];
}

/**
 * The model id for one provider and request kind: config, then that
 * provider's env var, then a literal default.
 *
 * `ai_model` / `ai_receipt_model` belong to `groq` specifically — they predate
 * configurable provider order, when "the primary provider" and "the thing
 * `AI_BASE_URL` points at" were the same statement.
 */
export function resolveModel(
  provider: ProviderName,
  kind: RequestKind,
  config: Map<string, unknown>,
  env: EnvLookup,
): string {
  switch (provider) {
    case "groq":
      return kind === "image"
        ? configStr(
            config,
            "ai_receipt_model",
            env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini",
          )
        : configStr(config, "ai_model", env("AI_MODEL") || "gpt-4o-mini");
    case "gemini":
      return configStr(config, "ai_gemini_model", env("GEMINI_MODEL") || "gemini-flash-latest");
    case "openai":
      return env("OPENAI_RECEIPT_MODEL") || "gpt-4o-mini";
  }
}

/**
 * Completion budget per action, in tokens.
 *
 * This is a RESERVATION, and Groq bills the reservation — not the usage —
 * against its tokens-per-minute limit. A single 8192 reservation therefore
 * exceeded the free tier's 8000 TPM ceiling on its own, which made EVERY
 * `parse-description` call fail with a 413 no matter how short the input was.
 * Keep `prompt + budget` under the plan's TPM limit for every action Groq
 * serves.
 *
 * `parse-receipt` deliberately keeps the full 8192: a long receipt's JSON
 * genuinely needs the headroom, and a receipt image costs thousands of prompt
 * tokens anyway, so no reservation makes Groq viable for receipts on the free
 * tier. Gemini leads that path, so this costs nothing today.
 *
 * `transcribe` has no entry — it goes to ElevenLabs or Whisper, neither of
 * which takes a completion budget.
 */
const COMPLETION_BUDGET: Readonly<Record<string, number>> = {
  "parse-description": 2048,
  "classify-category": 512,
  "parse-receipt": 8192,
};

/**
 * Budget for an action absent from the map. Deliberately the small one, so a
 * future action cannot silently inherit the 8192 reservation that caused the
 * outage this module exists to prevent.
 */
const DEFAULT_COMPLETION_BUDGET = 2048;

/**
 * The completion budget for this action, clamped by `ai_max_completion_tokens`
 * when set. A ceiling rather than a replacement: the operational need it
 * serves is "we are hitting a rate limit, lower everything now".
 */
export function resolveCompletionBudget(
  action: string,
  config: Map<string, unknown>,
): number {
  const base = COMPLETION_BUDGET[action] ?? DEFAULT_COMPLETION_BUDGET;
  // configInt returns the fallback unless the value is a positive integer, so
  // 0 doubles as "no ceiling configured".
  const ceiling = configInt(config, "ai_max_completion_tokens", 0);
  return ceiling > 0 ? Math.min(base, ceiling) : base;
}
