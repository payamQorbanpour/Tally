# Onboarding Tour Remote-Config Flag Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a remote-config boolean, `onboarding_tour_enabled`, that lets an operator kill the first-run in-app feature tour (the fab/ai/qr tooltip walkthrough) without a client release.

**Architecture:** Register the key in the existing `app_config` system (schema + triggers already live via `20260804010000_app_config.sql`; this plan only adds a follow-up migration seeding one new key). On the client, gate `useAutoStartTour` in `src/providers/TourContext.tsx` on `configBool(config, "onboarding_tour_enabled", true)`. The gate check is extracted into a tiny pure function in a new file, `src/providers/tourGate.ts`, so it can be unit-tested under plain Node — `TourContext.tsx` itself imports `../db/DatabaseContext`, which (like every other file under `src/db` and `src/data`) pulls in React Native/Expo modules that don't run under the project's `vitest` config (`environment: "node"`, and no existing `.test.ts` file imports `DatabaseContext` or `tallyRepo` for this reason).

**Tech Stack:** TypeScript, React (hooks/context), Supabase Postgres (SQL migration), Vitest.

## Global Constraints

- Every `app_config` key ships **fail-open**: absent or malformed remote config must leave today's behavior unchanged (tour enabled). This is the same per-key-fallback discipline `configBool`/`configInt`/`configString` already enforce (`src/core/remoteConfig.ts:46-49`).
- SQL migrations are additive only — `insert ... on conflict (key) do nothing` / `on conflict (key, cohort) do nothing` — never destructive, per every existing migration under `supabase/migrations/`.
- Operator recipes in `supabase/scripts/set-app-config.sql` must be self-contained (own `set local app.config_actor = '<name>';` line) and shipped **commented out**, matching every existing recipe in that file.
- This flag gates **only** the in-app feature tour (`TourProvider` / `useAutoStartTour`). The separate onboarding flow (`OnboardingProvider`, `SETTINGS_KEYS.onboardingDone`) is untouched by this plan.

---

### Task 1: Register `onboarding_tour_enabled` in the `app_config` registry

**Files:**
- Create: `supabase/migrations/20260805000000_onboarding_tour_config.sql`
- Modify: `supabase/scripts/set-app-config.sql` (append one recipe section)

**Interfaces:**
- Produces: an `app_config_keys` row `('onboarding_tour_enabled', 'boolean', 'public', ...)` and an `app_config` row `('onboarding_tour_enabled', 'everyone', true, 'public')` — read by Task 3 via `configBool(config, "onboarding_tour_enabled", true)`.

