# AI Remote Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the AI section a remote kill switch (master + per action), cohort-based rollout, and runtime-tunable limits/models/prompts, enforced server-side in `ai-proxy`.

**Architecture:** An `ai_config` table holds `(key, cohort) → value` rows. A dependency-free resolver picks the winning row per key using precedence `allowlist → alpha → premium → everyone`. A new `get-ai-config` Edge Function returns only client-visible keys to the app; `ai-proxy` reads the same table with the service-role key and enforces independently, so a stale or tampered client is never a bypass. The client fails open to bundled defaults.

**Tech Stack:** Supabase (Postgres + RLS + Deno Edge Functions), React Native / Expo, TypeScript, Vitest, AsyncStorage.

**Spec:** `docs/superpowers/specs/2026-08-04-ai-remote-config-design.md`

## Global Constraints

- **Edge Function modules that have a `.test.ts` must be dependency-free** — no `Deno.*`, no `npm:` imports. `vitest.config.ts` runs them under Node. This is why resolution logic lives in `_shared/aiConfigResolve.ts` and all I/O stays in `index.ts`.
- **Vitest include globs** are `src/**/*.test.ts` and `supabase/functions/**/*.test.ts`. Test command is `npm test` (`vitest run`).
- **Clients get no direct table access.** All config reads go through Edge Functions using the service-role key. Same posture as `ai_credit_balances` in `20260801000000_ai_credits.sql`.
- **Prompts and model ids are never `client_visible`.** They are product IP and exposing them eases prompt injection.
- **The config check must run before billing** in `ai-proxy`, so a disabled action never spends a credit.
- **Three locales must be updated together:** `en`, `fa`, `es` in `src/i18n/translations.ts`, plus the `MessageTree` type declaration. `fa` is RTL.
- **Migration filenames** are `supabase/migrations/YYYYMMDDHHMMSS_name.sql`. This one is `20260804000000_ai_config.sql`.
- **Lint after every file change:** `npm run lint` (`expo lint`).
- **The seed must be a behavioural no-op** — every key seeded at today's effective value.

---

### Task 1: Config tables, RLS, and no-op seed

**Files:**
- Create: `supabase/migrations/20260804000000_ai_config.sql`
- Create: `supabase/scripts/set-ai-flag.sql`
- Create: `supabase/scripts/test_ai_config.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: tables `public.ai_config (key text, cohort text, value jsonb, client_visible boolean, updated_at timestamptz)` and `public.ai_config_allowlist (key text, user_id uuid)`. Later tasks read these with the service-role key.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260804000000_ai_config.sql`:

```sql
-- Remote config for the AI section — kill switches, cohort rollout, and
-- runtime tuning of limits/models/prompts.
--
-- Rows are keyed by (key, cohort). Resolution picks the most specific
-- matching cohort: allowlist > alpha > premium > everyone. A key with only
-- an `everyone` row behaves globally.
--
-- Clients never read these tables directly. `get-ai-config` returns only
-- `client_visible` keys, and `ai-proxy` enforces from the same rows with the
-- service-role key. A client that could write here could re-enable a killed
-- feature or raise its own rate limit, which is the whole threat model —
-- same posture as ai_credit_balances in 20260801000000_ai_credits.sql.

create table if not exists public.ai_config (
  key            text        not null,
  cohort         text        not null default 'everyone'
                   check (cohort in ('everyone', 'premium', 'alpha', 'allowlist')),
  value          jsonb       not null,
  -- Prompts and provider params must never reach the shipped bundle. An
  -- explicit column rather than a naming convention, so the client/server
  -- boundary is auditable in one query.
  client_visible boolean     not null default false,
  updated_at     timestamptz not null default now(),
  primary key (key, cohort)
);

create table if not exists public.ai_config_allowlist (
  key     text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (key, user_id)
);

create index if not exists ai_config_allowlist_user_idx
  on public.ai_config_allowlist (user_id);

alter table public.ai_config            enable row level security;
alter table public.ai_config_allowlist  enable row level security;

-- No policies are defined on purpose. RLS with zero policies denies every
-- anon/authenticated request. The service-role key bypasses RLS, which is
-- how the Edge Functions read these rows.
revoke all on public.ai_config           from anon, authenticated;
revoke all on public.ai_config_allowlist from anon, authenticated;

-- ─────────────────────────── Seed ───────────────────────────
-- Every key at its CURRENT effective behaviour, so applying this migration
-- changes nothing observable. Numeric defaults mirror the ai-proxy env
-- fallbacks (AI_RATE_LIMIT_PER_MIN=20, AI_RATE_LIMIT_TRANSCRIBE_PER_MIN=10)
-- and the client's existing hardcoded thresholds: 4_000_000 base64 chars in
-- `downscaleReceiptImage.ts:37`. Do NOT "round up" to 4 MiB (4194304) — that
-- would silently change the downscale threshold and break the no-op property.
--
-- Provider params (models, prompts) are intentionally NOT seeded: absent
-- means "fall back to the Deno.env value", which is exactly today's
-- behaviour. Seeding them would freeze the current secret values into the
-- table and silently break `supabase secrets set`.

insert into public.ai_config (key, cohort, value, client_visible) values
  ('ai_enabled',                   'everyone', 'true'::jsonb,    true),
  ('ai_action_parse_receipt',      'everyone', 'true'::jsonb,    true),
  ('ai_action_parse_description',  'everyone', 'true'::jsonb,    true),
  ('ai_action_classify_category',  'everyone', 'true'::jsonb,    true),
  ('ai_action_transcribe',         'everyone', 'true'::jsonb,    true),
  ('ai_max_image_bytes',           'everyone', '4000000'::jsonb, true),
  ('ai_max_audio_seconds',         'everyone', '120'::jsonb,     true),
  ('ai_rate_limit_per_min',        'everyone', '20'::jsonb,      false),
  ('ai_rate_limit_transcribe_per_min', 'everyone', '10'::jsonb,  false)
on conflict (key, cohort) do nothing;
```

- [ ] **Step 2: Write the authoring script**

Create `supabase/scripts/set-ai-flag.sql`:

```sql
-- Change an AI config value. Run from the Supabase SQL editor.
-- Follows the same "edit the placeholders, then run" shape as
-- grant-reviewer-ai-access.sql.
--
-- Examples:
--   kill voice input for everyone:
--     key 'ai_action_transcribe', cohort 'everyone', value 'false'
--   enable a new action for alpha testers only:
--     key 'ai_action_parse_description', cohort 'alpha', value 'true'
--   raise the rate limit for premium users:
--     key 'ai_rate_limit_per_min', cohort 'premium', value '60'
--
-- `value` is JSONB: booleans are true/false, numbers are bare, strings need
-- double quotes ('"gpt-4o-mini"').

insert into public.ai_config (key, cohort, value, client_visible)
values (
  'ai_action_transcribe',   -- <<< key
  'everyone',               -- <<< cohort: everyone | premium | alpha | allowlist
  'false'::jsonb,           -- <<< value
  true                      -- <<< client_visible: false for models/prompts/rate limits
)
on conflict (key, cohort) do update
  set value = excluded.value,
      client_visible = excluded.client_visible,
      updated_at = now();

-- Add a user to an allowlist-cohort key:
-- insert into public.ai_config_allowlist (key, user_id)
-- values ('ai_action_transcribe', '00000000-0000-0000-0000-000000000000')
-- on conflict do nothing;

select key, cohort, value, client_visible, updated_at
  from public.ai_config
 order by key, cohort;
```

