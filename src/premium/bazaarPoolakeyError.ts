// Pure Poolakey error classification, shared by `bazaarBilling.ts` (native)
// and `bazaarBilling.web.ts` (web/iOS twin).
//
// This lives in its own file — rather than `bazaarBilling.web.ts` importing
// it straight from `./bazaarBilling` — because that specifier is ambiguous
// under Metro's platform-extension resolution: from *within*
// `bazaarBilling.web.ts`, a request for `./bazaarBilling` on the web
// platform resolves to `bazaarBilling.web.ts` itself (Metro picks the
// `.web.ts` twin over the base file regardless of which module is asking),
// producing a self-referential circular import. The re-exported
// `classifyPoolakeyError` getter then reads from its own not-yet-populated
// module, which recurses into itself indefinitely the first time anything
// calls it — a runtime `RangeError`, not a bundling failure, so
// `expo export --platform web` completing successfully does not catch it.
// A base name with no platform-specific twin has only one file to resolve
// to, so there is no ambiguity.
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
