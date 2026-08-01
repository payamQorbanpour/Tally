# Bazaar Billing and Tapsell Ads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Tally 1.2.0 shippable to Cafe Bazaar by giving Android a working
purchase path, a working AI path, and honest error messages — then add Tapsell
rewarded ads so Iranian users can earn AI credits.

**Architecture:** Three independent fixes converge on one release. (1) A
`verify-bazaar-purchase` Edge Function validates Poolakey purchase tokens
against Cafe Bazaar's Developer API v2 and writes a *server-verified*
`pass_entitlements` row; `ai-proxy` treats only server-verified rows as
entitlement, so the client can no longer grant itself premium. (2) The client
stops silently granting free passes when SKUs are unconfigured. (3) Tapsell
joins the existing `RewardedAdProvider` abstraction; because Tapsell has no
server-side verification, its reward path is client-attested and bounded by a
per-user daily credit cap rather than trusted outright.

**Tech Stack:** Expo SDK 54 / React Native 0.81, Supabase Edge Functions (Deno),
Postgres 15, `@cafebazaar/react-native-poolakey`,
`@react-native-tapsell-mediation/tapsell`, Vitest.

## Global Constraints

- **Branch:** all work lands on `implement/ads-for-ai-credits`. This branch is
  the 1.2.0 release and the Cafe Bazaar resubmission.
- **Tapsell is Android-only.** The npm package ships no `ios/` directory. Never
  reference it from a code path reachable on iOS or web.
- **Metro resolves `require()` statically, ignoring runtime `Platform.OS`
  guards.** Any module referencing a native-only package must have a `.web.ts`
  twin if it is reachable from the always-mounted `App.tsx` tree. This bug has
  already shipped twice on this branch — see `src/ads/admobProvider.web.ts`.
- **No secret may enter the JS bundle.** Bazaar API credentials live only as
  Supabase project secrets. Only `EXPO_PUBLIC_*` values are client-readable.
- **`profiles.is_premium` is service-role-only** (`20260502000000_lock_profiles_entitlements.sql`).
  Never attempt to write it from the client.
- **Client-written rows are untrusted.** `pass_entitlements` has open INSERT RLS
  for the audit trail. Entitlement decisions must require `verified_at is not null`.
- **Daily ad credit cap:** `AD_REWARD_DAILY_CAP`, default `30` credits/user/day.
- **Ad credits per reward:** `AD_REWARD_CREDITS`, default `3` (unchanged).
- **Nonce TTL:** 5 minutes (`NONCE_TTL_MS`, unchanged).
- Every task ends with `npm run lint` and `npx tsc --noEmit` clean for the files
  it touched.

## File Structure

**Bazaar billing**
- `supabase/migrations/20260802000000_pass_verification.sql` (new) — adds
  `pass_entitlements.verified_at`, revokes it from clients, adds the
  entitlement helper used by `ai-proxy`.
- `supabase/functions/verify-bazaar-purchase/bazaarApi.ts` (new) — pure,
  dependency-free Bazaar Developer API v2 client. Unit-testable.
- `supabase/functions/verify-bazaar-purchase/index.ts` (new) — the HTTP route.
- `supabase/functions/ai-proxy/index.ts` (modify) — entitlement now includes
  server-verified passes.
- `src/premium/bazaarBilling.ts` (new) — lazy Poolakey wrapper.
- `src/premium/bazaarBilling.web.ts` (new) — no-op twin.
- `src/premium/PremiumContext.tsx` (modify) — remove the free-grant path.

**Error messaging**
- `src/core/aiProxy.ts` (modify) — typed errors instead of one generic `Error`.
- `src/screens/AiReceiptScreen.tsx` (modify) — map typed errors to copy.
- `src/i18n/translations.ts` (modify) — new strings, en/fa/es.

**Tapsell**
- `supabase/migrations/20260802000001_ad_reward_daily_cap.sql` (new) — capped
  grant RPC.
- `supabase/functions/ad-reward/index.ts` (modify) — re-enable `/nonce` and
  `/claim` behind the cap.
- `src/ads/tapsellProvider.ts` (new) + `src/ads/tapsellProvider.web.ts` (new).
- `src/ads/selectRewardedAdProvider.ts` (modify) — network routing.
- `plugins/withTapsellAdId.js` (new) — Expo config plugin for the AD_ID permission.
- `app.json`, `.env.example` (modify).

**Release**
- `changelogs/1.2.0.*` (modify), `docs/` release checklist (modify).

---

### Task 1: Typed AI proxy errors

The Bazaar reviewer saw "Something went wrong with the AI" because
`aiProxy.ts:44-47` collapses *every* non-2xx into one opaque `Error`. That hid a
402 for weeks. Fix the diagnosis surface first, so the rest of this plan is
debuggable in production.

**Files:**
- Modify: `src/core/aiProxy.ts:44-47`
- Modify: `src/screens/AiReceiptScreen.tsx` (the `toUserFacingAiError` callback)
- Modify: `src/i18n/translations.ts` (en, fa, es)
- Test: `src/core/aiProxy.test.ts` (new)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export class AiProxyHttpError extends Error {
    readonly status: number;
    readonly code: string;   // parsed `error` field, or "" when unparseable
    constructor(status: number, code: string, detail: string);
  }
  ```
  `AiProxyInsufficientCreditsError` (already on this branch) keeps its current
  shape and continues to be thrown for 402 + `code === "insufficient_credits"`.

- [ ] **Step 1: Write the failing test**

```ts
// src/core/aiProxy.test.ts
import { describe, expect, it } from "vitest";
import { AiProxyHttpError, classifyProxyFailure } from "./aiProxy";