- [ ] **Step 3: Write the SQL verification script**

Create `supabase/scripts/test_ai_config.sql`:

```sql
-- Verification for 20260804000000_ai_config.sql. Run in the SQL editor.
-- Mirrors the shape of test_ai_credits.sql: assertions that raise on failure.

do $$
declare
  n integer;
begin
  -- 1. Seed landed, and the client/server split is what we intended.
  select count(*) into n from public.ai_config where cohort = 'everyone';
  if n <> 9 then
    raise exception 'expected 9 seeded everyone rows, found %', n;
  end if;

  select count(*) into n
    from public.ai_config
   where client_visible and key like 'ai_rate_limit%';
  if n <> 0 then
    raise exception 'rate limits must never be client_visible (found %)', n;
  end if;

  -- 2. RLS is on with zero policies, i.e. deny-all for anon/authenticated.
  select count(*) into n
    from pg_policies
   where schemaname = 'public' and tablename in ('ai_config', 'ai_config_allowlist');
  if n <> 0 then
    raise exception 'expected no RLS policies (deny-all), found %', n;
  end if;

  select count(*) into n
    from pg_class
   where relname in ('ai_config', 'ai_config_allowlist') and relrowsecurity;
  if n <> 2 then
    raise exception 'expected RLS enabled on both tables, found %', n;
  end if;

  raise notice 'ai_config verification passed';
end $$;

-- 3. Manual check — as an authenticated (non-service-role) client this must
--    return zero rows, not an error:
--      set local role authenticated;
--      select count(*) from public.ai_config;  -- expect 0
```

- [ ] **Step 4: Apply the migration locally and run the verification**

Run: `supabase db reset` (or `supabase migration up` against the local stack)
Expected: migration applies with no error.

Then paste `supabase/scripts/test_ai_config.sql` into the local SQL editor, or run:
`psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '"')" -f supabase/scripts/test_ai_config.sql`
Expected: `NOTICE: ai_config verification passed`

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260804000000_ai_config.sql supabase/scripts/set-ai-flag.sql supabase/scripts/test_ai_config.sql
git commit -m "feat(ai-config): add ai_config tables, deny-all RLS, and no-op seed"
```

---

### Task 2: Dependency-free cohort resolver

**Files:**
- Create: `supabase/functions/_shared/aiConfigResolve.ts`
- Test: `supabase/functions/_shared/aiConfigResolve.test.ts`

**Interfaces:**
- Consumes: the row shape from Task 1.
- Produces:
  - `type Cohort = "everyone" | "premium" | "alpha" | "allowlist"`
  - `type ConfigRow = { key: string; cohort: Cohort; value: unknown; client_visible: boolean }`
  - `type CallerCohorts = { premium: boolean; alpha: boolean; allowlistKeys: ReadonlySet<string> }`
  - `resolveConfig(rows: ConfigRow[], caller: CallerCohorts): Map<string, unknown>`
  - `resolveClientConfig(rows: ConfigRow[], caller: CallerCohorts): Record<string, unknown>` — client-visible keys only
  - `configBool(resolved: Map<string, unknown>, key: string, fallback: boolean): boolean`
  - `configInt(resolved: Map<string, unknown>, key: string, fallback: number): number`
  - `configStr(resolved: Map<string, unknown>, key: string, fallback: string): string`
  - `ACTION_FLAG_KEYS: Readonly<Record<string, string>>` — proxy action → flag key

`_shared/` is skipped by the Supabase CLI's function discovery (leading underscore), so it deploys as a shared module rather than its own function. It contains no `Deno.*` and no `npm:` imports so Vitest can run it under Node.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/aiConfigResolve.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  ACTION_FLAG_KEYS,
  configBool,
  configInt,
  configStr,
  resolveClientConfig,
  resolveConfig,
  type CallerCohorts,
  type ConfigRow,
} from "./aiConfigResolve";

const anon: CallerCohorts = { premium: false, alpha: false, allowlistKeys: new Set() };

function row(
  key: string,
  cohort: ConfigRow["cohort"],
  value: unknown,
  client_visible = true,
): ConfigRow {
  return { key, cohort, value, client_visible };
}

describe("resolveConfig precedence", () => {
  it("falls back to the everyone row when no cohort matches", () => {
    const resolved = resolveConfig([row("ai_enabled", "everyone", true)], anon);
    expect(resolved.get("ai_enabled")).toBe(true);
  });

  it("prefers premium over everyone for a premium caller", () => {
    const rows = [row("ai_enabled", "everyone", false), row("ai_enabled", "premium", true)];
    expect(resolveConfig(rows, { ...anon, premium: true }).get("ai_enabled")).toBe(true);
    expect(resolveConfig(rows, anon).get("ai_enabled")).toBe(false);
  });

  it("prefers alpha over premium when the caller is both", () => {
    const rows = [
      row("ai_enabled", "everyone", false),
      row("ai_enabled", "premium", false),
      row("ai_enabled", "alpha", true),
    ];
    expect(resolveConfig(rows, { ...anon, premium: true, alpha: true }).get("ai_enabled")).toBe(true);
  });

  it("prefers allowlist over every other cohort", () => {
    const rows = [
      row("ai_enabled", "everyone", false),
      row("ai_enabled", "premium", false),
      row("ai_enabled", "alpha", false),
      row("ai_enabled", "allowlist", true),
    ];
    const caller: CallerCohorts = {
      premium: true,
      alpha: true,
      allowlistKeys: new Set(["ai_enabled"]),
    };
    expect(resolveConfig(rows, caller).get("ai_enabled")).toBe(true);
  });

  it("ignores an allowlist row when the caller is not on that key's allowlist", () => {
    const rows = [row("ai_enabled", "everyone", false), row("ai_enabled", "allowlist", true)];
    // On the allowlist for a DIFFERENT key — must not leak across keys.
    const caller: CallerCohorts = {
      premium: false,
      alpha: false,
      allowlistKeys: new Set(["ai_action_transcribe"]),
    };
    expect(resolveConfig(rows, caller).get("ai_enabled")).toBe(false);
  });

  it("omits a key that has no matching row", () => {
    const resolved = resolveConfig([row("ai_enabled", "premium", true)], anon);
    expect(resolved.has("ai_enabled")).toBe(false);
  });
});

describe("resolveClientConfig", () => {
  it("returns only client_visible keys", () => {
    const rows = [
      row("ai_enabled", "everyone", true, true),
      row("ai_expense_prompt", "everyone", "secret prompt", false),
    ];
    const client = resolveClientConfig(rows, anon);
    expect(client).toEqual({ ai_enabled: true });
    expect(client).not.toHaveProperty("ai_expense_prompt");
  });

  it("hides a key whose winning row is server-only even if a visible row exists", () => {
    // Guards against a config mistake leaking a prompt to the bundle.
    const rows = [
      row("ai_model", "everyone", "public", true),
      row("ai_model", "premium", "secret", false),
    ];
    expect(resolveClientConfig(rows, { ...anon, premium: true })).toEqual({});
  });
});

describe("coercion helpers", () => {
  it("reads booleans and falls back on wrong types", () => {
    const m = new Map<string, unknown>([["a", true], ["b", "nope"]]);
    expect(configBool(m, "a", false)).toBe(true);
    expect(configBool(m, "b", false)).toBe(false);
    expect(configBool(m, "missing", true)).toBe(true);
  });

  it("reads positive integers and falls back on anything else", () => {
    const m = new Map<string, unknown>([["a", 30], ["b", 0], ["c", -5], ["d", "20"]]);
    expect(configInt(m, "a", 20)).toBe(30);
    expect(configInt(m, "b", 20)).toBe(20);
    expect(configInt(m, "c", 20)).toBe(20);
    expect(configInt(m, "d", 20)).toBe(20);
  });

  it("reads non-empty strings and falls back otherwise", () => {
    const m = new Map<string, unknown>([["a", "x"], ["b", ""], ["c", 5]]);
    expect(configStr(m, "a", "d")).toBe("x");
    expect(configStr(m, "b", "d")).toBe("d");
    expect(configStr(m, "c", "d")).toBe("d");
  });
});

describe("ACTION_FLAG_KEYS", () => {
  it("maps every proxy action to its flag key", () => {
    expect(ACTION_FLAG_KEYS).toEqual({
      "parse-receipt": "ai_action_parse_receipt",
      "parse-description": "ai_action_parse_description",
      "classify-category": "ai_action_classify_category",
      transcribe: "ai_action_transcribe",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/aiConfigResolve.test.ts`
