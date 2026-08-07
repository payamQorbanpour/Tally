export type ReceiptItem = {
  id: string;
  /** Integer minor units. Always non-negative — a receipt item's own price,
   *  before VAT and before its share of the discount. */
  amountMinor: number;
  /** Members sharing this item. Empty = unassigned. Duplicates are
   *  tolerated (see `orderSharers`) rather than silently losing money. */
  sharerIds: string[];
};

/** VAT rate expressed in parts-per-million *of the fraction*, not of the
 *  percentage: the multiplier applied to an amount is `vatRatePpm /
 *  1_000_000`. So 10% is `100_000`, and 16.597% — the shape a real rate
 *  actually takes, since it is usually derived as `printed tax ÷ item
 *  subtotal` rather than typed in round — is `165_970`, exactly, with no
 *  rounding on the way in. An integer field was chosen specifically because
 *  a `number` holding "16.597" as a percentage is fine to *store* but
 *  invites float drift the moment it is multiplied by an amount; ppm makes
 *  every rate an exact integer and pushes all rounding into one documented
 *  place (`vatForAmount`, via `BigInt`). Six decimal digits of percentage
 *  resolution (0.0001%) is comfortably finer than any rate a receipt could
 *  plausibly produce. Zero is valid — no VAT. */
export type VatRatePpm = number;

export type ReceiptSplitInput = {
  items: ReceiptItem[];
  /** Applies to every item, assigned or not — see module doc for why. */
  vatRatePpm: VatRatePpm;
  /** Fixed amount in minor units (not a percentage), distributed across
   *  items in proportion to each item's own `amountMinor`, applied BEFORE
   *  VAT is computed on what remains. See module doc for the ordering
   *  rationale. Clamped to the item subtotal — see `computeReceiptSplit`. */
  discountMinor: number;
  memberOrder: string[];
};

export type ReceiptSplitResult = {
  /** Member id → total owed, in minor units. Only items with at least one
   *  sharer contribute here — an unclaimed item's amount, VAT, and discount
   *  share go unclaimed, the same convention the old module used. Sums to
   *  `receiptTotalMinor` exactly when every item is assigned; otherwise it
   *  falls short by exactly the unassigned items' combined total. */
  owedByMemberId: Map<string, number>;
  /** Item id → that item's own VAT amount, in minor units, for a row's
   *  "+N" display. Present for EVERY item, assigned or not — this is the
   *  structural fix: an item's VAT depends only on its own (post-discount)
   *  amount and the receipt-wide rate, never on which other items happen to
   *  be assigned. Sums exactly to the receipt's total VAT (it IS that sum,
   *  by construction — nothing to reconcile). */
  vatByItemId: Map<string, number>;
  /** Item id → that item's share of the fixed discount, in minor units.
   *  Present for every item, mirroring `vatByItemId`. Exposed separately
   *  from the VAT amount so a row can show "amount − discount + vat"
   *  without the caller having to re-derive the split. */
  discountByItemId: Map<string, number>;
  /** Items with no sharers. These still get a VAT and discount entry above
   *  (for display) but contribute nothing to `owedByMemberId` and block
   *  Save the same way the old module's unassigned item lines did. */
  unassignedItemIds: string[];
  /** Sum of every item's (amount − its discount share + its VAT), across
   *  ALL items regardless of assignment — the total the expense should be
   *  saved with. Deliberately independent of `owedByMemberId`: the receipt
   *  has a real total even before everyone has claimed their items. */
  receiptTotalMinor: number;
};

/** Sort a line's sharers by their position in the group's member order, so
 *  the odd minor unit lands on a stable person instead of drifting with the
 *  order the user happened to tap people in. Also de-duplicates: a sharer
 *  listed twice must not be double-counted by splitEvenly's output Map, or
 *  the per-item shares silently undercount the item's total. */