describe("classifyProxyFailure", () => {
  it("extracts the server error code from a JSON body", () => {
    const err = classifyProxyFailure(402, '{"error":"premium_required"}');
    expect(err).toBeInstanceOf(AiProxyHttpError);
    expect(err.status).toBe(402);
    expect(err.code).toBe("premium_required");
  });

  it("survives a non-JSON body", () => {
    const err = classifyProxyFailure(502, "<html>bad gateway</html>");
    expect(err.status).toBe(502);
    expect(err.code).toBe("");
  });

  it("keeps the detail for the auto error report", () => {
    const err = classifyProxyFailure(429, '{"error":"rate_limited"}');
    expect(err.message).toContain("429");
    expect(err.code).toBe("rate_limited");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/aiProxy.test.ts`
Expected: FAIL — `classifyProxyFailure` is not exported.

- [ ] **Step 3: Implement**

In `src/core/aiProxy.ts`, replace the `if (!res.ok)` block:

```ts
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
```

and at the call site:

```ts
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = classifyProxyFailure(res.status, body);
    if (err.status === 402 && err.code === "insufficient_credits") {
      throw new AiProxyInsufficientCreditsError();
    }
    throw err;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/aiProxy.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Add the user-facing copy**

In `src/i18n/translations.ts`, add to the `aiReceipt` section of **all three**
locales (en, fa, es) — the type alias at the top of the file must gain the keys
too:

```ts
    aiErrorRateLimited: "Too many AI requests. Wait a minute and try again.",
    aiErrorServer: "The AI service is temporarily unavailable. Try again shortly.",
```

```ts
    aiErrorRateLimited: "درخواست‌های هوش مصنوعی بیش از حد زیاد بود. یک دقیقه صبر کنید و دوباره تلاش کنید.",
    aiErrorServer: "سرویس هوش مصنوعی موقتاً در دسترس نیست. کمی بعد دوباره تلاش کنید.",
```

```ts
    aiErrorRateLimited: "Demasiadas solicitudes de IA. Espera un minuto e inténtalo de nuevo.",
    aiErrorServer: "El servicio de IA no está disponible temporalmente. Inténtalo en un momento.",
```

- [ ] **Step 6: Branch on the typed error in the screen**

In `src/screens/AiReceiptScreen.tsx`, inside `toUserFacingAiError`, before the
`createAutoErrorReport` call:

```ts
      if (e instanceof AiProxyHttpError) {
        if (e.status === 429) return t("aiReceipt.aiErrorRateLimited");
        if (e.status >= 500) return t("aiReceipt.aiErrorServer");
      }
```

Import `AiProxyHttpError` from `../core/aiProxy`. Leave the
`createAutoErrorReport` call reachable for everything else — the whole point is
that unknown failures still get recorded.

- [ ] **Step 7: Verify**

Run: `npx vitest run src/core/aiProxy.test.ts && npx tsc --noEmit && npm run lint`
Expected: all pass. `tsc` catches any locale that is missing a new key.

- [ ] **Step 8: Commit**

```bash
git add src/core/aiProxy.ts src/core/aiProxy.test.ts src/screens/AiReceiptScreen.tsx src/i18n/translations.ts
git commit -m "fix: surface AI proxy failures instead of one generic message"
```

---

### Task 2: Server-verified pass entitlements (migration)

`pass_entitlements` rows are client-written and therefore untrusted. Add a
`verified_at` column that only the service role can set, so `ai-proxy` can tell
a real purchase from a forged row.

**Files:**
- Create: `supabase/migrations/20260802000000_pass_verification.sql`
- Create: `supabase/scripts/test_pass_verification.sql`

**Interfaces:**
- Produces: `public.tally_has_active_entitlement(p_user_id uuid) returns boolean`
  — true when `profiles.is_premium` is set OR a verified, unexpired, unended
  pass row exists. Called by `ai-proxy` (Task 4) and
  `verify-bazaar-purchase` (Task 3).

- [ ] **Step 1: Write the migration**

```sql
-- Server-verified pass entitlements.
--
-- `pass_entitlements` has open INSERT RLS so the client can record its own
-- audit trail. That makes every column on it attacker-controlled, so the row
-- alone can never be an entitlement. `verified_at` is writable only by the
-- service role (column privileges, independent of RLS) and is set exclusively
-- by the `verify-bazaar-purchase` Edge Function after Cafe Bazaar's Developer
-- API confirms the purchase token.
--
-- Entitlement = `profiles.is_premium` (staff/alpha/Apple) OR an active
-- verified pass. `is_premium` deliberately stays a boolean with no expiry:
-- pass expiry is carried by `expires_at` on the row, not by flipping a flag
-- on a schedule.

alter table public.pass_entitlements
  add column if not exists verified_at timestamptz;

comment on column public.pass_entitlements.verified_at is
  'Set only by verify-bazaar-purchase after Developer API v2 confirms the token. Null = client-written, untrusted.';

-- Re-grant the client only the columns it legitimately writes. `revoke all`
-- first, because Supabase''s defaults include TRUNCATE and RLS does not cover
-- TRUNCATE.
revoke all on public.pass_entitlements from anon, authenticated;

grant select on public.pass_entitlements to authenticated;

grant insert (id, user_id, pass_type, kind, product_id, store_transaction_id,
              activated_at, expires_at, ended_at, bound_group_id,
              price_amount, price_currency, created_at, last_modified)
  on public.pass_entitlements to authenticated;

grant update (ended_at, last_modified)
  on public.pass_entitlements to authenticated;

grant delete on public.pass_entitlements to authenticated;

create index if not exists pass_entitlements_verified_active_idx
  on public.pass_entitlements (user_id, expires_at desc)
  where verified_at is not null and ended_at is null;

-- Single source of truth for "may this user use paid features".
create or replace function public.tally_has_active_entitlement(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((select p.is_premium from public.profiles p where p.id = p_user_id), false)
    or exists (
      select 1
      from public.pass_entitlements e
      where e.user_id = p_user_id
        and e.verified_at is not null
        and e.ended_at is null
        and (e.expires_at is null or e.expires_at > now())
    );
$$;

revoke all on function public.tally_has_active_entitlement(uuid) from public, anon;
grant execute on function public.tally_has_active_entitlement(uuid) to authenticated, service_role;
```

- [ ] **Step 2: Write the assertion script**

```sql
-- supabase/scripts/test_pass_verification.sql
-- Run with: psql "$DATABASE_URL" -f supabase/scripts/test_pass_verification.sql
-- Wrapped in a transaction that always rolls back — safe on a scratch db,
-- NEVER run against production (it inserts into auth.users).
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'entitle-a@test.local');

-- No profile flag, no pass → not entitled.
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = false,
    'bare user should not be entitled';
end $$;

-- Unverified (client-written) pass → still not entitled.
insert into public.pass_entitlements (user_id, pass_type, kind, product_id, expires_at)
values ('00000000-0000-0000-0000-0000000000a1', 'night', 'buy', 'forged', now() + interval '1 day');
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = false,
    'client-written pass must not grant entitlement';
end $$;

-- Verified pass → entitled.
update public.pass_entitlements set verified_at = now()
  where user_id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = true,
    'verified pass must grant entitlement';
end $$;

-- Expired verified pass → not entitled.
update public.pass_entitlements set expires_at = now() - interval '1 hour'
  where user_id = '00000000-0000-0000-0000-0000000000a1';
do $$ begin
  assert public.tally_has_active_entitlement('00000000-0000-0000-0000-0000000000a1') = false,
    'expired pass must not grant entitlement';
end $$;

rollback;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260802000000_pass_verification.sql supabase/scripts/test_pass_verification.sql
git commit -m "feat: add server-verified pass entitlement column and helper"
```

---

### Task 3: Bazaar Developer API client

Pure module, no Deno or npm imports, so it runs under Vitest like
`admobSsv.ts` does. Every failure path returns a typed result — never throws.

**Files:**
- Create: `supabase/functions/verify-bazaar-purchase/bazaarApi.ts`
- Test: `supabase/functions/verify-bazaar-purchase/bazaarApi.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type BazaarPurchase = {
    purchased: boolean;   // consumptionState/purchaseState says paid
    consumed: boolean;
    purchaseTimeMs: number | null;
  };
  export type BazaarResult =
    | { ok: true; purchase: BazaarPurchase }
    | { ok: false; reason: "auth" | "not_found" | "network" | "malformed" };

  export function buildValidateUrl(pkg: string, sku: string, token: string): string;
  export function parsePurchaseResponse(status: number, body: string): BazaarResult;
  export async function fetchAccessToken(opts: {
    clientId: string; clientSecret: string; refreshToken: string;
    fetchImpl?: typeof fetch;
  }): Promise<string | null>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/verify-bazaar-purchase/bazaarApi.test.ts
import { describe, expect, it } from "vitest";
import { buildValidateUrl, parsePurchaseResponse } from "./bazaarApi";

describe("buildValidateUrl", () => {
  it("matches the Developer API v2 template", () => {
    expect(buildValidateUrl("ir.tally.app", "night_pass", "tok123")).toBe(
      "https://pardakht.cafebazaar.ir/devapi/v2/api/validate/ir.tally.app/inapp/night_pass/purchases/tok123/",
    );
  });

  it("percent-encodes path segments so a crafted sku cannot escape the path", () => {
    expect(buildValidateUrl("ir.tally.app", "a/../b", "t")).toContain("a%2F..%2Fb");
  });
});

describe("parsePurchaseResponse", () => {
  it("accepts a paid, unconsumed purchase", () => {
    const r = parsePurchaseResponse(200, '{"purchaseState":0,"consumptionState":1,"time":1700000000000}');
    expect(r).toEqual({
      ok: true,
      purchase: { purchased: true, consumed: false, purchaseTimeMs: 1700000000000 },
    });
  });

  it("treats a refunded purchase as not purchased", () => {
    const r = parsePurchaseResponse(200, '{"purchaseState":1,"consumptionState":1}');
    expect(r).toEqual({
      ok: true,
      purchase: { purchased: false, consumed: false, purchaseTimeMs: null },
    });
  });

  it("maps 401 to auth so the caller refreshes the token", () => {
    expect(parsePurchaseResponse(401, "")).toEqual({ ok: false, reason: "auth" });
  });

  it("maps 404 to not_found", () => {
    expect(parsePurchaseResponse(404, "")).toEqual({ ok: false, reason: "not_found" });
  });

  it("maps unparseable success bodies to malformed", () => {
    expect(parsePurchaseResponse(200, "<html>")).toEqual({ ok: false, reason: "malformed" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/verify-bazaar-purchase/bazaarApi.test.ts`
Expected: FAIL — module not found. (`vitest.config.ts` already includes
`supabase/functions/**/*.test.ts` from the AdMob SSV task.)

- [ ] **Step 3: Implement**

```ts
// supabase/functions/verify-bazaar-purchase/bazaarApi.ts
//
// Cafe Bazaar Developer API v2 client.
//
// Deliberately dependency-free (no Deno.*, no npm: imports) so the parsing and
// URL construction are unit-testable under Vitest alongside the app code, the
// same arrangement `ad-reward/admobSsv.ts` uses.
//
// Endpoints (from the published v2 reference):
//   token:    POST https://pardakht.cafebazaar.ir/devapi/v2/auth/token/
//   validate: GET  .../devapi/v2/api/validate/{package}/inapp/{sku}/purchases/{token}/

const BASE = "https://pardakht.cafebazaar.ir/devapi/v2";

export type BazaarPurchase = {
  purchased: boolean;
  consumed: boolean;
  purchaseTimeMs: number | null;
};

export type BazaarResult =
  | { ok: true; purchase: BazaarPurchase }
  | { ok: false; reason: "auth" | "not_found" | "network" | "malformed" };

/**
 * `sku` and `token` come from the client, so each segment is encoded — an
 * unencoded `../` would otherwise let a caller redirect the request to a
 * different Developer API endpoint.
 */
export function buildValidateUrl(pkg: string, sku: string, token: string): string {
  const seg = (s: string) => encodeURIComponent(s);
  return `${BASE}/api/validate/${seg(pkg)}/inapp/${seg(sku)}/purchases/${seg(token)}/`;
}

export function parsePurchaseResponse(status: number, body: string): BazaarResult {
  if (status === 401 || status === 403) return { ok: false, reason: "auth" };
  if (status === 404) return { ok: false, reason: "not_found" };
  if (status < 200 || status >= 300) return { ok: false, reason: "network" };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof parsed.purchaseState !== "number") {
    return { ok: false, reason: "malformed" };
  }

  // Bazaar mirrors Google Play's encoding: purchaseState 0 == purchased.
  // consumptionState 0 == consumed, 1 == not yet consumed.
  const purchased = parsed.purchaseState === 0;
  return {
    ok: true,
    purchase: {
      purchased,
      consumed: parsed.consumptionState === 0,
      purchaseTimeMs: purchased && typeof parsed.time === "number" ? parsed.time : null,
    },
  };
}

/** Exchange the long-lived refresh token for an access token. Null on failure. */
export async function fetchAccessToken(opts: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  fetchImpl?: typeof fetch;
}): Promise<string | null> {
  const doFetch = opts.fetchImpl ?? fetch;
  try {
    const res = await doFetch(`${BASE}/auth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: opts.clientId,
        client_secret: opts.clientSecret,
        refresh_token: opts.refreshToken,
      }).toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { access_token?: unknown };
    return typeof json.access_token === "string" ? json.access_token : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/verify-bazaar-purchase/bazaarApi.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/verify-bazaar-purchase/bazaarApi.ts supabase/functions/verify-bazaar-purchase/bazaarApi.test.ts
git commit -m "feat: add Cafe Bazaar Developer API v2 client"
```

---

### Task 4: verify-bazaar-purchase Edge Function + ai-proxy entitlement

**Files:**
- Create: `supabase/functions/verify-bazaar-purchase/index.ts`
- Modify: `supabase/config.toml`
- Modify: `supabase/functions/ai-proxy/index.ts` (the `requireAuthed` premium read)
- Modify: `Makefile`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `bazaarApi.ts` (Task 3), `tally_has_active_entitlement` (Task 2).
- Produces: `POST /functions/v1/verify-bazaar-purchase`
  with body `{ productId: string, purchaseToken: string, passType: "night"|"trip"|"explorer", boundGroupId?: string }`
  → `200 { ok: true, expiresAt: string }` | `400 invalid_request`
  | `401 unauthorized` | `402 purchase_invalid` | `503 verification_unavailable`.

- [ ] **Step 1: Write the route**

```ts
// supabase/functions/verify-bazaar-purchase/index.ts
//
// Validates a Poolakey purchase token against Cafe Bazaar's Developer API and,
// only on success, writes a `verified_at` pass row. This is the ONLY writer of
// `pass_entitlements.verified_at` — the client cannot set it (column privilege,
// see 20260802000000_pass_verification.sql).
//
// Requires JWT auth: the pass is granted to the caller's own user id, never to
// a user id supplied in the body.
//
// Required Supabase project secrets:
//   BAZAAR_CLIENT_ID, BAZAAR_CLIENT_SECRET, BAZAAR_REFRESH_TOKEN
//   BAZAAR_PACKAGE_NAME   e.g. ir.tally.app

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { buildValidateUrl, fetchAccessToken, parsePurchaseResponse } from "./bazaarApi.ts";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, apikey, x-client-info",
};

const PASS_DURATION_MS: Record<string, number> = {
  night: 24 * 60 * 60 * 1000,
  trip: 7 * 24 * 60 * 60 * 1000,
  explorer: 30 * 24 * 60 * 60 * 1000,
};

const env = (n: string) => (Deno.env.get(n) ?? "").trim();
const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

/** Access tokens are short-lived; cache one and refetch on 401. */
let cachedToken: string | null = null;

async function accessToken(force: boolean): Promise<string | null> {
  if (cachedToken && !force) return cachedToken;
  cachedToken = await fetchAccessToken({
    clientId: env("BAZAAR_CLIENT_ID"),
    clientSecret: env("BAZAAR_CLIENT_SECRET"),
    refreshToken: env("BAZAAR_REFRESH_TOKEN"),
  });
  return cachedToken;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) return json(401, { error: "unauthorized" });

  const url = env("SUPABASE_URL");
  const anon = env("SUPABASE_ANON_KEY");
  const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
  const pkg = env("BAZAAR_PACKAGE_NAME");
  if (!url || !anon || !serviceKey || !pkg) return json(500, { error: "server_misconfigured" });

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json(401, { error: "unauthorized" });
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }
  const productId = typeof body.productId === "string" ? body.productId : "";
  const purchaseToken = typeof body.purchaseToken === "string" ? body.purchaseToken : "";
  const passType = typeof body.passType === "string" ? body.passType : "";
  if (!productId || !purchaseToken || !PASS_DURATION_MS[passType]) {
    return json(400, { error: "invalid_request" });
  }

  // Validate, refreshing the access token once on an auth failure.
  let token = await accessToken(false);
  if (!token) return json(503, { error: "verification_unavailable" });

  const call = async (t: string) => {
    try {
      const res = await fetch(buildValidateUrl(pkg, productId, purchaseToken), {
        headers: { Authorization: `Bearer ${t}` },
      });
      return parsePurchaseResponse(res.status, await res.text());
    } catch {
      return { ok: false, reason: "network" } as const;
    }
  };

  let result = await call(token);
  if (!result.ok && result.reason === "auth") {
    token = await accessToken(true);
    if (!token) return json(503, { error: "verification_unavailable" });
    result = await call(token);
  }

  if (!result.ok) {
    // `not_found` and `malformed` mean Bazaar does not recognise this token —
    // that is a rejected purchase, not an outage. Only genuine transport /
    // auth trouble should tell the client to retry later.
    if (result.reason === "network" || result.reason === "auth") {
      return json(503, { error: "verification_unavailable" });
    }
    return json(402, { error: "purchase_invalid" });
  }
  if (!result.purchase.purchased) return json(402, { error: "purchase_invalid" });

  const admin = createClient(url, serviceKey);
  const startedMs = result.purchase.purchaseTimeMs ?? Date.now();
  const expiresAt = new Date(startedMs + PASS_DURATION_MS[passType]!).toISOString();

  // `store_transaction_id` is unique per Bazaar purchase, so re-posting the
  // same token is a no-op rather than a second pass.
  const { error: insertErr } = await admin.from("pass_entitlements").upsert(
    {
      user_id: userId,
      pass_type: passType,
      kind: "buy",
      product_id: productId,
      store_transaction_id: purchaseToken,
      activated_at: new Date(startedMs).toISOString(),
      expires_at: expiresAt,
      bound_group_id: typeof body.boundGroupId === "string" ? body.boundGroupId : null,
      verified_at: new Date().toISOString(),
    },
    { onConflict: "store_transaction_id", ignoreDuplicates: true },
  );
  if (insertErr) return json(500, { error: "record_failed" });

  return json(200, { ok: true, expiresAt });
});
```

- [ ] **Step 2: Add the unique index the upsert depends on**

Append to `supabase/migrations/20260802000000_pass_verification.sql`:

```sql
-- Makes re-posting the same Bazaar purchase token idempotent (the
-- verify-bazaar-purchase upsert targets this constraint). Partial, because
-- client-written audit rows legitimately carry a null transaction id.
create unique index if not exists pass_entitlements_store_txn_key
  on public.pass_entitlements (store_transaction_id)
  where store_transaction_id is not null;
