/**
 * Cohort resolution for `app_config` rows.
 *
 * Deliberately dependency-free (no `Deno.*`, no `npm:` imports) so Vitest can
 * run it under Node — the same constraint `admobSsv.ts` and `bazaarApi.ts`
 * follow. All database I/O lives in the calling function's `index.ts`.
 *
 * Shared by `ai-proxy` (enforcement) and `get-ai-config` (client delivery) so
 * the two can never disagree about what a given caller's config is.
 */

export type Cohort = "everyone" | "premium" | "alpha" | "allowlist";

export type Visibility = "server" | "client" | "public";

export type ConfigRow = {
  key: string;
  cohort: Cohort;
  value: unknown;
  visibility: Visibility;
};

export type CallerCohorts = {
  premium: boolean;
  alpha: boolean;
  /** Keys this specific user is allowlisted for. Per-key, not global. */
  allowlistKeys: ReadonlySet<string>;
};

/**
 * A caller with no identity. Only `everyone` rows can match, which is exactly
 * the anonymous case — there is no cohort to resolve without a user id.
 */
export const ANON_CALLER: CallerCohorts = {
  premium: false,
  alpha: false,
  allowlistKeys: new Set<string>(),
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

const VISIBILITY_RANK: Readonly<Record<Visibility, number>> = {
  server: 0,
  client: 1,
  public: 2,
};

/**
 * The subset of resolved config a given audience may see.
 *
 * Visibility is taken from the WINNING row, not from any row — so a
 * server-only override at a high-precedence cohort cannot be bypassed by a
 * more visible row at a lower-precedence one.
 */
export function resolveForAudience(
  rows: ConfigRow[],
  caller: CallerCohorts,
  audience: "client" | "public",
): Record<string, unknown> {
  const floor = VISIBILITY_RANK[audience];
  const out: Record<string, unknown> = {};
  for (const [key, row] of winningRows(rows, caller)) {
    if (VISIBILITY_RANK[row.visibility] >= floor) out[key] = row.value;
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