Expected: FAIL — "Failed to resolve import ./aiConfigResolve"

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/aiConfigResolve.ts`:

```ts
/**
 * Cohort resolution for `ai_config` rows.
 *
 * Deliberately dependency-free (no `Deno.*`, no `npm:` imports) so Vitest can
 * run it under Node — the same constraint `admobSsv.ts` and `bazaarApi.ts`
 * follow. All database I/O lives in the calling function's `index.ts`.
 *
 * Shared by `ai-proxy` (enforcement) and `get-ai-config` (client delivery) so
 * the two can never disagree about what a given caller's config is.
 */

export type Cohort = "everyone" | "premium" | "alpha" | "allowlist";

export type ConfigRow = {
  key: string;
  cohort: Cohort;
  value: unknown;
  client_visible: boolean;
};

export type CallerCohorts = {
  premium: boolean;
  alpha: boolean;
  /** Keys this specific user is allowlisted for. Per-key, not global. */
  allowlistKeys: ReadonlySet<string>;
};

/** Most specific first. The first cohort the caller belongs to wins. */
const PRECEDENCE: readonly Cohort[] = ["allowlist", "alpha", "premium", "everyone"];

export const ACTION_FLAG_KEYS: Readonly<Record<string, string>> = {
  "parse-receipt": "ai_action_parse_receipt",
  "parse-description": "ai_action_parse_description",
  "classify-category": "ai_action_classify_category",
  transcribe: "ai_action_transcribe",
};

function callerHasCohort(caller: CallerCohorts, cohort: Cohort, key: string): boolean {
  switch (cohort) {
    case "everyone":
      return true;
    case "premium":
      return caller.premium;
    case "alpha":
      return caller.alpha;
    case "allowlist":
      // Allowlist membership is per key — being listed for one key must not
      // grant the allowlist value of another.
      return caller.allowlistKeys.has(key);
  }
}

/** Pick the winning row per key. Returns the row itself, not just the value. */
function winningRows(rows: ConfigRow[], caller: CallerCohorts): Map<string, ConfigRow> {
  const byKey = new Map<string, ConfigRow[]>();
  for (const r of rows) {
    const list = byKey.get(r.key);
    if (list) list.push(r);
    else byKey.set(r.key, [r]);
  }

  const winners = new Map<string, ConfigRow>();
  for (const [key, candidates] of byKey) {
    for (const cohort of PRECEDENCE) {
      const hit = candidates.find(
        (c) => c.cohort === cohort && callerHasCohort(caller, cohort, key),
      );
      if (hit) {
        winners.set(key, hit);
        break;
      }
    }
    // No matching cohort → key stays absent, and callers fall back to their
    // own default. Absent deliberately means "unset", not "false".
  }
  return winners;
}

export function resolveConfig(rows: ConfigRow[], caller: CallerCohorts): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const [key, row] of winningRows(rows, caller)) out.set(key, row.value);
  return out;
}

/**
 * Client-facing subset. Visibility is taken from the WINNING row, not from
 * any row — so a server-only override cannot be bypassed by a client_visible
 * row at a lower-precedence cohort.
 */
export function resolveClientConfig(
  rows: ConfigRow[],
  caller: CallerCohorts,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, row] of winningRows(rows, caller)) {
    if (row.client_visible) out[key] = row.value;
  }
  return out;
}

export function configBool(
  resolved: Map<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const v = resolved.get(key);
  return typeof v === "boolean" ? v : fallback;
}

export function configInt(resolved: Map<string, unknown>, key: string, fallback: number): number {
  const v = resolved.get(key);
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback;
}