This task has no unit test (it's a SQL migration; the project has no automated migration test harness — every existing migration under `supabase/migrations/` ships without one). Verify by reading the diff against the pattern in `20260804010000_app_config.sql:180-240`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260805000000_onboarding_tour_config.sql`:

```sql
-- Adds `onboarding_tour_enabled` to the app_config registry created by
-- 20260804010000_app_config.sql. First follow-up single-key addition to
-- that registry — mirrors the SHAPE of that migration's two insert blocks
-- (registry row, then seed row) since there is no prior "add one key"
-- migration to follow.
--
-- Gates only the in-app feature tour (`TourProvider` / `useAutoStartTour`
-- in src/providers/TourContext.tsx) — NOT the separate onboarding flow
-- (`OnboardingProvider`, SETTINGS_KEYS.onboardingDone). `public` because a
-- hostile client lying about this value costs nothing: it only affects
-- whether tooltips appear, never security or billing.
--
-- Seeded true at everyone, matching today's always-on behaviour exactly, so
-- applying this migration changes nothing observable.

insert into public.app_config_keys (key, value_type, max_visibility, description) values
  ('onboarding_tour_enabled', 'boolean', 'public',
   'False suppresses the first-run in-app feature tour (fab/ai/qr walkthrough). Does not affect the separate onboarding flow.')
on conflict (key) do nothing;

insert into public.app_config (key, cohort, value, visibility) values
  ('onboarding_tour_enabled', 'everyone', 'true'::jsonb, 'public')
on conflict (key, cohort) do nothing;
```

- [ ] **Step 2: Add the operator recipe**

In `supabase/scripts/set-app-config.sql`, insert the following new section immediately after the "Recipe: disable cloud sync app-wide" section (which ends at the line `--       updated_at = now();` right before `-- ─────────────────────── Recipe: read the audit trail for a key ────────`):

```sql
-- ─────────────────────── Recipe: toggle the onboarding tour ────────────
-- `onboarding_tour_enabled` is a `boolean`, `max_visibility = 'public'`.
-- False suppresses the first-run in-app feature tour (fab/ai/qr walkthrough,
-- gated in `useAutoStartTour`, src/providers/TourContext.tsx) — it does NOT
-- touch the separate onboarding flow (`OnboardingProvider`). Use this to
-- silence the tour without a client release, e.g. if a tooltip target is
-- broken on a shipped build.

-- set local app.config_actor = '<your name>';
--
-- insert into public.app_config (key, cohort, value, visibility)
-- values (
--   'onboarding_tour_enabled',
--   'everyone',
--   'false'::jsonb,     -- <<< true to re-enable
--   'public'
-- )
-- on conflict (key, cohort) do update
--   set value = excluded.value,
--       updated_at = now();

```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260805000000_onboarding_tour_config.sql supabase/scripts/set-app-config.sql
git commit -m "feat(config): add onboarding_tour_enabled remote-config key"
```

---

### Task 2: Pure gate function + unit tests

**Files:**
- Create: `src/providers/tourGate.ts`
- Test: `src/providers/tourGate.test.ts`

**Interfaces:**
- Consumes: `configBool(c: RemoteConfig, key: string, fallback: boolean): boolean` and `type RemoteConfig` from `../core/remoteConfig` (`src/core/remoteConfig.ts:18,46-49`).
- Produces: `isOnboardingTourRemotelyEnabled(config: RemoteConfig): boolean`, consumed by Task 3's edit to `useAutoStartTour`.

- [ ] **Step 1: Write the failing tests**

Create `src/providers/tourGate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseRemoteConfig } from "../core/remoteConfig";
import { isOnboardingTourRemotelyEnabled } from "./tourGate";