```

- [ ] **Step 3: Register the function**

In `supabase/config.toml`:

```toml
[functions.verify-bazaar-purchase]
verify_jwt = true
```

- [ ] **Step 4: Switch ai-proxy to the entitlement helper**

In `supabase/functions/ai-proxy/index.ts`, replace the `profiles` read in
`requireAuthed` with:

```ts
  // Entitlement is `profiles.is_premium` OR an active server-verified pass.
  // Reading the column directly used to be the whole check, which meant an
  // Android pass buyer — whose purchase never touches `is_premium` — was told
  // "premium_required" after paying. See tally_has_active_entitlement.
  const { data: entitled } = await admin.rpc("tally_has_active_entitlement", {
    p_user_id: data.user.id,
  });
  const isPremium = entitled === true;
```

Leave the rest of `requireAuthed` untouched — on this branch it already
reports `isPremium` rather than returning 402, because billing is by credits.

- [ ] **Step 5: Makefile + env docs**

Add to `Makefile`, mirroring the existing `ad-reward` targets:

```make
verify-bazaar-purchase:
	supabase functions deploy verify-bazaar-purchase

verify-bazaar-secrets:
	supabase secrets set BAZAAR_CLIENT_ID=$(BAZAAR_CLIENT_ID) \
	                     BAZAAR_CLIENT_SECRET=$(BAZAAR_CLIENT_SECRET) \
	                     BAZAAR_REFRESH_TOKEN=$(BAZAAR_REFRESH_TOKEN) \
	                     BAZAAR_PACKAGE_NAME=$(BAZAAR_PACKAGE_NAME)