export function configStr(resolved: Map<string, unknown>, key: string, fallback: string): string {
  const v = resolved.get(key);
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/aiConfigResolve.test.ts`
Expected: PASS, 12 tests

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/aiConfigResolve.ts supabase/functions/_shared/aiConfigResolve.test.ts
git commit -m "feat(ai-config): add dependency-free cohort resolver with precedence tests"
```

---

### Task 3: `get-ai-config` Edge Function

**Files:**
- Create: `supabase/functions/get-ai-config/index.ts`
- Modify: `supabase/config.toml` (append a `[functions.get-ai-config]` block)

**Interfaces:**
- Consumes: `resolveClientConfig`, `CallerCohorts`, `ConfigRow` from Task 2; the tables from Task 1.
- Produces: `POST|GET /functions/v1/get-ai-config` returning
  `{ "flags": Record<string, boolean>, "limits": Record<string, number>, "ttlSeconds": 900 }`.

- [ ] **Step 1: Write the function**

Create `supabase/functions/get-ai-config/index.ts`:

```ts
// Returns the caller's resolved, client-visible AI config.
//
// The client never sees the rule set — only the values that apply to it.
// Prompts, model ids, and rate limits are `client_visible = false` and are
// filtered out by `resolveClientConfig`, so they cannot leak here even if a
// client asks for them.
//
// Requires a JWT (verify_jwt = true in config.toml). A signed-out user
// therefore has no server config and keeps the app's bundled defaults; AI is
// gated behind sign-in anyway, and `ai-proxy` rejects anonymous calls.
//
// SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are
// auto-injected by the platform.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import {
  resolveClientConfig,
  type CallerCohorts,
  type ConfigRow,
} from "../_shared/aiConfigResolve.ts";

const TTL_SECONDS = 900; // 15 minutes; the client refreshes on foreground past this.

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function env(name: string): string {
  return (Deno.env.get(name) ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: CORS_HEADERS });
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return jsonResponse(401, { error: "unauthorized" });

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !serviceKey) {
    return jsonResponse(500, { error: "server_misconfigured" });
  }

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return jsonResponse(401, { error: "unauthorized" });
  const userId = userData.user.id;

  const admin = createClient(url, serviceKey);

  // Premium is the same notion ai-proxy uses: `profiles.is_premium` OR an
  // active server-verified pass. Reusing the RPC keeps the two in step.
  const [entitlement, profile, allowlist, rows] = await Promise.all([
    admin.rpc("tally_has_active_entitlement", { p_user_id: userId }),
    admin.from("profiles").select("is_alpha").eq("id", userId).maybeSingle(),
    admin.from("ai_config_allowlist").select("key").eq("user_id", userId),
    admin.from("ai_config").select("key, cohort, value, client_visible"),
  ]);

  if (rows.error) {
    // Fail open: return an empty config and let the client keep its bundled
    // defaults. `ai-proxy` still enforces, so this cannot become a bypass.
    console.warn("ai_config_read_failed", rows.error.message);
    return jsonResponse(200, { flags: {}, limits: {}, ttlSeconds: 60 });
  }

  const caller: CallerCohorts = {
    premium: entitlement.data === true,
    alpha: profile.data?.is_alpha === true,
    allowlistKeys: new Set((allowlist.data ?? []).map((r: { key: string }) => r.key)),
  };

  const resolved = resolveClientConfig((rows.data ?? []) as ConfigRow[], caller);

  // Split by value type so the client has two typed maps rather than one
  // untyped bag. Booleans are flags; numbers are limits.
  const flags: Record<string, boolean> = {};
  const limits: Record<string, number> = {};
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "boolean") flags[key] = value;
    else if (typeof value === "number") limits[key] = value;
    // Anything else is a config mistake for a client-visible key; drop it
    // rather than shipping a shape the client cannot parse.
  }

  return jsonResponse(200, { flags, limits, ttlSeconds: TTL_SECONDS });
});
```

- [ ] **Step 2: Register the function**

Append to `supabase/config.toml`:

```toml
# Returns the caller's resolved, client-visible AI config. JWT required —
# cohort resolution needs a user id, and signed-out clients fall back to
# bundled defaults by design.
[functions.get-ai-config]
verify_jwt = true
```

- [ ] **Step 3: Deploy and verify against the local stack**

Run:
```bash
supabase functions serve get-ai-config
```
In another shell, with `$TOKEN` set to a signed-in user's access token:
```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/get-ai-config \
  -H "Authorization: Bearer $TOKEN" | jq
```
Expected:
```json
{
  "flags": {
    "ai_enabled": true,
    "ai_action_parse_receipt": true,
    "ai_action_parse_description": true,
    "ai_action_classify_category": true,
    "ai_action_transcribe": true
  },
  "limits": { "ai_max_image_bytes": 4000000, "ai_max_audio_seconds": 120 },
  "ttlSeconds": 900
}
```
Critically: **no `ai_rate_limit_per_min` and no prompt keys.** If either appears, `client_visible` filtering is broken — stop and fix before continuing.

Also verify the unauthenticated case:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:54321/functions/v1/get-ai-config
```
Expected: `401`

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/get-ai-config/index.ts supabase/config.toml
git commit -m "feat(ai-config): add get-ai-config function returning client-visible config"
```

---

### Task 4: Enforce config in `ai-proxy`

**Files:**
- Modify: `supabase/functions/ai-proxy/index.ts` (imports at top; `enforceRateLimit` at 145-186; handler at 534-579)

**Interfaces:**
- Consumes: `resolveConfig`, `configBool`, `configInt`, `ACTION_FLAG_KEYS`, `CallerCohorts`, `ConfigRow` from Task 2.
- Produces: two new 403 responses, `{ "error": "ai_disabled" }` and `{ "error": "action_disabled" }`, consumed by Task 8.

The check goes **after** `requireAuthed` and action validation, and **before** `enforceRateLimit`/`spendCredit`, so a disabled action never spends a credit.

- [ ] **Step 1: Add the config loader**

Add to the import block at the top of `supabase/functions/ai-proxy/index.ts` (after the existing `createClient` import on line 38):

```ts
import {
  ACTION_FLAG_KEYS,
  configBool,
  configInt,
  resolveConfig,
  type CallerCohorts,
  type ConfigRow,
} from "../_shared/aiConfigResolve.ts";
```

Then insert this section immediately before the `// ─── Auth + premium + rate limit ───` banner (currently line 82):

```ts
// ────────────────────────── Remote config ──────────────────────────
//
// Config is read per request but cached in module scope for 30s, so a busy
// instance does two DB reads a minute rather than one per call.
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
    .from("ai_config")
    .select("key, cohort, value, client_visible");
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
    .from("ai_config_allowlist")
    .select("key")
    .eq("user_id", userId);
  if (error) {
    console.warn("ai_config_allowlist_read_failed", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r: { key: string }) => r.key));
}

/**
 * `profiles.is_alpha` on its own. `requireAuthed` already reports premium via
 * `tally_has_active_entitlement`, but alpha is a distinct rollout cohort — an
 * alpha tester need not be premium.
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
```

- [ ] **Step 2: Make rate limits config-driven**

In `enforceRateLimit` (line 145), change the signature and the first two lines of the body.

Replace:
```ts
async function enforceRateLimit(
  admin: SupabaseClient,
  userId: string,
  action: string,
  isPremium: boolean,
): Promise<Response | null> {
  const generalLimit = envInt("AI_RATE_LIMIT_PER_MIN", 20);
  const transcribeLimit = envInt("AI_RATE_LIMIT_TRANSCRIBE_PER_MIN", 10);
```

With:
```ts
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
```

- [ ] **Step 3: Wire the gate into the handler**

In the `Deno.serve` handler, replace lines 565-566:

```ts
  const limited = await enforceRateLimit(auth.admin, auth.userId, action, auth.isPremium);
  if (limited) return limited;
```

With:

```ts
  // Break-glass: checked before any DB read, so it still works when the
  // database is the thing that is unhealthy. Needs a redeploy by design.
  if (env("AI_KILL_SWITCH") === "1") {
    return jsonResponse(403, { error: "ai_disabled" });
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
```

- [ ] **Step 4: Verify the gate and the billing order against the local stack**

Run `supabase functions serve ai-proxy` and, with `$TOKEN` set to a **non-premium** user holding at least one credit, and `$DB_URL` set to the local database URL:

```bash
# Baseline: note the starting balance.
psql "$DB_URL" -c "select balance from ai_credit_balances where user_id = '<user-id>';"

# Disable one action.
psql "$DB_URL" -c "update ai_config set value = 'false'::jsonb
                   where key = 'ai_action_parse_receipt' and cohort = 'everyone';"

# Wait out the 30s module cache, then call it.
sleep 31
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"parse-receipt","imageBase64":"x"}' -w '\n%{http_code}\n'
```
Expected: `{"error":"action_disabled","action":"parse-receipt"}` and `403`.

```bash
# The balance must be UNCHANGED — this is the regression that matters.
psql "$DB_URL" -c "select balance from ai_credit_balances where user_id = '<user-id>';"
```
Expected: identical to the baseline.

```bash
# Restore, and confirm the master switch works too.
psql "$DB_URL" -c "update ai_config set value = 'true'::jsonb
                   where key = 'ai_action_parse_receipt' and cohort = 'everyone';"
psql "$DB_URL" -c "update ai_config set value = 'false'::jsonb
                   where key = 'ai_enabled' and cohort = 'everyone';"
sleep 31
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"transcribe"}' -w '\n%{http_code}\n'
```
Expected: `{"error":"ai_disabled"}` and `403`.

Restore `ai_enabled` to `'true'::jsonb` when done.

Finally, confirm the break-glass path. Restart `supabase functions serve ai-proxy` with `AI_KILL_SWITCH=1` in its environment and repeat any call.
Expected: `{"error":"ai_disabled"}` and `403`, even though every table row says enabled.

- [ ] **Step 5: Confirm the existing suite still passes**

Run: `npm test`
Expected: PASS — in particular `src/core/aiCreditCost.test.ts`, whose drift check greps this file and must be unaffected by the edits.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ai-proxy/index.ts
git commit -m "feat(ai-config): enforce kill switches and config rate limits in ai-proxy"
```

---

### Task 5: Config-driven models and prompts in `ai-proxy`

**Files:**
- Modify: `supabase/functions/ai-proxy/index.ts` (the four action handlers between lines 240 and 533)

**Interfaces:**
- Consumes: `configStr` from Task 2; the `config` map built in Task 4.
- Produces: no new external surface. Model ids and prompts now read config first, env second.

This is the "runtime tuning" half of the spec. It is a separate task from Task 4 because a reviewer could reasonably accept the kill switch and reject this — it touches the upstream call path, where Task 4 only gates it.

- [ ] **Step 1: Thread the config map into the action handlers**

Add `configStr` to the import added in Task 4, Step 1. Then give each action handler a `config: Map<string, unknown>` parameter, and pass the `config` value already built in the `Deno.serve` handler at each `case` in the `switch (action)` block (line 582).

Replace each of these exact reads. Config first, env as the fallback — an unseeded key must mean "keep using the secret", so `supabase secrets set` keeps working exactly as before.

**Line 398** (`parse-receipt` primary model):
```ts
    primaryModel: configStr(
      config,
      "ai_receipt_model",
      env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini",
    ),
```

**Line 425** (`parse-description` prompt override):
```ts
  const promptOverride = configStr(config, "ai_expense_prompt", env("AI_EXPENSE_PROMPT"));
```

**Lines 451-452** (`parse-description` model, which branches on whether an image is attached):
```ts
        ? configStr(
            config,
            "ai_receipt_model",
            env("AI_RECEIPT_MODEL") || env("AI_MODEL") || "gpt-4o-mini",
          )
        : configStr(config, "ai_model", env("AI_MODEL") || "gpt-4o-mini"),
```

**Line 462** (`classify-category` system prompt):
```ts
  const sys = configStr(config, "ai_category_prompt", env("AI_CATEGORY_PROMPT") || DEFAULT_CATEGORY_SYSTEM_PROMPT);
```

**Line 470** (`classify-category` model):
```ts
      primaryModel: configStr(config, "ai_model", env("AI_MODEL") || "gpt-4o-mini"),
```

Leave lines 399, 453, and 471 (`openAiModel`, from `OPENAI_RECEIPT_MODEL`) and lines 495 and 514 (`STT_MODEL`, `OPENAI_WHISPER_MODEL`) on env vars. They are fallback-provider and speech-to-text models, not in the spec's key list; adding them would widen scope without a stated need.

- [ ] **Step 2: Verify config overrides the secret**

With `supabase functions serve ai-proxy` running and `$TOKEN` set:

```bash
psql "$DB_URL" -c "insert into public.ai_config (key, cohort, value, client_visible)
                   values ('ai_model', 'everyone', '\"nonexistent-model-xyz\"'::jsonb, false)
                   on conflict (key, cohort) do update set value = excluded.value;"
sleep 31
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-proxy \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"action":"parse-description","text":"lunch 20"}' -w '\n%{http_code}\n'
```
Expected: an upstream error mentioning the bogus model id — proving config beat the env var. A successful parse means the override did not take effect.

Then confirm the key is not leaked to clients:
```bash
curl -s -X POST http://127.0.0.1:54321/functions/v1/get-ai-config \
  -H "Authorization: Bearer $TOKEN" | jq '.flags, .limits'
