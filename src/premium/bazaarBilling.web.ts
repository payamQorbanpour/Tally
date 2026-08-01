// Web/iOS twin. Metro picks this over `bazaarBilling.ts` for the web bundle,
// keeping the Android-only Poolakey package out of the module graph.
//
// Re-exports from `./bazaarPoolakeyError`, not `./bazaarBilling` — the
// latter is ambiguous under Metro's platform-extension resolution: from
// inside this very file, a request for `./bazaarBilling` on the web
// platform resolves back to `bazaarBilling.web.ts` itself, producing a
// self-referential circular import whose getter recurses indefinitely the
// first time it's called. See the comment atop `bazaarPoolakeyError.ts`.
export type { BazaarPurchaseResult } from "./bazaarPoolakeyError";
export { classifyPoolakeyError } from "./bazaarPoolakeyError";

export function isBazaarBillingAvailable(): boolean {
  return false;
}

export async function purchaseBazaarProduct(): Promise<{ kind: "unavailable" }> {
  return { kind: "unavailable" };
}
