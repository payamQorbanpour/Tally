/**
 * Response shaping for `get-app-config`. Dependency-free (no `Deno.*`, no
 * `npm:` imports) so Vitest can run it under Node — the same constraint
 * `appConfigResolve.ts` follows. All I/O lives in the calling `index.ts`.
 */

export type Audience = "client" | "public";

/**
 * How long a client may keep a payload. Public config refreshes five times
 * faster because it carries the incident switches (maintenance, sync,
 * min-version) where minutes matter.
 */
export const TTL_SECONDS: Readonly<Record<Audience, number>> = {
  public: 300,
  client: 900,
};

export function cacheHeaders(audience: Audience): Record<string, string> {
  // The anonymous payload is byte-identical for every caller, so a CDN can
  // serve it and the database sees ~one query per max-age regardless of
  // traffic. The authenticated payload is per-user and must never be stored.
  return audience === "public"
    ? { "Cache-Control": "public, max-age=300, s-maxage=300" }
    : { "Cache-Control": "private, no-store" };
}

/**
 * The pre-generalization `{flags, limits}` shape, split by JS type.
 *
 * Only used by the `get-ai-config` alias. Anything that is neither a boolean
 * nor a number is dropped rather than shipped, because the installed clients
 * that call that endpoint have no way to parse it.
 */
export function splitLegacyShape(config: Record<string, unknown>): {
  flags: Record<string, boolean>;
  limits: Record<string, number>;
} {
  const flags: Record<string, boolean> = {};
  const limits: Record<string, number> = {};
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === "boolean") flags[key] = value;
    else if (typeof value === "number") limits[key] = value;
  }
  return { flags, limits };
}