```

Document the four secrets in `.env.example` under a `# Cafe Bazaar billing`
heading, stating plainly that they are **server-side secrets set via
`supabase secrets set`** and must never be given an `EXPO_PUBLIC_` prefix.

- [ ] **Step 6: Verify**

Run: `npx vitest run supabase/functions/ && npm run lint`
Expected: PASS. There is no local Deno runtime, so `index.ts` is verified by
review and by the staging deploy in Task 9's checklist, not by execution.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/verify-bazaar-purchase/index.ts supabase/config.toml \
        supabase/functions/ai-proxy/index.ts supabase/migrations/20260802000000_pass_verification.sql \
        Makefile .env.example
git commit -m "feat: verify Bazaar purchases server-side and honour verified passes"
```

---

### Task 5: Poolakey client binding

**Files:**
- Create: `src/premium/bazaarBilling.ts`
- Create: `src/premium/bazaarBilling.web.ts`
- Test: `src/premium/bazaarBilling.test.ts`
- Modify: `package.json` (add `@cafebazaar/react-native-poolakey@^3.1.2`)

**Interfaces:**
- Produces:
  ```ts
  export type BazaarPurchaseResult =
    | { kind: "purchased"; productId: string; purchaseToken: string }
    | { kind: "cancelled" }
    | { kind: "unavailable" }        // Bazaar app not installed, or non-Bazaar build
    | { kind: "failed"; reason: string };

  export function isBazaarBillingAvailable(): boolean;
  export function purchaseBazaarProduct(productId: string): Promise<BazaarPurchaseResult>;
  ```

- [ ] **Step 1: Install**

```bash
npm install @cafebazaar/react-native-poolakey@^3.1.2
```

- [ ] **Step 2: Write the failing test**

Only the pure decision logic is testable off-device; the native bridge is not.

```ts
// src/premium/bazaarBilling.test.ts
import { describe, expect, it } from "vitest";
import { classifyPoolakeyError } from "./bazaarBilling";

