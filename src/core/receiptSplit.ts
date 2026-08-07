export type SplitLineKind = "item" | "spread";

export type SplitLine = {
  id: string;
  /** Integer minor units. Negative for discounts. */
  amountMinor: number;
  /** Members sharing this line. Empty = unassigned. */
  sharerIds: string[];
  kind: SplitLineKind;
};

export type ReceiptSplitResult = {
  /** Member id → total owed, in minor units. Sums to the input total exactly. */
  owedByMemberId: Map<string, number>;
  /** Line id → (member id → their slice of that line). Drives the row tray. */
  perLineByMember: Map<string, Map<string, number>>;
  /** Lines that require sharers but have none. Spread lines only need their
   *  own sharers — and so can appear here — when there are no item lines at
   *  all; otherwise they ride proportionally on the item subtotal and never
   *  block Save on their own. */
  unassignedLineIds: string[];
  /** Item line id → the portion of every spread line's total (VAT, service
   *  charge, discounts) that line carries, in minor units, in proportion to
   *  that item line's own `amountMinor`. This is the row-level counterpart
   *  of `owedByMemberId`'s per-member proportional split — drives a display
   *  like "جوجه کبک 26,000,000 +4,313,924".
   *
   *  Only lines that are `kind: "item"` AND have at least one sharer
   *  participate, mirroring how an unassigned item line is already excluded
   *  from `itemSubtotal` and `perLineByMember` elsewhere in this module: an
   *  item nobody has claimed yet carries no tax of its own. A missing key
   *  means 0, the same convention `perLineByMember` already uses for lines
   *  it omits.
   *
   *  Each spread line is distributed — and reconciles — independently, the
   *  same way the per-member pass handles multiple spread lines, so the sum
   *  over every entry equals the sum of all spread lines' amounts, provided
   *  at least one item line is assigned. If none are, this map is empty and
   *  that total goes unclaimed — the same outcome `owedByMemberId` has in
   *  that case (see the "contributes nothing when every item line is
   *  unassigned" test).
   *
   *  Empty outright in the degenerate case — no item lines at all — since
   *  spread lines then behave as item lines themselves (see `isItemLike`)
   *  and carry no allocation of their own. */
  spreadByLineId: Map<string, number>;
};

/** Sort a line's sharers by their position in the group's member order, so
 *  the odd minor unit lands on a stable person instead of drifting with the
 *  order the user happened to tap people in. Also de-duplicates: a sharer
 *  listed twice must not be double-counted by splitEvenly's output Map, or
 *  the per-line shares silently undercount the line's total. */
function orderSharers(sharerIds: string[], memberOrder: string[]): string[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i] as const));
  return [...new Set(sharerIds)].sort(
    (a, b) =>
      (rank.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

/** Split `total` as evenly as possible across `ids`, leftover minor units to
 *  the earliest ids. Negative totals (discounts) split symmetrically. */
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

/** Distribute `total` across members in proportion to `weights`, using the
 *  largest-remainder method: each member first gets `floor` of their exact
 *  share, then the leftover minor units go one at a time to whoever's
 *  discarded fraction was biggest, earliest `memberOrder` position breaking
 *  ties. This is what makes a person who ate more carry more VAT down to the
 *  minor unit, instead of the leftover piling arbitrarily onto whoever is
 *  first in `memberOrder` regardless of how close their share was to the next
 *  unit.
 *
 *  PRECONDITION the largest-remainder loop below relies on: `leftover` must
 *  come out `< ordered.length`. That only holds if the denominator
 *  (`weightSum`) is the sum of weights restricted to `ordered` — i.e. every
 *  key in `weights` is also present in `memberOrder`. A `weights` key absent
 *  from `memberOrder` (e.g. a sharer id left over from a mid-flow group
 *  switch, which can survive an inclusion filter upstream without surviving
 *  into the new group's member list) would inflate the sum passed in without
 *  a corresponding member to floor-divide it to, understating `consumed` and
 *  inflating `leftover` by that stale weight's share of `total` — which the
 *  loop's `% remainders.length` cycling does not bound, degrading it to
 *  O(total) at real receipt magnitudes (multi-second freezes in this app's
 *  IRR-scale amounts). This function derives `weightSum` itself, restricted
 *  to `ordered`, so the precondition holds unconditionally rather than by
 *  caller discipline; the loop below is additionally capped at
 *  `ordered.length` iterations as a hard backstop.
 *
 *  The floor and its remainder are both computed in BigInt: `total * w` can
 *  exceed Number.MAX_SAFE_INTEGER well within this app's real receipt sizes
 *  (an IRR bill's amounts squared clear 2^53 by roughly two orders of
 *  magnitude), and a float-computed floor can land one minor unit off from
 *  the true value in that range — which would hand the disputed unit to the
 *  wrong member even though the group total still balances. */
function distributeProportionally(
  total: number,
  weights: Map<string, number>,
  memberOrder: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  const ordered = memberOrder.filter((id) => weights.has(id));
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
  // Stable sort keeps `ordered`'s memberOrder as the tie-break for equal
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

export function computeReceiptOwed(
  lines: SplitLine[],
  memberOrder: string[],
): ReceiptSplitResult {
  const owedByMemberId = new Map<string, number>();
  const perLineByMember = new Map<string, Map<string, number>>();
  const unassignedLineIds: string[] = [];
  const spreadByLineId = new Map<string, number>();

  const hasItemLines = lines.some((l) => l.kind === "item");
  // Degenerate receipt — nothing but surcharges. There is no item subtotal to
  // be proportional to, so surcharges behave as ordinary shared items.
  const isItemLike = (l: SplitLine) => (hasItemLines ? l.kind === "item" : true);

  const itemSubtotal = new Map<string, number>();
  // Weights (and their stable order) for the per-item-line surcharge pass
  // below. Items have no group-level ordering analogous to `memberOrder`,
  // so the next best stable order is the position each assigned item line
  // holds in the caller's own `lines` array — the receipt's own line order,
  // which does not drift unless the caller explicitly reorders lines. Keyed
  // by `ln.kind === "item"` rather than `isItemLike`, so in the degenerate
  // case (no real item lines) this stays empty and spread lines correctly
  // carry no allocation of their own.
  const itemLineWeights = new Map<string, number>();
  const itemLineOrder: string[] = [];
  for (const ln of lines) {
    if (!isItemLike(ln)) continue;
    if (ln.sharerIds.length === 0) {
      unassignedLineIds.push(ln.id);
      continue;
    }
    const shares = splitEvenly(ln.amountMinor, orderSharers(ln.sharerIds, memberOrder));
    perLineByMember.set(ln.id, shares);
    for (const [id, v] of shares) {
      itemSubtotal.set(id, (itemSubtotal.get(id) ?? 0) + v);
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
    if (ln.kind === "item") {
      itemLineWeights.set(ln.id, ln.amountMinor);
      itemLineOrder.push(ln.id);
    }
  }

  for (const ln of lines) {
    if (isItemLike(ln)) continue;
    const slices = distributeProportionally(ln.amountMinor, itemSubtotal, memberOrder);
    perLineByMember.set(ln.id, slices);
    for (const [id, v] of slices) {
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
    const lineShares = distributeProportionally(ln.amountMinor, itemLineWeights, itemLineOrder);
    for (const [id, v] of lineShares) {
      spreadByLineId.set(id, (spreadByLineId.get(id) ?? 0) + v);
    }
  }

  return { owedByMemberId, perLineByMember, unassignedLineIds, spreadByLineId };
}