```
Expected: no `ai_model` in either map.

Clean up:
```bash
psql "$DB_URL" -c "delete from public.ai_config where key = 'ai_model';"
```

- [ ] **Step 3: Confirm the suite still passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/ai-proxy/index.ts
git commit -m "feat(ai-config): read models and prompts from config with env fallback"
```

---

### Task 6: Client config module (pure)

**Files:**
- Create: `src/core/aiConfig.ts`
- Test: `src/core/aiConfig.test.ts`

**Interfaces:**
- Consumes: the `get-ai-config` response shape from Task 3; `AiProxyAction` from `./aiCreditCost`.
- Produces:
  - `type AiConfig = { aiEnabled: boolean; actions: Record<AiProxyAction, boolean>; maxImageBytes: number; maxAudioSeconds: number }`
  - `DEFAULT_AI_CONFIG: AiConfig`
  - `parseAiConfig(input: unknown): AiConfig`
  - `isActionEnabled(config: AiConfig, action: AiProxyAction): boolean`

- [ ] **Step 1: Write the failing test**

Create `src/core/aiConfig.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_AI_CONFIG, isActionEnabled, parseAiConfig } from "./aiConfig";

describe("DEFAULT_AI_CONFIG", () => {
  it("is fully enabled, so a client that never reaches the server still works", () => {
    expect(DEFAULT_AI_CONFIG.aiEnabled).toBe(true);
    expect(Object.values(DEFAULT_AI_CONFIG.actions).every(Boolean)).toBe(true);
  });
});

describe("parseAiConfig", () => {
  it("reads a well-formed payload", () => {
    const config = parseAiConfig({
      flags: { ai_enabled: true, ai_action_transcribe: false },
      limits: { ai_max_image_bytes: 1024, ai_max_audio_seconds: 30 },
    });
    expect(config.aiEnabled).toBe(true);
    expect(config.actions.transcribe).toBe(false);
    expect(config.actions["parse-receipt"]).toBe(true); // absent → default
    expect(config.maxImageBytes).toBe(1024);
    expect(config.maxAudioSeconds).toBe(30);
  });

  it("falls back PER KEY rather than discarding the whole config", () => {
    // The point of this test: one bad key must not cost us the good ones.
    const config = parseAiConfig({
      flags: { ai_enabled: false, ai_action_transcribe: "yes" },
      limits: { ai_max_image_bytes: -1 },
    });
    expect(config.aiEnabled).toBe(false); // good key honoured
    expect(config.actions.transcribe).toBe(true); // bad key defaulted
    expect(config.maxImageBytes).toBe(DEFAULT_AI_CONFIG.maxImageBytes);
  });

  it("returns defaults for junk input", () => {
    expect(parseAiConfig(null)).toEqual(DEFAULT_AI_CONFIG);
    expect(parseAiConfig("nope")).toEqual(DEFAULT_AI_CONFIG);
    expect(parseAiConfig({})).toEqual(DEFAULT_AI_CONFIG);
    expect(parseAiConfig({ flags: 5, limits: [] })).toEqual(DEFAULT_AI_CONFIG);
  });

  it("ignores unknown keys", () => {
    const config = parseAiConfig({ flags: { ai_future_thing: false }, limits: {} });
    expect(config).toEqual(DEFAULT_AI_CONFIG);
  });
});

describe("isActionEnabled", () => {
  it("requires both the master switch and the action flag", () => {
    const base = parseAiConfig({ flags: {}, limits: {} });
    expect(isActionEnabled(base, "transcribe")).toBe(true);

    const masterOff = parseAiConfig({ flags: { ai_enabled: false }, limits: {} });
    expect(isActionEnabled(masterOff, "transcribe")).toBe(false);

    const actionOff = parseAiConfig({ flags: { ai_action_transcribe: false }, limits: {} });
    expect(isActionEnabled(actionOff, "transcribe")).toBe(false);
    expect(isActionEnabled(actionOff, "parse-receipt")).toBe(true);
  });
});

describe("action flag keys", () => {
  it("matches the map compiled into the Edge Function resolver", () => {
    // Same guard as aiCreditCost.test.ts: the Edge Function cannot import
    // from src/, so both sides keep a copy. This fails if they drift.
    const pairs = (source: string, where: string): string[] => {
      const match = source.match(/ACTION_FLAG_KEYS[^=]*=\s*\{([\s\S]*?)\}/);
      expect(match, `ACTION_FLAG_KEYS not found in ${where}`).toBeTruthy();
      return [...match![1].matchAll(/"?([a-z-]+)"?\s*:\s*"([a-z_]+)"/g)]
        .map(([, action, key]) => `${action}=${key}`)
        .sort();
    };

    const edge = pairs(
      readFileSync("supabase/functions/_shared/aiConfigResolve.ts", "utf8"),
      "_shared/aiConfigResolve.ts",
    );
    const client = pairs(readFileSync("src/core/aiConfig.ts", "utf8"), "src/core/aiConfig.ts");

    expect(client).toEqual(edge);
    expect(client).toHaveLength(4);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/aiConfig.test.ts`
