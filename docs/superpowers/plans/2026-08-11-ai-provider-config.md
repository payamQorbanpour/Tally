# AI Provider Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the 100%-failing `parse-description` path by right-sizing Groq's completion-token reservation and giving text-only calls a Gemini fallback, with the provider order and every model changeable from SQL without a deploy.

**Architecture:** A new dependency-free module `supabase/functions/_shared/aiProviders.ts` owns three pure decisions — provider order, model per provider, completion budget per action. `ai-proxy`'s `chatWithFallback` stops hard-coding its attempt list and walks the resolved order instead. Four new `app_config` keys make all of it changeable from SQL; all are absent by default, and absent means "use the code default".

**Tech Stack:** TypeScript, Deno (Supabase Edge Functions), Vitest (Node), PostgreSQL, Supabase CLI.

**Spec:** `docs/superpowers/specs/2026-08-11-ai-provider-config-design.md`

## Global Constraints

- **`_shared` modules must stay dependency-free** — no `Deno.*`, no `npm:` imports, no `jsr:` imports. `vitest.config.ts` includes `supabase/functions/**/*.test.ts` and runs them under Node, so any Deno-only import breaks the test run. Env access is passed in as a parameter, never imported.
- **API keys stay Supabase project secrets.** Nothing in this plan puts a credential in the database.
- **Absent config means "use the code default."** Every new key is unseeded. An empty `app_config` must behave exactly as the shipped code does.
- **The OpenAI-compatible provider slot is named `groq`** in config strings and code. It is really "whatever `AI_BASE_URL` points at"; the name is chosen for readability in incident-time SQL.
- **Imports between Edge Function modules use the `.ts` extension** (`from "./appConfigResolve.ts"`) because Deno requires it. Vite resolves the explicit extension fine, so tests import without it (`from "./aiProviders"`), matching `appConfigResolve.test.ts`.
- **Run tests with `npm test`** (`vitest run`).

---

### Task 1: `aiProviders.ts` — provider order, model, and budget resolution

**Files:**
- Create: `supabase/functions/_shared/aiProviders.ts`
- Create: `supabase/functions/_shared/aiProviders.test.ts`

**Interfaces:**
- Consumes: `configInt`, `configStr` from `supabase/functions/_shared/appConfigResolve.ts` (existing).
- Produces, relied on by Task 2:
  - `type ProviderName = "groq" | "gemini" | "openai"`
  - `type RequestKind = "text" | "image"`
  - `type EnvLookup = (name: string) => string`
  - `parseProviderOrder(raw: string): ProviderName[]`
  - `resolveProviderOrder(config: Map<string, unknown>, kind: RequestKind): ProviderName[]`
  - `resolveModel(provider: ProviderName, kind: RequestKind, config: Map<string, unknown>, env: EnvLookup): string`
  - `resolveCompletionBudget(action: string, config: Map<string, unknown>): number`

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/aiProviders.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  parseProviderOrder,
  resolveCompletionBudget,
  resolveModel,
  resolveProviderOrder,
} from "./aiProviders";

/** Config map built from a plain object, mirroring what `resolveConfig` returns. */
function cfg(entries: Record<string, unknown> = {}): Map<string, unknown> {
  return new Map(Object.entries(entries));
}

/** Env lookup backed by a plain object; unset names return "" like `env()` does. */
function envFrom(vars: Record<string, string> = {}): (name: string) => string {
  return (name) => vars[name] ?? "";
}

describe("parseProviderOrder", () => {
  it("parses a comma-separated list in order", () => {
    expect(parseProviderOrder("groq,gemini")).toEqual(["groq", "gemini"]);
  });

  it("tolerates whitespace and casing", () => {
    expect(parseProviderOrder("  GEMINI , groq ")).toEqual(["gemini", "groq"]);
  });

  it("drops unknown names instead of failing", () => {
    expect(parseProviderOrder("gemini,nope,groq")).toEqual(["gemini", "groq"]);
  });

  it("collapses a repeated provider to its first occurrence", () => {
    expect(parseProviderOrder("groq,gemini,groq")).toEqual(["groq", "gemini"]);
  });

  it("returns empty when nothing is recognisable", () => {
    expect(parseProviderOrder("  ,,typo ")).toEqual([]);
  });
});