describe("classifyPoolakeyError", () => {
  it("maps a user-cancelled purchase to cancelled, not failed", () => {
    expect(classifyPoolakeyError(new Error("USER_CANCELED")).kind).toBe("cancelled");
  });

  it("maps a missing Bazaar app to unavailable", () => {
    expect(classifyPoolakeyError(new Error("BAZAAR_IS_NOT_INSTALLED")).kind).toBe("unavailable");
  });

  it("keeps anything else as failed with the reason preserved", () => {
    const r = classifyPoolakeyError(new Error("boom"));
    expect(r).toEqual({ kind: "failed", reason: "boom" });
  });

  it("survives a non-Error rejection", () => {
    expect(classifyPoolakeyError("nope")).toEqual({ kind: "failed", reason: "nope" });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/premium/bazaarBilling.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

```ts
// src/premium/bazaarBilling.ts
//
// Cafe Bazaar in-app billing via Poolakey.
//
// `require` rather than a static import, and a `.web.ts` twin, because the
// package is Android-only native code: a static import would be resolved by
// Metro for the web bundle and break it. Same pattern as
// `src/ads/admobProvider.ts` — see the note there.
import { Platform } from "react-native";

export type BazaarPurchaseResult =
  | { kind: "purchased"; productId: string; purchaseToken: string }
  | { kind: "cancelled" }
  | { kind: "unavailable" }
  | { kind: "failed"; reason: string };

/** Poolakey surfaces failure as message strings; map the ones we act on. */
export function classifyPoolakeyError(e: unknown): BazaarPurchaseResult {
  const msg = e instanceof Error ? e.message : String(e);
  const upper = msg.toUpperCase();
  if (upper.includes("CANCEL")) return { kind: "cancelled" };
  if (upper.includes("NOT_INSTALLED") || upper.includes("NOT INSTALLED")) {
    return { kind: "unavailable" };
  }
  return { kind: "failed", reason: msg };
}

let mod: typeof import("@cafebazaar/react-native-poolakey") | null = null;
let probed = false;

function loadNative() {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@cafebazaar/react-native-poolakey");
  } catch {
    mod = null;
  }
  return mod;
}

export function isBazaarBillingAvailable(): boolean {
  if (Platform.OS !== "android") return false;
  if (!process.env.EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY) return false;
  return loadNative() !== null;
}

export async function purchaseBazaarProduct(productId: string): Promise<BazaarPurchaseResult> {
  const m = loadNative();
  const rsaKey = process.env.EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY;
  if (!m || !rsaKey) return { kind: "unavailable" };
  try {
    await m.connect(rsaKey);
    const purchase = await m.purchaseProduct(productId, "");
    const token = purchase?.purchaseToken;
    if (!token) return { kind: "failed", reason: "no_purchase_token" };
    return { kind: "purchased", productId, purchaseToken: token };
  } catch (e) {
    return classifyPoolakeyError(e);
  }
}
```

```ts
// src/premium/bazaarBilling.web.ts
//
// Web/iOS twin. Metro picks this over `bazaarBilling.ts` for the web bundle,
// keeping the Android-only Poolakey package out of the module graph.
export type { BazaarPurchaseResult } from "./bazaarBilling";
export { classifyPoolakeyError } from "./bazaarBilling";

export function isBazaarBillingAvailable(): boolean {
  return false;
}

export async function purchaseBazaarProduct(): Promise<{ kind: "unavailable" }> {
  return { kind: "unavailable" };
}
```

> The `.web.ts` twin re-exports `classifyPoolakeyError` from the native file.
> That is safe: the function is pure and touches no native module, and the
> `require` in the native file is lazy, so importing it does not pull Poolakey
> into the graph.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/premium/bazaarBilling.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Verify the web bundle still builds**

Run: `npx expo export --platform web`
Expected: completes with no "native-only module" error. This is the check that
caught the same class of bug twice on this branch — do not skip it.

- [ ] **Step 7: Commit**

```bash
git add src/premium/bazaarBilling.ts src/premium/bazaarBilling.web.ts src/premium/bazaarBilling.test.ts package.json package-lock.json
git commit -m "feat: add Poolakey billing binding for Cafe Bazaar"
```

---

### Task 6: Stop granting free passes; route purchases through verification

This is the defect the Bazaar reviewer actually hit: with SKUs unconfigured,
`buyOrStub` returns success without charging, the client believes it is
premium, and the server disagrees.

**Files:**
- Modify: `src/premium/PremiumContext.tsx:290-340` (`buyOrStub`, `requestPass`)
- Modify: `src/i18n/translations.ts` (en/fa/es)
- Test: `src/premium/premiumConfig.test.ts` (extend if present, else create)

**Interfaces:**
- Consumes: `purchaseBazaarProduct`, `isBazaarBillingAvailable` (Task 5);
  `verify-bazaar-purchase` (Task 4).
- Produces: `PremiumContextValue.lastError` now carries a translation key
  rather than a raw SDK string when a purchase cannot proceed.

- [ ] **Step 1: Write the failing test**

```ts
// src/premium/premiumConfig.test.ts
import { describe, expect, it } from "vitest";
import { isIapConfigured } from "./premiumConfig";

describe("isIapConfigured", () => {
  it("is false when no pass SKU is set, so the UI must not offer a purchase", () => {
    delete process.env.EXPO_PUBLIC_NIGHT_OUT_PASS_ID;
    delete process.env.EXPO_PUBLIC_TRIP_PASS_ID;
    delete process.env.EXPO_PUBLIC_EXPLORER_PASS_ID;
    delete process.env.EXPO_PUBLIC_PREMIUM_SUBSCRIPTION_IDS;
    expect(isIapConfigured()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run src/premium/premiumConfig.test.ts`
Expected: PASS immediately — this test pins existing behaviour that the next
step must not break. (If it fails, a stale env var is leaking; fix the test
env before continuing.)

- [ ] **Step 3: Replace the free-grant path**

In `src/premium/PremiumContext.tsx`, `buyOrStub` becomes:

```ts
  // Previously: an unset SKU returned success and the caller activated a pass
  // locally, so a build with no store configuration handed out free premium
  // that the server then refused — the Bazaar 1.1.0 rejection. A purchase now
  // either completes against a real store or fails.
  const buyOrStub = useCallback(
    async (
      sku: string | null,
    ): Promise<{ ok: boolean; transactionId?: string | null }> => {
      if (Platform.OS === "web") return { ok: false };
      if (!sku) {
        setLastError("premium.errorNotConfigured");
        return { ok: false };
      }

      if (isBazaarBillingAvailable()) {
        const res = await purchaseBazaarProduct(sku);
        if (res.kind !== "purchased") {
          if (res.kind !== "cancelled") setLastError(`premium.error_${res.kind}`);
          return { ok: false };
        }
        return { ok: true, transactionId: res.purchaseToken };
      }

      try {
        const mod = await import("expo-iap");
        if (!initDone.current) {
          await mod.initConnection();
          initDone.current = true;
        }
        await mod.fetchProducts({ skus: [sku], type: "inapp" });
        await mod.requestPurchase({
          request: { apple: { sku }, google: { skus: [sku] } },
          type: "inapp",
        });
        return { ok: true, transactionId: null };
      } catch (e) {
        setLastError(e instanceof Error ? e.message : String(e));
        return { ok: false };
      }
    },
    [],
  );
```

- [ ] **Step 4: Verify the purchase server-side before activating**

In `requestPass`, after `const result = await buyOrStub(sku);`:

```ts
      if (!result.ok) return;

      // A Bazaar purchase is only real once the Developer API confirms it.
      // Activating locally first would recreate the client/server split this
      // release exists to fix.
      if (result.transactionId && isBazaarBillingAvailable()) {
        const verified = await verifyBazaarPurchase({
          productId: sku!,
          purchaseToken: result.transactionId,
          passType: type,
          boundGroupId: opts?.groupId ?? null,
        });
        if (!verified) {
          setLastError("premium.errorVerificationFailed");
          return;
        }
      }
```

Add the helper next to the other network calls in `src/premium/`:

```ts
// src/premium/verifyBazaarPurchase.ts
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSyncUrl } from "../sync/config";

/** POSTs the purchase token to the Edge Function. True only on a 200. */
export async function verifyBazaarPurchase(input: {
  productId: string;
  purchaseToken: string;
  passType: string;
  boundGroupId: string | null;
}): Promise<boolean> {
  const base = getSyncUrl();
  const supabase = createTallySupabaseClient();
  if (!base || !supabase) return false;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return false;
  try {
    const res = await fetch(
      `${base.replace(/\/$/, "")}/functions/v1/verify-bazaar-purchase`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Add the error copy**

Add to the `premium` section of en/fa/es in `src/i18n/translations.ts`:

```ts
    errorNotConfigured: "Purchases aren't available in this build.",
    error_unavailable: "Install or update the Bazaar app to buy a pass.",
    error_failed: "The purchase could not be completed. Try again.",
    errorVerificationFailed: "We couldn't confirm that purchase. If you were charged, contact support.",
```

Persian and Spanish equivalents must be written out in full — do not leave the
English string in place for the other locales.

- [ ] **Step 6: Verify**

Run: `npx vitest run src/premium/ && npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/premium/ src/i18n/translations.ts
git commit -m "fix: never grant a pass without a verified store purchase"
```

---

### Task 7: Daily-capped ad credit grant

Tapsell has no server-side verification, so `/claim` must treat the client as
untrusted. A per-user daily ceiling makes the abuse ceiling equal the honest
ceiling: cheating saves the user time, not money.

**Files:**
- Create: `supabase/migrations/20260802000001_ad_reward_daily_cap.sql`
- Modify: `supabase/scripts/test_ai_credits.sql` (append cases)

**Interfaces:**
- Produces: `public.ai_credit_grant_capped(p_user_id uuid, p_delta int,
  p_provider text, p_external_id text, p_daily_cap int) returns integer`
  — new balance, or `-1` when today's ad grants would exceed the cap.
  Idempotent on `(provider, external_id)` exactly like `ai_credit_grant`.

- [ ] **Step 1: Write the migration**

```sql
-- Daily-capped ad credit grant.
--
-- Providers without server-side reward verification (Tapsell, and any future
-- network in the same position) can only be claimed by the client saying so.
-- The cap bounds what that claim is worth: an attacker who forges claims all
-- day earns exactly what an honest viewer earns, so forging buys time rather
-- than credits. AdMob keeps using `ai_credit_grant` — its SSV signature is
-- real proof and needs no ceiling.
--
-- The cap counts credits granted with reason 'ad_reward' since UTC midnight.
-- Idempotent replays (same provider + external_id) do not consume cap, because
-- the insert is skipped before the count matters.

create or replace function public.ai_credit_grant_capped(
  p_user_id     uuid,
  p_delta       integer,
  p_provider    text,
  p_external_id text,
  p_daily_cap   integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today   integer;
  v_balance integer;
begin
  if p_delta <= 0 then
    raise exception 'ai_credit_grant_capped requires a positive delta';
  end if;

  -- Idempotent replay: if this exact reward was already recorded, return the
  -- current balance without touching the cap.
  if exists (
    select 1 from public.ai_credit_events
    where coalesce(provider, '') = coalesce(p_provider, '')
      and external_id = p_external_id
  ) then
    select balance into v_balance from public.ai_credit_balances where user_id = p_user_id;
    return coalesce(v_balance, 0);
  end if;

  select coalesce(sum(delta), 0) into v_today
  from public.ai_credit_events
  where user_id = p_user_id
    and reason = 'ad_reward'
    and delta > 0
    and created_at >= date_trunc('day', now() at time zone 'utc');

  if v_today + p_delta > p_daily_cap then
    return -1;
  end if;

  return public.ai_credit_grant(p_user_id, p_delta, 'ad_reward', p_provider, p_external_id);
end;
$$;

revoke all on function public.ai_credit_grant_capped(uuid, integer, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.ai_credit_grant_capped(uuid, integer, text, text, integer)
  to service_role;
```

- [ ] **Step 2: Append assertions to the test script**

Add before the `rollback;` in `supabase/scripts/test_ai_credits.sql`:

```sql
-- ── daily cap ───────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'cap@test.local');

do $$
declare r integer;
begin
  -- Cap of 6 with 3-credit rewards: two succeed, the third is refused.
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n1', 6);
  assert r >= 0, 'first capped grant should succeed';
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n2', 6);
  assert r >= 0, 'second capped grant should succeed';
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n3', 6);
  assert r = -1, 'third grant must be refused by the cap';

  -- Replaying an already-recorded reward must not be refused by the cap.
  r := public.ai_credit_grant_capped('00000000-0000-0000-0000-0000000000c1', 3, 'tapsell', 'n1', 6);
  assert r >= 0, 'idempotent replay must not consume cap';
end $$;
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260802000001_ad_reward_daily_cap.sql supabase/scripts/test_ai_credits.sql
git commit -m "feat: add daily-capped ad credit grant for unverified providers"
```

---

### Task 8: Re-enable /nonce and /claim behind the cap

**Files:**
- Modify: `supabase/functions/ad-reward/index.ts` (`handleNonce`, `handleClaim`)

**Interfaces:**
- Consumes: `ai_credit_grant_capped` (Task 7).
- Produces: `POST /ad-reward/nonce { provider }` → `200 { nonce }`;
  `POST /ad-reward/claim { nonce }` → `200 { balance }` |
  `429 { error: "daily_cap_reached" }` | `400 nonce_invalid`.

- [ ] **Step 1: Remove the 501 guards and restrict the provider**

In `handleNonce`, delete the `return jsonResponse(501, ...)` line and its
comment, and replace the provider check with an allow-list:

```ts
  // Only providers that genuinely lack server-side verification use this
  // path. AdMob must never appear here: it has SSV, and accepting a
  // self-issued nonce for it would let a caller bypass that signature.
  const provider = typeof body.provider === "string" ? body.provider : "";
  if (provider !== "tapsell") return jsonResponse(400, { error: "provider_unsupported" });
```

- [ ] **Step 2: Switch the claim to the capped grant**

In `handleClaim`, delete the `return jsonResponse(501, ...)` line and its
comment, then replace the `ai_credit_grant` RPC call with:

```ts
  // Client-attested: nothing here proves an ad was watched, only that this
  // user asked for a nonce and returned it within the TTL. The daily cap is
  // what bounds that — see 20260802000001_ad_reward_daily_cap.sql.
  const { data, error } = await admin.rpc("ai_credit_grant_capped", {
    p_user_id: user,
    p_delta: envInt("AD_REWARD_CREDITS", 3),
    p_provider: (consumed as { provider: string }).provider,
    p_external_id: nonce,
    p_daily_cap: envInt("AD_REWARD_DAILY_CAP", 30),
  });
  if (error) return jsonResponse(500, { error: "grant_failed" });

  const balance = typeof data === "number" ? data : Number(data ?? 0);
  if (balance < 0) return jsonResponse(429, { error: "daily_cap_reached" });

  return jsonResponse(200, { balance });
```

- [ ] **Step 3: Update the module comment**

The file header still says the nonce path is disabled. Replace that paragraph
with an accurate description: the path is live for Tapsell only, is
client-attested, and is bounded by `AD_REWARD_DAILY_CAP`.

- [ ] **Step 4: Document the new secret**

Add `AD_REWARD_DAILY_CAP` (default 30) to the secrets list in the file header,
to `.env.example`, and to the `ad-reward-secrets` Makefile target.

- [ ] **Step 5: Verify**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/ad-reward/index.ts .env.example Makefile
git commit -m "feat: enable client-attested Tapsell reward claims behind a daily cap"
```

---

### Task 9: Tapsell rewarded ad provider

**Files:**
- Create: `src/ads/tapsellProvider.ts`
- Create: `src/ads/tapsellProvider.web.ts`
- Create: `plugins/withTapsellAdId.js`
- Modify: `src/ads/selectRewardedAdProvider.ts`
- Modify: `src/ads/rewardedAdProvider.ts` (no type change needed — `"tapsell"`
  is already in `RewardedAdProviderId`)
- Modify: `app.json`, `.env.example`, `package.json`
- Test: `src/ads/selectRewardedAdProvider.test.ts` (extend)

**Interfaces:**
- Consumes: `RewardedAdProvider`, `RewardOutcome` from
  `src/ads/rewardedAdProvider.ts`.
- Produces: `tapsellProvider: RewardedAdProvider` whose `show()` resolves
  `{ kind: "nonce", nonce }` — the existing `AiCreditsContext.claimNonce`
  path, dead until now, becomes live.

- [ ] **Step 1: Install**

```bash
npm install @react-native-tapsell-mediation/tapsell@^1.3.0
```

- [ ] **Step 2: Extend the selection test (failing)**

```ts
// append to src/ads/selectRewardedAdProvider.test.ts
it("prefers Tapsell when the build is configured for it", () => {
  const chosen = selectRewardedAdProvider({
    platform: "android",
    network: "tapsell",
    admobUnitId: "ca-app-pub-x/y",
    admobProvider: stubProvider("admob", true),
    tapsellProvider: stubProvider("tapsell", true),
  });
  expect(chosen.id).toBe("tapsell");
});

it("falls back to noop when the Tapsell build has no available provider", () => {
  const chosen = selectRewardedAdProvider({
    platform: "android",
    network: "tapsell",
    admobUnitId: "ca-app-pub-x/y",
    admobProvider: stubProvider("admob", true),
    tapsellProvider: stubProvider("tapsell", false),
  });
  expect(chosen.id).toBe("none");
});

it("ignores the Tapsell provider on iOS, where the SDK does not exist", () => {
  const chosen = selectRewardedAdProvider({
    platform: "ios",
    network: "tapsell",
    admobUnitId: "ca-app-pub-x/y",
    admobProvider: stubProvider("admob", true),
    tapsellProvider: stubProvider("tapsell", true),
  });
  expect(chosen.id).toBe("admob");
});
```

Add a `stubProvider` helper at the top of the file if one is not already there:

```ts
const stubProvider = (id: RewardedAdProviderId, available: boolean): RewardedAdProvider => ({
  id,
  isAvailable: () => available,
  show: async () => ({ kind: "dismissed" }),
});
```

- [ ] **Step 3: Run it**

Run: `npx vitest run src/ads/selectRewardedAdProvider.test.ts`
Expected: FAIL — `network` / `tapsellProvider` are not in `ProviderEnv`.

- [ ] **Step 4: Implement the routing**

```ts
// src/ads/selectRewardedAdProvider.ts
export type AdNetwork = "admob" | "tapsell";

export type ProviderEnv = {
  platform: "ios" | "android" | "web";
  /** Which network this build ships with. Bazaar/Myket builds set "tapsell". */
  network: AdNetwork;
  admobUnitId: string | null;
  admobProvider: RewardedAdProvider;
  tapsellProvider: RewardedAdProvider;
};

export function selectRewardedAdProvider(env: ProviderEnv): RewardedAdProvider {
  if (env.platform === "web") return noopProvider;

  // Tapsell ships no iOS SDK, so an iOS build configured for it still has to
  // fall through to AdMob rather than serve nothing.
  if (env.network === "tapsell" && env.platform === "android") {
    return env.tapsellProvider.isAvailable() ? env.tapsellProvider : noopProvider;
  }

  if (!env.admobUnitId) return noopProvider;
  if (!env.admobProvider.isAvailable()) return noopProvider;
  return env.admobProvider;
}
```

- [ ] **Step 5: Run the test**

Run: `npx vitest run src/ads/selectRewardedAdProvider.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the provider**

```ts
// src/ads/tapsellProvider.ts
//
// Tapsell rewarded ads (Android only — the npm package ships no iOS code).
//
// Unlike AdMob, Tapsell has no server-side verification: `onRewarded` is a
// client callback and nothing signs it. So this provider resolves with the
// nonce it minted before showing the ad, and the server grants credits
// against a daily cap rather than against proof. See
// supabase/migrations/20260802000001_ad_reward_daily_cap.sql.
//
// `require` + a `.web.ts` twin for the usual Metro reason — see admobProvider.ts.
import { Platform } from "react-native";
import type { RewardedAdProvider, RewardOutcome } from "./rewardedAdProvider";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

export function getTapsellZoneId(): string | null {
  return trim(process.env.EXPO_PUBLIC_TAPSELL_REWARDED_ZONE_ID) ?? null;
}

let mod: typeof import("@react-native-tapsell-mediation/tapsell") | null = null;
let probed = false;

function loadNative() {
  if (probed) return mod;
  probed = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@react-native-tapsell-mediation/tapsell");
  } catch {
    mod = null;
  }
  return mod;
}

export const tapsellProvider: RewardedAdProvider = {
  id: "tapsell",

  isAvailable(): boolean {
    if (Platform.OS !== "android") return false;
    if (!getTapsellZoneId()) return false;
    return loadNative() !== null;
  },

  async show({ nonce }): Promise<RewardOutcome> {
    const m = loadNative();
    const zoneId = getTapsellZoneId();
    if (!m || !zoneId) return { kind: "failed", reason: "no_provider" };
    if (!nonce) return { kind: "failed", reason: "no_nonce" };

    let adId: string;
    try {
      adId = await m.requestRewardedAd(zoneId);
    } catch (e) {
      return { kind: "failed", reason: e instanceof Error ? e.message : "request_failed" };
    }

    return new Promise<RewardOutcome>((resolve) => {
      // The SDK can fire onRewarded and onAdClosed for the same view; resolve once.
      let settled = false;
      const settle = (outcome: RewardOutcome) => {
        if (settled) return;
        settled = true;
        resolve(outcome);
      };

      let rewarded = false;
      m.showRewardedAd(adId, {
        onAdImpression: () => {},
        onAdClicked: () => {},
        onRewarded: () => {
          rewarded = true;
        },
        onAdFailed: (error: string) => settle({ kind: "failed", reason: error || "ad_failed" }),
        // Settle on close rather than on reward: closing is the last event, so
        // waiting for it avoids resolving while the ad is still on screen.
        onAdClosed: () => settle(rewarded ? { kind: "nonce", nonce } : { kind: "dismissed" }),
      });
    });
  },
};
```

> **Interface note:** `RewardedAdProvider.show` currently takes `{ userId }`.
> Extend the parameter object to `{ userId: string; nonce?: string }` in
> `src/ads/rewardedAdProvider.ts` and have `AiCreditsContext.watchAdForCredits`
> mint a nonce via `/ad-reward/nonce` before calling `show()` when
> `provider.id === "tapsell"`. AdMob ignores the extra field.

```ts
// src/ads/tapsellProvider.web.ts
import { noopProvider } from "./noopProvider";
import type { RewardedAdProvider } from "./rewardedAdProvider";

export function getTapsellZoneId(): string | null {
  return null;
}

export const tapsellProvider: RewardedAdProvider = noopProvider;
```

- [ ] **Step 7: Add the Expo config plugin for the AD_ID permission**

Tapsell's docs require `com.google.android.gms.permission.AD_ID` in the
manifest, and the package ships no config plugin.

```js
// plugins/withTapsellAdId.js
const { withAndroidManifest } = require("expo/config-plugins");

/**
 * Tapsell's mediation SDK requires the AD_ID permission to read the Android
 * advertising id. The npm package ships no config plugin, so a prebuild would
 * otherwise drop it and ads would fail to fill at runtime.
 */
module.exports = function withTapsellAdId(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest["uses-permission"] = manifest["uses-permission"] ?? [];
    const name = "com.google.android.gms.permission.AD_ID";
    const already = manifest["uses-permission"].some(
      (p) => p.$?.["android:name"] === name,
    );
    if (!already) {
      manifest["uses-permission"].push({ $: { "android:name": name } });
    }
    return cfg;
  });
};
```

- [ ] **Step 8: Wire app.json**

Add `"./plugins/withTapsellAdId"` to the `plugins` array, and add the Tapsell
app key at the **root** of `app.json` (a sibling of `expo`, not inside it —
the SDK's `app-json.gradle` reads `json["react-native-tapsell-mediation"]`):

```json
{
  "expo": { "...": "..." },
  "react-native-tapsell-mediation": {
    "TapsellMediationAppKey": "REPLACE_WITH_TAPSELL_APP_KEY"
  }
}
```

Document `EXPO_PUBLIC_TAPSELL_REWARDED_ZONE_ID` and
`EXPO_PUBLIC_AD_NETWORK` (`admob` | `tapsell`, default `admob`) in
`.env.example`.

- [ ] **Step 9: Extend the placeholder CI guard**

`.github/workflows/android-release.yml` already fails a release build when the
AdMob placeholder app id survives. Add `REPLACE_WITH_TAPSELL_APP_KEY` to the
same guard so a Bazaar build cannot ship with an unset Tapsell key.

- [ ] **Step 10: Verify**

Run: `npx vitest run src/ads/ && npx expo export --platform web && npm run lint`
Expected: all pass, web export clean.

- [ ] **Step 11: Commit**

```bash
git add src/ads/ plugins/withTapsellAdId.js app.json .env.example package.json package-lock.json .github/workflows/android-release.yml
git commit -m "feat: add Tapsell rewarded ad provider for Bazaar builds"
```

---

### Task 10: Release readiness — Play Protect, changelog, privacy

Play Protect is not a code defect. Bazaar's guidance attributes the warning to
an unfamiliar signing key, a low targetSdk, or uncommon SDKs. This app targets
Expo SDK 54 (current), so the signing key is the live hypothesis — and this
release *adds* two ad SDKs, which is the one lever that could make it worse.

**Files:**
- Modify: `changelogs/1.2.0.en.txt`, `changelogs/1.2.0.fa.txt`
- Modify: `changelogs/1.2.0.release-checklist.md`
- Modify: `src/i18n/privacyPolicy.ts` (en/fa/es), `public/legal/privacy.html`
- Modify: `app.json` (`expo.version` → `1.2.0`, `expo.android.versionCode` → `9`)

- [ ] **Step 1: Bump the version**

`expo.version` to `1.2.0` and `expo.android.versionCode` to `9`. Both stores
reject a republished versionCode, and the release workflow's `guard` job fails
if it did not increase.

- [ ] **Step 2: Add the Play Protect section to the checklist**

```markdown
## Play Protect (1.1.0 → 1.2.0 rejection)

Bazaar rejected versionCode 8 with "Play Protect hasn't seen an app from this
developer before." This is signing reputation, not a code defect.

- [ ] Confirm `ANDROID_KEYSTORE_BASE64` is byte-identical to the keystore that
      signed the accepted 1.1.0 build. A rotated key resets reputation and is
      the most likely cause. Compare the certificate fingerprint:
      `keytool -list -v -keystore keystore.jks | grep SHA256`
- [ ] File Google's Play Protect appeal at
      https://support.google.com/googleplay/android-developer/contact/appeal-protect
      Allow up to 3 days — Bazaar's own guidance notes the warning can persist
      that long after a fix.
- [ ] Re-verify after this release: it adds two ad SDKs, which Bazaar lists as
      a contributing factor. If the warning worsens, test a build with
      `EXPO_PUBLIC_AD_NETWORK` unset to isolate which SDK is implicated.
```

- [ ] **Step 3: Add the billing and cap items to the checklist**

```markdown
## Cafe Bazaar billing

- [ ] Set the four server secrets: `make verify-bazaar-secrets`
- [ ] Set `EXPO_PUBLIC_BAZAAR_RSA_PUBLIC_KEY` (Pishkhan → app → in-app billing)
- [ ] Set the three pass SKUs (`EXPO_PUBLIC_NIGHT_OUT_PASS_ID`, `_TRIP_PASS_ID`,
      `_EXPLORER_PASS_ID`) as EAS environment variables. **Without these the
      Plans screen offers passes that cannot be bought** — the inverse of the
      1.1.0 bug, where they were granted free.
- [ ] Buy each of the three passes on a real device from a Bazaar install and
      confirm a `pass_entitlements` row appears with `verified_at` set.
- [ ] Confirm a hand-inserted row with `verified_at = null` does NOT unlock AI.

## Ad credits

- [ ] Apply both migrations, then run `supabase/scripts/test_ai_credits.sql` and
      `supabase/scripts/test_pass_verification.sql` against a scratch database.
      Never against production — both insert into `auth.users`.
- [ ] Set `AD_REWARD_DAILY_CAP` (default 30). Confirm the 429 `daily_cap_reached`
      path by claiming past the cap.
- [ ] Confirm `/ad-reward/nonce` rejects `provider: "admob"` with 400.
```

- [ ] **Step 4: Update the changelogs**

`changelogs/1.2.0.en.txt` and `.fa.txt` are published verbatim as store copy.
Add a line about earning AI credits by watching ads, in the plain register the
existing entries use. Do not mention the bug fix in store copy.

- [ ] **Step 5: Update the privacy disclosure**

The advertising section already covers AdMob. Add Tapsell by name to
`src/i18n/privacyPolicy.ts` (all three locales) and `public/legal/privacy.html`,
noting that it is used only in builds distributed through Iranian app stores.

- [ ] **Step 6: Verify**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: the 18 pre-existing `src/observability/sentry.test.ts` failures
remain (an unrelated Rollup/Flow parsing issue, present before this branch);
nothing else fails.

- [ ] **Step 7: Commit**

```bash
git add app.json changelogs/ src/i18n/privacyPolicy.ts public/legal/privacy.html
git commit -m "chore: prepare 1.2.0 release notes, privacy disclosure and checklist"
```

---

## Self-Review

**Spec coverage.** The four decisions this plan implements: (1) Tapsell
client-attested with a daily cap — Tasks 7, 8, 9. (2) Ship the ads branch as
the store fix — the whole plan targets `implement/ads-for-ai-credits`, and
Task 4 Step 4 is what removes the 402 that broke AI. (3) Wire real Bazaar
billing — Tasks 3, 4, 5, 6. (4) Play Protect — Task 10, honestly scoped as
process rather than code.

**Three corrections made while writing:**

1. **`is_premium` cannot carry pass expiry.** The obvious fix — have
   `verify-bazaar-purchase` flip `profiles.is_premium = true` — silently grants
   permanent premium for a 24-hour Night Out pass, and would also fight
   `sync-apple-subscription` for ownership of the column. Task 2 introduces
   `tally_has_active_entitlement` instead, so expiry lives on the row.

2. **`RewardedAdProvider.show()` has no `nonce` parameter.** The existing
   signature is `show({ userId })`, designed around AdMob's SSV where the
   server learns the user from the signed callback. Tapsell needs the nonce to
   travel client-side. Flagged inline in Task 9 Step 6 rather than left for the
   implementer to discover mid-task.

3. **`/nonce` must reject AdMob explicitly.** Simply deleting the 501 guards
   would re-open the original vulnerability for AdMob too — a caller could mint
   a nonce claiming `provider: "admob"` and bypass the SSV signature entirely.
   Task 8 Step 1 adds the allow-list.

**Known gaps, deliberately not closed:**

- `bazaarApi.ts` assumes Bazaar mirrors Google Play's `purchaseState` /
  `consumptionState` encoding (0 = purchased, 0 = consumed). This comes from a
  third-party PHP wrapper, not from Bazaar's own reference, which is served by
  a client-rendered site that returns an empty shell to any fetch. **Verify
  against one real purchase before shipping** — Task 10's checklist has the
  step. If the encoding differs, only `parsePurchaseResponse` changes.
- No Deno runtime is available here, so all three Edge Functions are verified
  by review and staging deploy, not local execution. Same constraint the
  original ads work ran under.
- Tapsell's `onRewarded` cannot be tested off-device. Task 9's tests cover
  provider selection only; the ad flow itself needs the device checklist.