Expected: FAIL — "Failed to resolve import ./aiConfig"

- [ ] **Step 3: Write the implementation**

Create `src/core/aiConfig.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/aiConfig.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add src/core/aiConfig.ts src/core/aiConfig.test.ts
git commit -m "feat(ai-config): add client config parser with per-key fallback"
```

---

### Task 7: Client fetch and config provider

**Files:**
- Create: `src/core/aiConfigClient.ts`
- Create: `src/premium/AiConfigContext.tsx`
- Modify: `App.tsx:49` (import), `App.tsx:501-513` (mount inside `AiCreditsProvider`)

**Interfaces:**
- Consumes: `AiConfig`, `DEFAULT_AI_CONFIG`, `isActionEnabled`, `parseAiConfig` from Task 6; `getSyncUrl` from `../sync/config`; `createTallySupabaseClient` from `../auth/supabaseClient`; `guardNetworkCall` from `./networkGuard`; `useSupabaseSession` from `../auth/SupabaseSessionContext`.
- Produces:
  - `fetchAiConfig(): Promise<AiConfig | null>` — `null` means "keep what you have"
  - `AiConfigProvider({ children }): JSX.Element`
  - `useAiConfig(): { config: AiConfig; isActionEnabled: (a: AiProxyAction) => boolean; refresh: () => void }`

Cache invalidation is keyed to the **session user id**, not to `clearAllAppStorage` — that function has no callers and is not invoked on sign-out, which goes through `SupabaseSessionContext.tsx:395`.

- [ ] **Step 1: Write the fetch**

Create `src/core/aiConfigClient.ts`:

```ts
/**
 * Fetches the caller's resolved AI config from the `get-ai-config` Edge
 * Function. Mirrors the transport in `aiProxy.ts` — same base URL, same
 * session JWT, same network guard — so config and proxy calls behave
 * identically offline and under the app's network rules.
 */
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";
import { type AiConfig, parseAiConfig } from "./aiConfig";
import { guardNetworkCall } from "./networkGuard";

/**
 * Returns the caller's config, or `null` when it could not be fetched —
 * not configured, signed out, offline, or a server error.
 *
 * `null` means "keep what you have" rather than "disable AI". The caller
 * holds a cache or the bundled defaults; the proxy enforces regardless, so
 * failing open here cannot become a bypass.
 */
export async function fetchAiConfig(): Promise<AiConfig | null> {
  const urlBase = getSyncUrl();
  if (!urlBase) return null;

  const supabase = createTallySupabaseClient();
  if (!supabase) return null;

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  // Signed-out callers have no cohort, so there is nothing to resolve. They
  // keep the bundled defaults; AI is gated behind sign-in anyway.
  if (!token) return null;

  const url = `${urlBase.replace(/\/$/, "")}/functions/v1/get-ai-config`;
  try {
    const res = await guardNetworkCall(() =>
      fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      }),
    );
    if (!res.ok) return null;
    return parseAiConfig(await res.json());
  } catch {
    // Offline, DNS failure, guard rejection. The caller keeps its cache.
    return null;
  }
}
```

- [ ] **Step 2: Write the provider**

Create `src/premium/AiConfigContext.tsx`:

```tsx
/**
 * Holds the app's current AI remote config: reads a cached copy at start,
 * refreshes in the background, and re-resolves whenever the signed-in user
 * changes.
 *
 * Never blocks first render. The UI always has some config — the cache, or
 * the bundled defaults — because `ai-proxy` enforces the same flags
 * server-side. A stale client shows a button and receives a clean 403.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { type AiConfig, DEFAULT_AI_CONFIG, isActionEnabled, parseAiConfig } from "../core/aiConfig";
import type { AiProxyAction } from "../core/aiCreditCost";
import { fetchAiConfig } from "../core/aiConfigClient";

const CACHE_KEY = "@tally:ai_config";
const CACHE_USER_KEY = "@tally:ai_config_user";
/** Matches `ttlSeconds` from get-ai-config. Refresh on foreground past this. */
const TTL_MS = 15 * 60 * 1000;

type AiConfigValue = {
  config: AiConfig;
  isActionEnabled: (action: AiProxyAction) => boolean;
  refresh: () => void;
};

const AiConfigContext = createContext<AiConfigValue | null>(null);

export function AiConfigProvider({ children }: { children: ReactNode }) {
  const { session } = useSupabaseSession();
  const userId = session?.user?.id ?? null;

  const [config, setConfig] = useState<AiConfig>(DEFAULT_AI_CONFIG);
  const lastFetchedAt = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    void (async () => {
      try {
        const next = await fetchAiConfig();
        // `null` means "keep what you have" — offline, signed out, or a
        // server error. Overwriting with defaults would flap the UI.
        if (!next) return;
        setConfig(next);
        lastFetchedAt.current = Date.now();
        try {
          await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next));
        } catch {
          /* best-effort — an unwritable cache only costs us a refetch */
        }
      } finally {
        inFlight.current = false;
      }
    })();
  }, []);

  // Identity change → the cached config may belong to a different cohort.
  // Drop it, fall back to bundled defaults, and refetch. This covers
  // sign-in, sign-out, and account switch in one place.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      let cachedUser: string | null = null;
      try {
        cachedUser = await AsyncStorage.getItem(CACHE_USER_KEY);
      } catch {
        /* treat an unreadable cache as absent */
      }
      if (cancelled) return;

      if (cachedUser !== userId) {
        setConfig(DEFAULT_AI_CONFIG);
        lastFetchedAt.current = 0;
        try {
          await AsyncStorage.removeItem(CACHE_KEY);
          if (userId) await AsyncStorage.setItem(CACHE_USER_KEY, userId);
          else await AsyncStorage.removeItem(CACHE_USER_KEY);
        } catch {
          /* best-effort */
        }
      } else {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          if (raw && !cancelled) setConfig(parseAiConfig(JSON.parse(raw)));
        } catch {
          /* corrupt cache — bundled defaults already in state */
        }
      }

      if (!cancelled && userId) refresh();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  // Foreground refresh, but only past the TTL — cohort changes (a pass
  // purchase, an alpha grant) should land without waiting for a cold start.
  useEffect(() => {
    const onChange = (s: AppStateStatus) => {
      if (s !== "active") return;
      if (Date.now() - lastFetchedAt.current < TTL_MS) return;
      refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [refresh]);

  const value = useMemo<AiConfigValue>(
    () => ({
      config,
      isActionEnabled: (action: AiProxyAction) => isActionEnabled(config, action),
      refresh,
    }),
    [config, refresh],
  );

  return <AiConfigContext.Provider value={value}>{children}</AiConfigContext.Provider>;
}

export function useAiConfig(): AiConfigValue {
  const v = useContext(AiConfigContext);
  if (!v) throw new Error("useAiConfig requires AiConfigProvider");
  return v;
}
```