function orderSharers(sharerIds: string[], memberOrder: string[]): string[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i] as const));
  return [...new Set(sharerIds)].sort(
    (a, b) =>
      (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Split `total` as evenly as possible across `ids`, leftover minor units to
 *  the earliest ids. Negative totals split symmetrically (not currently
 *  reachable — item totals are clamped non-negative — but kept sign-safe
 *  since it costs nothing and matches the historical helper's contract). */
function splitEvenly(total: number, ids: string[]): Map<string, number> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const base = Math.floor(abs / ids.length);
  let remainder = abs - base * ids.length;
  for (const id of ids) {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    out.set(id, sign * (base + extra));
  }
  return out;
}

/** Floor-divide two bigints (round toward -Infinity, unlike `/` on bigint
 *  which truncates toward zero). Needed because `total * w` can exceed
 *  2^53 at real-world magnitudes (an IRR receipt's minor units squared
 *  comfortably clears it), where `number` arithmetic silently loses the
 *  low bits and can floor to the wrong integer. */
function floorDivBigInt(a: bigint, b: bigint): bigint {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n !== b < 0n ? q - 1n : q;
}

/** Distribute `total` across the ids in `weights` in proportion to those
 *  weights, using the largest-remainder method: each id first gets `floor`
 *  of its exact share, then the leftover minor units go one at a time to
 *  whoever's discarded fraction was biggest, earliest `order` position
 *  breaking ties. Reused for two different distributions in this module —
 *  a discount across item ids, ordered by receipt line order — the same
 *  shape of problem either time, just a different id space and a different
 *  stable order to break ties with.
 *
 *  PRECONDITION the largest-remainder loop below relies on: `leftover` must
 *  come out `< ordered.length`. That only holds if the denominator
 *  (`weightSum`) is the sum of weights restricted to `ordered` — i.e. every
 *  key in `weights` is also present in `order`. A `weights` key absent from
 *  `order` would inflate the sum passed in without a corresponding id to
 *  floor-divide it to, understating `consumed` and inflating `leftover` by
 *  that stale weight's share of `total` — which the loop's cycling does not
 *  bound, degrading it to O(total) at real receipt magnitudes (multi-second
 *  freezes in this app's IRR-scale amounts). This function derives
 *  `weightSum` itself, restricted to `ordered`, so the precondition holds
 *  unconditionally rather than by caller discipline; the loop below is
 *  additionally capped at `ordered.length` iterations as a hard backstop.
 *
 *  The floor and its remainder are both computed in BigInt: `total * w` can
 *  exceed Number.MAX_SAFE_INTEGER well within this app's real receipt sizes
 *  (an IRR bill's amounts squared clear 2^53 by roughly two orders of
 *  magnitude), and a float-computed floor can land one minor unit off from
 *  the true value in that range — which would hand the disputed unit to the
 *  wrong id even though the total still balances. */
function distributeProportionally(
  total: number,
  weights: Map<string, number>,
  order: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = order.filter((id) => weights.has(id));
  const weightSum = ordered.reduce((sum, id) => sum + (weights.get(id) ?? 0), 0);
  if (weightSum === 0) return out;
  const weightSumBig = BigInt(weightSum);
  let consumed = 0;
  const remainders: { id: string; remainder: bigint }[] = [];
  for (const id of ordered) {
    const w = weights.get(id) ?? 0;
    const numerator = BigInt(total) * BigInt(w);
    const vBig = floorDivBigInt(numerator, weightSumBig);
    const v = Number(vBig);
    out.set(id, v);
    consumed += v;
    remainders.push({ id, remainder: numerator - vBig * weightSumBig });
  }
  let leftover = total - consumed;
  // Mathematically leftover is always >= 0 here (see above), but this is
  // defensive: handle both signs so the reconciliation invariant holds
  // unconditionally rather than by assuming the proof always applies.
  const step = leftover < 0 ? -1 : 1;
  // Stable sort keeps `ordered`'s order as the tie-break for equal
  // remainders. Largest remainder first when handing units out; smallest
  // first when clawing an over-allocation back.
  remainders.sort((a, b) => {
    const diff = step > 0 ? b.remainder - a.remainder : a.remainder - b.remainder;
    return diff > 0n ? 1 : diff < 0n ? -1 : 0;
  });
  // Bounded at `remainders.length` (== `ordered.length`) iterations: with
  // `weightSum` derived from `ordered` above, `leftover` is guaranteed to be
  // smaller than that already, so this is a hard backstop rather than the
  // normal exit condition — see the precondition note on this function.
  for (let i = 0; leftover !== 0 && i < remainders.length; i += 1) {
    const id = remainders[i % remainders.length]!.id;
    out.set(id, (out.get(id) ?? 0) + step);
    leftover -= step;
  }
  return out;
}

/** VAT on a single item's own (already-discounted) amount, rounded to the
 *  nearest minor unit (ties away from zero — both operands are always
 *  non-negative here, so BigInt's truncating division is exactly a floor,
 *  which is what the `+ scale` half-adjustment before it needs). This is
 *  deliberately NOT a largest-remainder distribution: that method exists to
 *  divide one total fairly across several recipients so their shares add
 *  back up to it. Here there is only one recipient — the item itself — so
 *  there is nothing to divide and nothing to reconcile beyond rounding this
 *  one number correctly. `BigInt` because `amountMinor * vatRatePpm`
 *  clears 2^53 well within real IRR receipt magnitudes (see module tests),
 *  where `number` multiplication would silently corrupt the low bits. */
function vatForAmount(amountMinor: number, vatRatePpm: VatRatePpm): number {
  if (amountMinor === 0 || vatRatePpm === 0) return 0;
  const scale = 1_000_000n;
  const numerator = BigInt(amountMinor) * BigInt(vatRatePpm);
  const rounded = (numerator * 2n + scale) / (2n * scale);
  return Number(rounded);
}

export function computeReceiptSplit(input: ReceiptSplitInput): ReceiptSplitResult {
  const { items, vatRatePpm, discountMinor, memberOrder } = input;

  const owedByMemberId = new Map<string, number>();
  const vatByItemId = new Map<string, number>();
  const discountByItemId = new Map<string, number>();
  const unassignedItemIds: string[] = [];
  let receiptTotalMinor = 0;

  const itemSubtotal = items.reduce((sum, it) => sum + it.amountMinor, 0);
  // The discount is a fixed amount, but a mistyped or stale one could
  // exceed the receipt's own subtotal. Clamping here — rather than trusting
  // the caller — is what keeps every downstream per-item share below that
  // item's own amount: a proportional share of a total that is itself
  // capped at `itemSubtotal` can never exceed the weight it was
  // proportional to, so no item's post-discount amount can go negative.
  const effectiveDiscount = Math.min(Math.max(0, discountMinor), itemSubtotal);

  const itemWeights = new Map(items.map((it) => [it.id, it.amountMinor] as const));
  // Items have no group-level ordering analogous to `memberOrder`, so the
  // next best stable order — for breaking largest-remainder ties on the
  // discount below — is the position each item holds in the caller's own
  // `items` array: the receipt's own line order, which does not drift
  // unless the caller explicitly reorders items.
  const itemOrder = items.map((it) => it.id);
  const discountShares = distributeProportionally(effectiveDiscount, itemWeights, itemOrder);

  for (const it of items) {
    const discountShare = discountShares.get(it.id) ?? 0;
    const netAfterDiscount = it.amountMinor - discountShare;
    const vat = vatForAmount(netAfterDiscount, vatRatePpm);
    const itemTotal = netAfterDiscount + vat;

    discountByItemId.set(it.id, discountShare);
    vatByItemId.set(it.id, vat);
    receiptTotalMinor += itemTotal;

    const sharers = orderSharers(it.sharerIds, memberOrder);
    if (sharers.length === 0) {
      unassignedItemIds.push(it.id);
      continue;
    }
    const shares = splitEvenly(itemTotal, sharers);
    for (const [id, v] of shares) {
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
  }

  return {
    owedByMemberId,
    vatByItemId,
    discountByItemId,
    unassignedItemIds,
    receiptTotalMinor,
  };
}