describe("resolveProviderOrder", () => {
  it("defaults text to groq then gemini", () => {
    expect(resolveProviderOrder(cfg(), "text")).toEqual(["groq", "gemini"]);
  });

  it("defaults image to gemini then groq", () => {
    expect(resolveProviderOrder(cfg(), "image")).toEqual(["gemini", "groq"]);
  });

  it("honours a configured text order", () => {
    const config = cfg({ ai_provider_order_text: "gemini,groq" });
    expect(resolveProviderOrder(config, "text")).toEqual(["gemini", "groq"]);
  });

  it("honours a configured image order", () => {
    const config = cfg({ ai_provider_order_image: "groq" });
    expect(resolveProviderOrder(config, "image")).toEqual(["groq"]);
  });

  it("falls back to the default when the configured order is unusable", () => {
    const config = cfg({ ai_provider_order_text: "typo,alsotypo" });
    expect(resolveProviderOrder(config, "text")).toEqual(["groq", "gemini"]);
  });

  it("does not let one path's key affect the other", () => {
    const config = cfg({ ai_provider_order_text: "gemini" });
    expect(resolveProviderOrder(config, "image")).toEqual(["gemini", "groq"]);
  });
});

describe("resolveModel", () => {
  const env = envFrom({
    AI_MODEL: "openai/gpt-oss-120b",
    AI_RECEIPT_MODEL: "qwen/qwen3.6-27b",
    GEMINI_MODEL: "gemini-flash-latest",
    OPENAI_RECEIPT_MODEL: "gpt-4o-mini",
  });

  it("uses AI_MODEL for groq text", () => {
    expect(resolveModel("groq", "text", cfg(), env)).toBe("openai/gpt-oss-120b");
  });

  it("uses AI_RECEIPT_MODEL for groq image", () => {
    expect(resolveModel("groq", "image", cfg(), env)).toBe("qwen/qwen3.6-27b");
  });

  it("falls back to AI_MODEL when AI_RECEIPT_MODEL is unset", () => {
    const partial = envFrom({ AI_MODEL: "openai/gpt-oss-120b" });
    expect(resolveModel("groq", "image", cfg(), partial)).toBe("openai/gpt-oss-120b");
  });

  it("prefers ai_model config over AI_MODEL env", () => {
    const config = cfg({ ai_model: "from-config" });
    expect(resolveModel("groq", "text", config, env)).toBe("from-config");
  });

  it("prefers ai_receipt_model config over AI_RECEIPT_MODEL env", () => {
    const config = cfg({ ai_receipt_model: "vision-from-config" });
    expect(resolveModel("groq", "image", config, env)).toBe("vision-from-config");
  });

  it("uses GEMINI_MODEL for gemini, for both kinds", () => {
    expect(resolveModel("gemini", "text", cfg(), env)).toBe("gemini-flash-latest");
    expect(resolveModel("gemini", "image", cfg(), env)).toBe("gemini-flash-latest");
  });

  it("prefers ai_gemini_model config over GEMINI_MODEL env", () => {
    const config = cfg({ ai_gemini_model: "gemini-from-config" });
    expect(resolveModel("gemini", "text", config, env)).toBe("gemini-from-config");
  });

  it("falls back to a literal default when gemini env is unset", () => {
    expect(resolveModel("gemini", "text", cfg(), envFrom())).toBe("gemini-flash-latest");
  });

  it("uses OPENAI_RECEIPT_MODEL for openai", () => {
    expect(resolveModel("openai", "text", cfg(), env)).toBe("gpt-4o-mini");
  });
});