- [ ] **Step 3: Mount the provider**

In `App.tsx`, add after the existing import on line 49:

```tsx
import { AiConfigProvider } from "./src/premium/AiConfigContext";
```

Then wrap the existing `AiCreditsProvider` block (lines 501-513) so `AiConfigProvider` sits **inside** it — the config provider needs the session, which is already above it in the tree:

```tsx
            <AiCreditsProvider>
              <AiConfigProvider>
                {/* ...existing children unchanged... */}
              </AiConfigProvider>
            </AiCreditsProvider>
```

- [ ] **Step 4: Typecheck, lint, and verify behaviour**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors

Then run the app (`npm start`) and confirm:
- one `get-ai-config` request after sign-in
- **no** request while signed out
- after signing out and back in as a different user, a fresh request rather than reused cached values

- [ ] **Step 5: Commit**

```bash
git add src/core/aiConfigClient.ts src/premium/AiConfigContext.tsx App.tsx
git commit -m "feat(ai-config): add config fetch and provider with identity-keyed cache"
```

---

### Task 8: Gate the UI and surface the new errors

**Files:**
- Modify: `src/core/aiAccess.ts` (add `aiEnabled` input, `"unavailable"` state)
- Modify: `src/core/aiAccess.test.ts` (cover the new state)
- Modify: `src/core/aiProxy.ts:15` (add error class), `:97-104` (classify the new codes)
- Modify: `src/screens/AiReceiptScreen.tsx:1250-1275` (feed `aiEnabled`, handle `"unavailable"`), the five action entry points at 1357, 1398, 1452, 1519, 1628, and the two downscale call sites at 1425 and 1477
- Modify: `src/core/downscaleReceiptImage.ts:31-37` (accept a configurable threshold)
- Modify: `src/i18n/translations.ts` (type at ~405, `en` ~1591, `fa` ~2627, `es` ~3667)

**Interfaces:**
- Consumes: `useAiConfig` from Task 7; the 403 codes from Task 4.
- Produces: `AiProxyDisabledError` with a `scope: "all" | "action"` field.

- [ ] **Step 1: Write the failing test for the access rule**

Append to `src/core/aiAccess.test.ts`:

```ts
describe("resolveAiAccess when AI is remotely disabled", () => {
  const base = {
    signedIn: true,
    emailConfirmed: true,
    isPremium: true,
    balance: 5,
    adsAvailable: true,
  };

  it("returns unavailable when the master switch is off", () => {
    expect(resolveAiAccess({ ...base, aiEnabled: false })).toBe("unavailable");
  });

  it("wins over needs_signin, so we do not send users to Auth for a dead feature", () => {
    expect(
      resolveAiAccess({
        ...base,
        signedIn: false,
        emailConfirmed: false,
        aiEnabled: false,
      }),
    ).toBe("unavailable");
  });

  it("changes nothing when the switch is on", () => {
    expect(resolveAiAccess({ ...base, aiEnabled: true })).toBe("allowed");
  });
});
```

Then add `aiEnabled: true` to the input object of every pre-existing case in this file, so they keep compiling.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/aiAccess.test.ts`
Expected: FAIL — TypeScript rejects `aiEnabled` as an unknown property of `AiAccessInput`

- [ ] **Step 3: Implement the access change**

In `src/core/aiAccess.ts`, add to the `AiAccessState` union:

```ts
  /** Remotely switched off. Not a user problem — no action will help. */
  | "unavailable"
```

Add to `AiAccessInput`:

```ts
  /** Master remote kill switch. See `aiConfig.ts`. */
  aiEnabled: boolean;
