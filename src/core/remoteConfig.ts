/**
 * The client's view of remote config: an untyped bag of resolved values plus
 * typed accessors that apply a fallback per key.
 *
 * Pure — no I/O — so the parsing rules are testable in isolation, the same
 * split `aiAccess.ts` and `aiCreditCost.ts` already use. The fetch lives in
 * `remoteConfigClient.ts`.
 *
 * Fallback happens at READ time, not parse time. That is what makes one
 * malformed value cost exactly one key: there is no eager shaping step that
 * could discard a whole payload because of a single bad entry.
 *
 * Everything fails open. `ai-proxy` enforces the same flags server-side, so a
 * stale or empty client config is never a bypass — it shows a button and gets
 * a clean 403 back.
 */

export type RemoteConfig = Readonly<Record<string, unknown>>;

export const EMPTY_REMOTE_CONFIG: RemoteConfig = Object.freeze({});

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Parse a `get-app-config` response. Never throws. */
export function parseRemoteConfig(input: unknown): RemoteConfig {
  if (!isRecord(input) || !isRecord(input.config)) return EMPTY_REMOTE_CONFIG;
  return Object.freeze({ ...input.config });
}

export function configBool(c: RemoteConfig, key: string, fallback: boolean): boolean {
  const v = c[key];
  return typeof v === "boolean" ? v : fallback;
}

export function configInt(c: RemoteConfig, key: string, fallback: number): number {
  const v = c[key];
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : fallback;
}

export function configString(c: RemoteConfig, key: string, fallback: string): string {
  const v = c[key];
  return typeof v === "string" && v.trim() !== "" ? v : fallback;
}

/**
 * A `{ locale: text }` map, or null when absent or malformed.
 *
 * An empty object counts as absent: a map with no locales cannot answer any
 * lookup, so callers should take their bundled fallback rather than hold an
 * object that always misses.
 */
export function configLocaleMap(c: RemoteConfig, key: string): Record<string, string> | null {
  const v = c[key];
  if (!isRecord(v)) return null;
  const out: Record<string, string> = {};
  for (const [locale, text] of Object.entries(v)) {
    if (typeof text !== "string") return null;
    out[locale] = text;
  }
  return Object.keys(out).length > 0 ? out : null;
}