describe("resolveCompletionBudget", () => {
  it("gives parse-description a budget that fits under an 8000 TPM limit", () => {
    expect(resolveCompletionBudget("parse-description", cfg())).toBe(2048);
  });

  it("gives classify-category the smallest budget", () => {
    expect(resolveCompletionBudget("classify-category", cfg())).toBe(512);
  });

  it("keeps the full budget for parse-receipt", () => {
    expect(resolveCompletionBudget("parse-receipt", cfg())).toBe(8192);
  });

  it("gives an unmapped action the small default, never 8192", () => {
    expect(resolveCompletionBudget("some-future-action", cfg())).toBe(2048);
  });

  it("clamps down to the configured ceiling", () => {
    const config = cfg({ ai_max_completion_tokens: 1024 });
    expect(resolveCompletionBudget("parse-receipt", config)).toBe(1024);
    expect(resolveCompletionBudget("parse-description", config)).toBe(1024);
  });

  it("never raises a budget above its per-action default", () => {
    const config = cfg({ ai_max_completion_tokens: 100000 });
    expect(resolveCompletionBudget("classify-category", config)).toBe(512);
  });

  it("ignores a ceiling that is not a positive integer", () => {
    expect(resolveCompletionBudget("parse-description", cfg({ ai_max_completion_tokens: 0 }))).toBe(2048);
    expect(resolveCompletionBudget("parse-description", cfg({ ai_max_completion_tokens: -5 }))).toBe(2048);
    expect(resolveCompletionBudget("parse-description", cfg({ ai_max_completion_tokens: "1024" }))).toBe(2048);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- aiProviders`

Expected: FAIL — `Failed to resolve import "./aiProviders"`. If it instead fails on `./appConfigResolve.ts` once Step 3 lands, the `.ts` extension is not resolving under Vite; the fix is to inline the two helpers rather than import them.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/aiProviders.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- aiProviders`
Expected: PASS, 30 tests.

- [ ] **Step 5: Run the whole suite to check nothing regressed**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/aiProviders.ts supabase/functions/_shared/aiProviders.test.ts
git commit -m "feat(ai-proxy): add provider order, model, and budget resolution

Groq bills max_completion_tokens as reserved TPM, so a single 8192
reservation exceeded the free tier's 8000 ceiling on its own. Budgets are
now per-action, and provider order is resolved from config so a failing
provider can be swapped without a deploy."
```

---

### Task 2: Rewire `ai-proxy` onto the resolver

**Files:**
- Modify: `supabase/functions/ai-proxy/index.ts` — remove `MAX_COMPLETION_TOKENS` (line 356), thread `maxTokens` through `callChatCompletions` (line 385) and `callGemini` (line 486), rewrite `chatWithFallback` (line 554), update the three handlers (lines 724, 782, 841).

**Interfaces:**
- Consumes from Task 1: `resolveProviderOrder`, `resolveModel`, `resolveCompletionBudget`, `type ProviderName`, `type RequestKind`.
- Produces: no new exports. `chatWithFallback`'s new signature is `{ messages, kind, action, config }`.

There is no unit test for this task — the file imports `npm:` and `Deno.*`, so Vitest cannot load it (that is exactly why the logic lives in Task 1's module). Verification is a type check plus the live check in Task 4.

- [ ] **Step 1: Add the import**

At the end of the existing `_shared` import block near line 51, add:

```ts
import {
  resolveCompletionBudget,
  resolveModel,
  resolveProviderOrder,
  type ProviderName,
  type RequestKind,
} from "../_shared/aiProviders.ts";
```

- [ ] **Step 2: Replace the `MAX_COMPLETION_TOKENS` constant with a doc pointer**

Delete the `const MAX_COMPLETION_TOKENS = 8192;` declaration and its comment block (lines ~345-356), replacing them with:

```ts
// The completion-token budget now varies per action and is resolved by
// `resolveCompletionBudget` in ../_shared/aiProviders.ts, which documents why
// it must stay under the provider's per-minute token limit. It is threaded
// through as `maxTokens` below.
```

- [ ] **Step 3: Thread `maxTokens` through `callChatCompletions`**

In the `opts` type of `callChatCompletions`, add after `responseJson?: boolean;`:

```ts
  /** Completion budget in tokens. Sent only when `tuneReasoning` is set. */
  maxTokens: number;
```

Then change the `tuneReasoning` spread in the request body from `max_completion_tokens: MAX_COMPLETION_TOKENS` to:

```ts
      ...(opts.tuneReasoning
        ? { max_completion_tokens: opts.maxTokens, ...reasoningParams(opts.model) }
        : {}),
```

- [ ] **Step 4: Thread `maxTokens` through `callGemini`**

In the `opts` type of `callGemini`, add after `temperature?: number;`:

```ts
  /** Completion budget in tokens, mapped to Gemini's `maxOutputTokens`. */
  maxTokens: number;
```

Then in `generationConfig`, change `maxOutputTokens: MAX_COMPLETION_TOKENS` to:

```ts
          maxOutputTokens: opts.maxTokens,
```

- [ ] **Step 5: Rewrite `chatWithFallback`**

Replace the whole function (its doc comment included) with:

```ts
/**
 * Run a chat completion against the first configured provider that works, in
 * the order `resolveProviderOrder` returns for this request kind.
 *
 * This genuinely fails over: each provider is tried in turn and an error moves
 * on to the next, rather than one bad response taking AI down for everyone.
 * The last error is rethrown when every provider fails, so `detail` on the 502
 * still names a real cause.
 *
 * The order is config-driven so a provider that starts refusing traffic can be
 * demoted with one SQL UPDATE instead of a deploy — which is what this
 * function's own history argues for: a text-only path with a single provider
 * failed 100% of the time the moment that provider rate-limited it.
 */
async function chatWithFallback(opts: {
  messages: ChatMessage[];
  kind: RequestKind;
  action: string;
  config: Map<string, unknown>;
}): Promise<string> {
  const order = resolveProviderOrder(opts.config, opts.kind);
  const maxTokens = resolveCompletionBudget(opts.action, opts.config);

  const attempts: { name: ProviderName; run: () => Promise<string> }[] = [];
  for (const name of order) {
    const model = resolveModel(name, opts.kind, opts.config, env);

    if (name === "gemini") {
      const apiKey = env("GEMINI_API_KEY");
      if (apiKey) {
        attempts.push({
          name,
          run: () => callGemini({ apiKey, model, messages: opts.messages, maxTokens }),
        });
      }
      continue;
    }

    if (name === "groq") {
      const baseUrl = env("AI_BASE_URL");
      if (baseUrl) {
        attempts.push({
          name,
          run: () =>
            callChatCompletions({
              baseUrl,
              apiKey: env("AI_API_KEY") || null,
              model,
              messages: opts.messages,
              maxTokens,
              tuneReasoning: true,
            }),
        });
      }
      continue;
    }

    const oai = env("OPENAI_API_KEY");
    if (oai) {
      attempts.push({
        name,
        run: () =>
          callChatCompletions({
            baseUrl: "https://api.openai.com/v1",
            apiKey: oai,
            model,
            messages: opts.messages,
            maxTokens,
          }),
      });
    }
  }

  if (attempts.length === 0) throw new Error("no_chat_provider_configured");

  let lastError: unknown = null;
  for (const attempt of attempts) {
    try {
      return await attempt.run();
    } catch (e) {
      lastError = e;
      // Worth a log line: a silent failover hides a provider that is down for
      // every request while users still get answers from the next one. The
      // provider name is included because "which one failed" was the first
      // question asked of this log during the TPM outage.
      console.warn("chat_provider_failed", attempt.name, e instanceof Error ? e.message : String(e));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
```

- [ ] **Step 6: Update `handleParseReceipt`**

Replace its `chatWithFallback` call (the `const text = await chatWithFallback({...})` block near line 768) with:

```ts
  const text = await chatWithFallback({
    messages,
    // Always an image — this is the receipt scanner.
    kind: "image",
    action: "parse-receipt",
    config,
  });
```

- [ ] **Step 7: Update `handleParseDescription`**

Replace its `chatWithFallback` call (near line 822) with:

```ts
  const text = await chatWithFallback({
    messages: [
      { role: "system", content: sys },
      { role: "user", content: userContent },
    ],
    kind: images.length > 0 ? "image" : "text",
    action: "parse-description",
    config,
  });
```

- [ ] **Step 8: Update `handleClassifyCategory`**

Replace its `chatWithFallback` call (near line 852) with:

```ts
    const text = await chatWithFallback({
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `Title: ${title}` },
      ],
      kind: "text",
      action: "classify-category",
      config,
    });
```

- [ ] **Step 9: Confirm no stale references remain**

Run:

```bash
grep -n "MAX_COMPLETION_TOKENS\|primaryModel\|openAiModel" supabase/functions/ai-proxy/index.ts
```

Expected: no output. If `configStr` is now unused in `handleParseReceipt`, leave the import alone — `handleParseDescription` and `handleClassifyCategory` still use it.

- [ ] **Step 10: Type-check the function**

Run: `npx --yes deno@2 check supabase/functions/ai-proxy/index.ts`

Expected: no errors. This downloads Deno and the `npm:`/`jsr:` dependencies on first run, so allow a few minutes. If Deno cannot be installed in this environment, skip it and rely on the deploy in Task 4 Step 4 to surface errors — but say so explicitly rather than claiming the check passed.

- [ ] **Step 11: Run the suite**

Run: `npm test`
Expected: PASS. Nothing here is covered by Vitest, but `src/core/aiCreditCost.ts`'s test greps this file for the `FREE_ACTIONS` list, so a bad edit to that region shows up here.

- [ ] **Step 12: Commit**

```bash
git add supabase/functions/ai-proxy/index.ts
git commit -m "fix(ai-proxy): resolve provider order and token budget per request

Text-only calls had exactly one provider — Gemini was gated behind
hasImages and OPENAI_API_KEY is unset — so a Groq rate-limit failed them
100% of the time with no failover. Order now comes from config, defaulting
to groq,gemini for text and gemini,groq for images, and the completion
budget is per-action so the reservation stops blowing the TPM ceiling."
```

---

### Task 3: Register the four config keys

**Files:**
- Create: `supabase/migrations/20260811000000_ai_provider_config.sql`

**Interfaces:**
- Consumes: `public.app_config_keys`, created by `20260804010000_app_config.sql`. That migration is **not yet applied to production** — Task 4 applies it first.
- Produces: the keys `ai_provider_order_text`, `ai_provider_order_image`, `ai_gemini_model`, `ai_max_completion_tokens`, readable by `loadConfigRows` in `ai-proxy`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260811000000_ai_provider_config.sql`:

```sql
-- Registers the four keys that make AI provider order, the Gemini model, and
-- the completion-token ceiling changeable from SQL, extending the registry
-- created by 20260804010000_app_config.sql. Follows the shape of
-- 20260805000000_onboarding_tour_config.sql, minus its seed block.
--
-- NO values are seeded into app_config, deliberately. Absent means "use the
-- code default" for all four, and the shipped defaults already carry the fix
-- these keys exist to make repeatable without a deploy — see
-- docs/superpowers/specs/2026-08-11-ai-provider-config-design.md. Seeding
-- would freeze today's provider list into the table, so a later change to the
-- code default would silently do nothing.
--
-- All four are 'server'. A client that could read the provider order learns
-- little, but one that could read a token ceiling learns exactly what to stay
-- under — same posture as ai_rate_limit_per_min.

insert into public.app_config_keys (key, value_type, max_visibility, description) values
  ('ai_provider_order_text', 'string', 'server',
   'Comma-separated upstream order for text-only AI calls, e.g. "groq,gemini". Unknown names are ignored. Unset = groq,gemini.'),
  ('ai_provider_order_image', 'string', 'server',
   'Comma-separated upstream order for AI calls carrying images, e.g. "gemini,groq". Unknown names are ignored. Unset = gemini,groq.'),
  ('ai_gemini_model', 'string', 'server',
   'Override for GEMINI_MODEL. Unset = use the env value.'),
  ('ai_max_completion_tokens', 'integer', 'server',
   'Ceiling clamped over every action''s completion-token reservation. Groq bills the reservation against its per-minute token limit, so lowering this is the lever when calls fail with 413 rate_limit_exceeded. Unset = per-action defaults.')
on conflict (key) do nothing;
```

- [ ] **Step 2: Check the row count is what you meant to write**

Run:

```bash
grep -c "^  ('ai_" supabase/migrations/20260811000000_ai_provider_config.sql
```

Expected: `4`. The migration is not executed here — Task 4 Step 2 is the first real run, against production.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260811000000_ai_provider_config.sql
git commit -m "feat(config): register AI provider order and token ceiling keys

Registry rows only, no seeded values: absent means 'use the code default',
so applying this changes nothing observable and the keys exist purely as an
override surface."
```

---

### Task 4: Apply migrations, deploy, and verify against the live API

**Files:** none — this task changes production state, not the repository.

**Interfaces:**
- Consumes: everything from Tasks 1-3.
- Produces: a working `parse-description`.

Read before starting: production has only four migrations recorded as applied (`20260424000000`, `20260428000000`, `20260428000001`, `20260807000000`), while ten more were applied by hand and never recorded. All ten are idempotent by construction — verified: every `create policy` has a preceding `drop policy if exists`, every `add column` is `if not exists`, every table is `create table if not exists`, and the one `create trigger` has a preceding `drop trigger if exists`. `db push` therefore replays them harmlessly and repairs the ledger.

**This task touches production. Steps 2 and 4 are the irreversible ones — stop and get the human's confirmation before each, showing them the dry-run output first.**

- [ ] **Step 1: Dry-run the migration push**

Run: `supabase db push --dry-run`

Expected: a list of eleven pending migrations — the ten unapplied ones plus `20260811000000_ai_provider_config`. Show this list to the human and get explicit confirmation before Step 2.

- [ ] **Step 2: Apply the migrations**

Run: `supabase db push`

Expected: all eleven apply without error. If one fails, STOP — do not retry and do not proceed to the deploy. Report which migration failed and its error.

- [ ] **Step 3: Verify the schema landed**

Run:

```bash
supabase db query --linked "select key, value_type, max_visibility from public.app_config_keys where key like 'ai_provider%' or key in ('ai_gemini_model','ai_max_completion_tokens') order by key;"
```

Expected: exactly four rows — `ai_gemini_model` (string/server), `ai_max_completion_tokens` (integer/server), `ai_provider_order_image` (string/server), `ai_provider_order_text` (string/server).

Then confirm nothing was seeded:

```bash
supabase db query --linked "select count(*) as seeded from public.app_config where key like 'ai_provider%' or key in ('ai_gemini_model','ai_max_completion_tokens');"
```

Expected: `0`.

- [ ] **Step 4: Deploy the function**

Run: `make ai-proxy-deploy`

Use `ai-proxy-deploy`, **not** `make ai-proxy` — the latter also re-pushes secrets from `.env`, and `.env` has no `AI_BASE_URL` or `AI_API_KEY`, so there is no reason to touch project secrets here.

Expected: deploy succeeds.

- [ ] **Step 5: Verify against the live API**

Ask the human to open the app, go to Add with AI, type a short expense such as `I paid 80 Toman for Bastani`, and tap Analyze.

Expected: a parsed expense, no error banner.

Then confirm the logs are clean. In the Supabase dashboard, Edge Functions → `ai-proxy` → Logs, for the minute of that call:

- Expected: **no** `chat_provider_failed` line.
- Expected: **no** `ai_config_read_failed` line — the table now exists, so this warning must be gone. Its continued presence means the push did not take effect for the running instance; the module-scope config cache holds 30s, so retry once after a minute before investigating.

- [ ] **Step 6: Record the outcome**

If verification passed, no code change is needed. If `chat_provider_failed` still appears, capture the verbatim message — it names the real cause — and treat this plan's hypothesis as unconfirmed rather than editing further. The fix rests on a claim only the live API can settle: that Groq counts the reservation against TPM.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
| --- | --- |
| Provider selection module, three pure functions | Task 1 |
| Edge cases: unknown dropped, empty falls back, duplicates collapsed, unconfigured skipped, last error rethrown | Task 1 (first three), Task 2 Step 5 (last two) |
| `groq` naming rationale | Task 1 Step 3 doc comment |
| Four config keys | Task 3 |
| Per-action token budget; receipt stays 8192; `transcribe` absent; unmapped action default | Task 1 |
| Ceiling semantics (`min`, not replace) | Task 1 |
| `chatWithFallback` rewired | Task 2 |
| `db push` safety argument | Task 4 preamble |
| New migration registers keys, seeds nothing | Task 3, verified Task 4 Step 3 |
| Testing: order parsing, model resolution, budget clamping | Task 1 Step 1 |
| Live verification is the only way to confirm the TPM claim | Task 4 Steps 5-6 |
| Sequencing | Task order; Task 4 preamble notes deploy alone fixes the outage |

**Placeholder scan:** none. Every code step carries the literal code.

**Type consistency:** `resolveProviderOrder(config, kind)`, `resolveModel(provider, kind, config, env)`, `resolveCompletionBudget(action, config)` — argument order identical in Task 1's implementation, Task 1's tests, and Task 2 Step 5's call sites. `ProviderName` and `RequestKind` are imported as types in Task 2 and used in the `attempts` array and the `opts` shape. `maxTokens` is the parameter name in `callChatCompletions`, `callGemini`, and both call sites.

**Known gap:** Task 2 has no automated test, because the module it edits cannot load under Vitest. This is mitigated by keeping every decision in Task 1's tested module and by the Task 4 Step 5 live check, but a mistake in the wiring itself — a swapped `kind`, a dropped `config` — would reach production. Reviewing Task 2's diff carefully matters more than usual.