```

And make it the first check in `resolveAiAccess`:

```ts
export function resolveAiAccess(input: AiAccessInput): AiAccessState {
  // Ahead of the sign-in check on purpose: sending a signed-out user to Auth
  // for a feature that is globally off wastes their time and ends in a 403.
  if (!input.aiEnabled) return "unavailable";
  if (!input.signedIn || !input.emailConfirmed) return "needs_signin";
  if (input.isPremium) return "allowed";
  if (input.balance > 0) return "allowed";
  return input.adsAvailable ? "needs_credits" : "no_ads_available";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/aiAccess.test.ts`
Expected: PASS

- [ ] **Step 5: Add the proxy error class**

In `src/core/aiProxy.ts`, add after `AiProxyInsufficientCreditsError` (line 15):

```ts
/**
 * Thrown when the proxy refuses because AI is remotely disabled — either the
 * master switch or this action's own flag. Distinct from a credits or auth
 * problem: nothing the user does will help, so callers show a plain
 * "temporarily unavailable" message rather than a call to action.
 */
export class AiProxyDisabledError extends Error {
  readonly scope: "all" | "action";
  constructor(scope: "all" | "action") {
    super(scope === "all" ? "AI_PROXY_DISABLED" : "AI_PROXY_ACTION_DISABLED");
    this.name = "AiProxyDisabledError";
    this.scope = scope;
  }
}
```

Then in `callAiProxy`, extend the failure branch (lines 100-103):

```ts
    if (err.status === 402 && err.code === "insufficient_credits") {
      throw new AiProxyInsufficientCreditsError();
    }
    if (err.status === 403 && err.code === "ai_disabled") {
      throw new AiProxyDisabledError("all");
    }
    if (err.status === 403 && err.code === "action_disabled") {
      throw new AiProxyDisabledError("action");
    }
    throw err;
```

- [ ] **Step 6: Add the translation strings**

In `src/i18n/translations.ts`, add to the `aiReceipt` block of the `MessageTree` type (beside `unavailableBuild` at ~line 405):

```ts
    temporarilyUnavailable: string;
```

Then add the string to each of the three locales, beside each `unavailableBuild` entry:

`en` (~line 1591):
```ts
    temporarilyUnavailable: "AI features are temporarily unavailable. Try again later.",
```

`fa` (~line 2627):
```ts
    temporarilyUnavailable: "قابلیت‌های هوش مصنوعی موقتاً در دسترس نیستند. بعداً دوباره تلاش کنید.",
```

`es` (~line 3667):
```ts
    temporarilyUnavailable: "Las funciones de IA no están disponibles temporalmente. Inténtalo más tarde.",
```

- [ ] **Step 7: Wire the screen**

In `src/screens/AiReceiptScreen.tsx`, add to the imports:

```tsx
import { useAiConfig } from "../premium/AiConfigContext";
import { AiProxyDisabledError } from "../core/aiProxy";
```

Replace line 1250 and the `resolveAiAccess` call that follows:

```tsx
  const aiConfig = useAiConfig();
  const hasKey = hasAnyAiBackend();

  const aiAccess = resolveAiAccess({
    signedIn: Boolean(authUser?.email),
    emailConfirmed: Boolean(authUser?.email_confirmed_at),
    isPremium: premium.isPremium,
    balance: credits.balance,
    adsAvailable: credits.adsAvailable,
    aiEnabled: aiConfig.config.aiEnabled,
  });
```

Extend `ensureAiAccess` so the new state short-circuits before the navigation branches:

```tsx
  const ensureAiAccess = useCallback(() => {
    if (aiAccess === "allowed") return true;
    if (aiAccess === "unavailable") {
      setErr(t("aiReceipt.temporarilyUnavailable"));
      return false;
    }
    if (aiAccess === "needs_signin") {
      navigation.navigate(authUser?.email ? "Plans" : "Auth");
      return false;
    }
    setCreditsPanelVisible(true);
    return false;
  }, [aiAccess, authUser?.email, navigation, t]);
```

Gate the per-action entry points. At each of the five call sites that currently
set an error with `t("aiReceipt.unavailableBuild")`, add an action check before
the existing work, using the action that call site actually issues.

For the three receipt-scan paths at lines 1357, 1398, and 1452:

```tsx
    if (!aiConfig.isActionEnabled("parse-receipt")) {
      setErr(t("aiReceipt.temporarilyUnavailable"));
      return;
    }
```

For the voice path at line 1519:

```tsx
    if (!aiConfig.isActionEnabled("transcribe")) {
      setVoiceErr(t("aiReceipt.temporarilyUnavailable"));
      return;
    }
```

For the describe path at line 1628:

```tsx
    if (!aiConfig.isActionEnabled("parse-description")) {
      setDescribeErr(t("aiReceipt.temporarilyUnavailable"));
      return;
    }
```

Finally, catch the server-side race — the client may be stale, so a call can
still come back disabled. Wherever `AiProxyInsufficientCreditsError` is already
caught, add a sibling branch that also refreshes config so the UI self-heals:

```tsx
    } catch (e) {
      if (e instanceof AiProxyDisabledError) {
        aiConfig.refresh();
        setErr(t("aiReceipt.temporarilyUnavailable"));
        return;
      }
      // ...existing handling unchanged
    }
```

- [ ] **Step 8: Apply the remote request limits**

The two `limits` values are fetched and parsed but nothing consumes them yet. Wire both.

**Image size.** `src/core/downscaleReceiptImage.ts:37` currently hardcodes the threshold:

```ts
  if (input.base64.length < 4_000_000) return input;
```

Add an optional parameter so the caller can pass the remote value, keeping the current number as the default so existing callers and tests are unaffected:

```ts
export async function downscaleReceiptImage(
  input: ReceiptImage,
  maxBase64Length = 4_000_000,
): Promise<ReceiptImage> {
  // Tiny payloads aren't worth touching. Roughly: base64 grows the byte
  // count by 4/3, so 4 MB of base64 ≈ 3 MB on disk. Anything below that
  // already fits comfortably under the 10 MB Edge Function ceiling.
  if (input.base64.length < maxBase64Length) return input;
```

Then pass the remote value at both call sites in `AiReceiptScreen.tsx` (lines 1425 and 1477):

```tsx
        const shrunk = await downscaleReceiptImage(
          { /* ...existing input unchanged... */ },
          aiConfig.config.maxImageBytes,
        );
```

**Audio length.** The recorder already tracks `recorderState.durationMillis` (used for the display at line 3177). Add a stop-at-limit effect near the recorder declaration (line 1210), so a long recording ends itself rather than failing at upload:

```tsx
  // Stop at the remotely configured ceiling. Cutting the recording here is
  // kinder than letting it run and rejecting the upload afterwards.
  useEffect(() => {
    const seconds = (recorderState.durationMillis ?? 0) / 1000;
    if (!recorderState.isRecording) return;
    if (seconds < aiConfig.config.maxAudioSeconds) return;
    void stopRecording();
  }, [recorderState.isRecording, recorderState.durationMillis, aiConfig.config.maxAudioSeconds]);
```

Use whatever the existing stop handler in this file is called in place of `stopRecording` — reuse it rather than duplicating the teardown, so audio-mode reset and state cleanup stay in one place.

- [ ] **Step 9: Run the full suite, typecheck, and lint**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: all PASS, no type or lint errors

- [ ] **Step 10: Manual end-to-end verification**

With the app running and signed in:

```bash
psql "$DB_URL" -c "update ai_config set value = 'false'::jsonb
                   where key = 'ai_action_transcribe' and cohort = 'everyone';"
```
Background the app and reopen it after the TTL, or trigger a refresh.
Expected: the voice-input path reports "AI features are temporarily unavailable"; receipt scanning still works.

```bash
psql "$DB_URL" -c "update ai_config set value = 'false'::jsonb
                   where key = 'ai_enabled' and cohort = 'everyone';"
```
Expected after refresh: the whole AI section reports unavailable.

Restore both to `'true'::jsonb` when finished.

- [ ] **Step 11: Commit**

```bash
git add src/core/aiAccess.ts src/core/aiAccess.test.ts src/core/aiProxy.ts \
        src/core/downscaleReceiptImage.ts src/screens/AiReceiptScreen.tsx src/i18n/translations.ts
git commit -m "feat(ai-config): gate the AI screen on remote flags and apply request limits"
```

---

## Verification Gates

Before considering the work complete:

1. `npm test` — all suites pass, including the two drift guards (`aiCreditCost.test.ts`, `aiConfig.test.ts`).
2. `npx tsc --noEmit` — clean.
3. `npm run lint` — clean.
4. `supabase/scripts/test_ai_config.sql` prints `ai_config verification passed`.
5. **`get-ai-config` never returns a prompt, model id, or rate limit.** Confirmed by inspecting a live response (Task 3 Step 3, and again in Task 5 Step 2).
6. **A disabled action returns 403 and spends no credit.** Confirmed by the balance check in Task 4, Step 4.
7. **`AI_KILL_SWITCH=1` disables AI without any database read.** Confirmed in Task 4, Step 4.
8. **A config value overrides its env-var equivalent, and absence falls back to it.** Confirmed in Task 5, Step 2.
9. **The seed is a true no-op.** `ai_max_image_bytes` seeds to `4000000`, matching the existing hardcoded threshold in `downscaleReceiptImage.ts:37` — not 4 MiB. Applying the migration must not change when receipts get downscaled.
10. **Both request limits are actually consumed**, not merely fetched: image size reaches `downscaleReceiptImage`, and audio length stops the recorder (Task 8, Step 8).
