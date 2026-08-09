# Bazaar pass purchase — repeat-purchase and verification gaps

**Date:** 2026-08-09
**Status:** approved, ready for implementation

## Problem

Tally's three passes (Night Out 24h / Trip 7d / Explorer 30d) are sold as
one-time Cafe Bazaar in-app products, verified server-side by the
`verify-bazaar-purchase` Edge Function. Three defects in that path were found
while auditing it against Cafe Bazaar's Developer API v2 reference.

The reference could not be read directly — `developers.cafebazaar.ir` is a
client-rendered Nuxt SPA, which is why `bazaarApi.ts` carried an `UNVERIFIED`
comment. It is WordPress-backed, so the authoritative content is reachable at
`https://developers.cafebazaar.ir/wp-json/wp/v2/document/2453`
(rendered page: <https://developers.cafebazaar.ir/document/in-app-billing/api/validation/>).

### What the reference confirmed

The endpoint template in `buildValidateUrl` is exactly right. Of the three
field semantics that were guessed, two were right and one was wrong:

| Field | Reference | Prior code | Verdict |
| --- | --- | --- | --- |
| `purchaseState` | `0` normal, `1` refunded | `purchaseState === 0 ⇒ purchased` | correct |
| `consumptionState` | `0` = consumed, `1` = not consumed | same | correct — genuinely inverted vs Google Play |
| purchase time | field is `purchaseTime`, ms since epoch | read `parsed.time` | **wrong field name** |

The reference also states, verbatim: *"You can be sure that requested purchase
is not done, only when `error` is equal to `not_found`."*

### Defect 1 — purchase time read from the wrong field

`bazaarApi.ts` reads `parsed.time`, which is always `undefined`. So
`purchaseTimeMs` is always `null`, the sanity-window check in `index.ts`
always fails, `bazaar_purchase_time_out_of_range` is logged on every single
purchase, and the pass start time silently falls back to `Date.now()`.

It degrades gracefully, which is why it has not been noticed. But the clamp
logic is dead code today and the warning is pure noise — and once the field is
correct, a pass verified late (via the pending-retry path) will start from the
real purchase time instead of the retry time.

### Defect 2 — a malformed response terminally rejects a paid purchase

`index.ts` routes both `not_found` and `malformed` to `402 purchase_invalid`,
which the client treats as terminal: it clears the pending record and never
retries. Per the reference, only `not_found` proves a purchase was not made.
An unparseable body (a proxy error page, a Bazaar-side incident) is an outage,
not a fake purchase, and must not permanently cost a paying user their pass.

### Defect 3 — purchases are never consumed

`poolakey.consumePurchase` is never called. A Bazaar in-app product stays owned
until consumed, and `purchaseProduct` on an already-owned SKU fails. Passes are
inherently repeatable — a user who buys a Night Out pass, lets it lapse, and
buys the same SKU again is the core use case — so without consumption the
second purchase is impossible.

## Design

Four changes. All logic lands in modules that are already pure and unit-tested,
so this extends the existing Vitest suites rather than requiring a renderer.

### A. Read `purchaseTime` (`bazaarApi.ts`)

Read `parsed.purchaseTime` instead of `parsed.time`. Replace the `UNVERIFIED`
comment block with the confirmed semantics and a link to the reference. Update
the two tests that encode `"time"` in their fixtures.

### B. `malformed` is transient (`verify-bazaar-purchase/index.ts`)

Move `malformed` onto the `503 verification_unavailable` path alongside
`network` and `auth`. Only `not_found` continues to return `402`.

Consequence: the client persists a pending verification and replays it on the
next foreground, which is the existing recovery path — no new client code.

### C. Consume after verification

New `consumeBazaarPurchase(purchaseToken)` in `bazaarBilling.ts`, with a
`.web.ts` twin, wrapping `poolakey.consumePurchase`.

Called from `passPurchaseFlow.ts` on all three success paths — `performRequestPass`,
`performRequestExtension`, and `retryPendingBazaarVerification` — as a new
injected dependency, keeping the module free of native imports.

Two ordering rules:

1. **Verify → grant → consume.** Consuming before the grant lands risks burning
   a token whose entitlement was never recorded.
2. **A consume failure never fails the purchase.** The user already holds the
   pass; surfacing an error there would be a lie. Failures are swallowed, and
   change D is what recovers the un-consumed token.

Safe because consuming only flips `consumptionState`. `purchaseState` stays
`0`, so a replayed token still validates — which the pending-retry path depends on.

### D. Query before purchase (`bazaarBilling.ts`)

Before `purchaseProduct`, call `queryPurchaseProduct(productId)`. If it resolves
with a token, that token is a charge that was never consumed — the app was
killed between verification and consumption — and it is returned as if freshly
purchased. The existing downstream flow then verifies it (the server is
idempotent on `store_transaction_id` and returns the stored expiry) and consumes
it. If it rejects with `NotFoundException`, the SKU is unowned and the normal
purchase proceeds.

This is contained entirely within `purchaseBazaarProduct`; no caller changes.

Rejected alternative: matching an "already owned" error string from the failed
`purchaseProduct` call. Poolakey's taxonomy (`exceptions.ts`) has only
`ItemNotFound` / `Disconnected` / `BazaarNotFound`, so that string would be a
guess. `queryPurchaseProduct` is deterministic, and its native implementation
(`ReactNativePoolakeyModule.kt:173`) rejects with `NotFoundException` precisely
when the product is not owned.

Scope note: no live purchases exist yet, so this is not a backfill. It covers
the ongoing crash window, whose failure mode is severe and unrecoverable —
the user is charged and then permanently locked out of that SKU, with no retry
that helps.

## Out of scope

Migrating passes to real Bazaar subscriptions with trial support. That is a
separate, much larger change (client `subscribeProduct`, the `/subscription/`
validate endpoint, expiry driven by Bazaar rather than `PASS_DURATION_MS`,
plus DB and panel changes) and gets its own spec if wanted.

## Testing

- `bazaarApi.test.ts` — fixtures use `purchaseTime`; add a case asserting a
  body carrying only the old `time` key yields `purchaseTimeMs: null`.
- `passPurchaseFlow.test.ts` — consume is called after a successful buy,
  extend, and pending retry; is **not** called when verification fails; and a
  throwing consume still leaves the pass granted.
- `bazaarBilling.test.ts` — remains focused on the pure error classifier.