describe("isOnboardingTourRemotelyEnabled", () => {
  it("defaults to true when the key is absent", () => {
    expect(isOnboardingTourRemotelyEnabled(parseRemoteConfig({ config: {} }))).toBe(true);
  });

  it("defaults to true when the key is malformed", () => {
    const c = parseRemoteConfig({ config: { onboarding_tour_enabled: "nope" } });
    expect(isOnboardingTourRemotelyEnabled(c)).toBe(true);
  });

  it("is false when the remote value is explicitly false — this is what suppresses the auto-start call in useAutoStartTour", () => {
    const c = parseRemoteConfig({ config: { onboarding_tour_enabled: false } });
    expect(isOnboardingTourRemotelyEnabled(c)).toBe(false);
  });

  it("is true when the remote value is explicitly true", () => {
    const c = parseRemoteConfig({ config: { onboarding_tour_enabled: true } });
    expect(isOnboardingTourRemotelyEnabled(c)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/providers/tourGate.test.ts`
Expected: FAIL — `Failed to resolve import "./tourGate"` (the module doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/providers/tourGate.ts`:

```ts
import { configBool, type RemoteConfig } from "../core/remoteConfig";

/**
 * Whether the remote `onboarding_tour_enabled` flag allows the first-run
 * feature tour to auto-start. Kept in its own module (rather than inlined
 * in TourContext.tsx, which imports DatabaseContext) so this gate is
 * unit-testable under plain Node.
 */
export function isOnboardingTourRemotelyEnabled(config: RemoteConfig): boolean {
  return configBool(config, "onboarding_tour_enabled", true);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/providers/tourGate.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/providers/tourGate.ts src/providers/tourGate.test.ts
git commit -m "feat(config): add pure gate for the onboarding-tour remote flag"
```

---

### Task 3: Wire the gate into `useAutoStartTour`

**Files:**
- Modify: `src/providers/TourContext.tsx:1-12` (imports), `:154-179` (`useAutoStartTour`)

**Interfaces:**
- Consumes: `isOnboardingTourRemotelyEnabled` from `./tourGate` (Task 2); `useRemoteConfig(): { config: RemoteConfig; refresh: () => void }` from `../premium/RemoteConfigContext` (`src/premium/RemoteConfigContext.tsx:216-220`).

No new automated test for this step — the gate logic itself is fully covered by Task 2's unit tests, and nothing in this codebase renders hooks in tests (no `@testing-library/react*`/`renderHook` usage exists under `src`). Verify with typecheck + the full suite.

- [ ] **Step 1: Add the imports**

In `src/providers/TourContext.tsx`, change:

```ts
import { setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
```

to:

```ts
import { setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import { useRemoteConfig } from "../premium/RemoteConfigContext";
import { isOnboardingTourRemotelyEnabled } from "./tourGate";
```

- [ ] **Step 2: Gate the effect**

Change the current `useAutoStartTour` (lines 154-179):

```ts
export function useAutoStartTour(opts: { enabled: boolean }): void {
  const { db } = useTallyData();
  const { start, step } = useTour();
  const triggeredRef = useRef(false);
  const enabled = opts.enabled;

  useEffect(() => {
    if (!enabled) return;
    if (triggeredRef.current) return;
    if (step !== null) return; // tour already running
    triggeredRef.current = true;
    void (async () => {
      try {
        const row = await db.getFirstAsync<{ value: string }>(
          `SELECT value FROM app_settings WHERE setting_key = ?`,
          SETTINGS_KEYS.tourDone,
        );
        if (row?.value === "1") return;
        start();
      } catch {
        // If the read fails (DB hiccup), don't auto-start — user can re-open
        // the tour manually from settings later if we add that affordance.
      }
    })();
  }, [enabled, db, start, step]);
}
```

to:

```ts
export function useAutoStartTour(opts: { enabled: boolean }): void {
  const { db } = useTallyData();
  const { start, step } = useTour();
  const { config } = useRemoteConfig();
  const triggeredRef = useRef(false);
  const enabled = opts.enabled;

  useEffect(() => {
    if (!enabled) return;
    if (triggeredRef.current) return;
    if (step !== null) return; // tour already running
    if (!isOnboardingTourRemotelyEnabled(config)) return; // remote kill switch
    triggeredRef.current = true;
    void (async () => {
      try {
        const row = await db.getFirstAsync<{ value: string }>(
          `SELECT value FROM app_settings WHERE setting_key = ?`,
          SETTINGS_KEYS.tourDone,
        );
        if (row?.value === "1") return;
        start();
      } catch {
        // If the read fails (DB hiccup), don't auto-start — user can re-open
        // the tour manually from settings later if we add that affordance.
      }
    })();
  }, [enabled, db, start, step, config]);
}
```

- [ ] **Step 3: Typecheck and run the full test suite**

Run: `npx tsc --noEmit`
Expected: no new errors.

Run: `npx vitest run`
Expected: all tests pass, including the 4 new ones from Task 2.

- [ ] **Step 4: Commit**

```bash
git add src/providers/TourContext.tsx
git commit -m "feat(config): gate the first-run feature tour on onboarding_tour_enabled"
```

## Self-Review Notes

- **Spec coverage:** the design doc's single requirement for this piece — "gate inside `useAutoStartTour`... fails open... operator recipe added" — is covered by Tasks 1-3.
- **GroupsScreen.tsx's `useAutoStartTour({ enabled: false })` call site is intentionally untouched** — it's permanently disabled by an existing comment ("First-run tour auto-start moved to AddExpense") and stays `false` regardless of the remote flag. No task in this plan touches `AddExpenseScreen.tsx` or `GroupsScreen.tsx` — the flag is consumed entirely inside the hook, exactly as the design doc specifies ("both existing call sites... inherit the flag automatically").
