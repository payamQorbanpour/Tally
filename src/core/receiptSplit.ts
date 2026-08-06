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

/** Distribute `total` across members in proportion to `weights`, using the
 *  largest-remainder method: each member first gets `floor` of their exact
 *  share, then the leftover minor units go one at a time to whoever's
 *  discarded fraction was biggest, earliest `memberOrder` position breaking
 *  ties. This is what makes a person who ate more carry more VAT down to the
 *  minor unit, instead of the leftover piling arbitrarily onto whoever is
 *  first in `memberOrder` regardless of how close their share was to the next
 *  unit. `weightSum` > 0 (guarded by the caller) guarantees every floor is a
 *  true floor of a non-negative-remainder division, so leftover is always
 *  >= 0 here even when `total` is negative (a discount). */
function distributeProportionally(
  total: number,
  weights: Map<string, number>,
  weightSum: number,
  memberOrder: string[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (weightSum === 0) return out;
  const ordered = memberOrder.filter((id) => weights.has(id));
  let consumed = 0;
  const remainders: { id: string; remainder: number }[] = [];
  for (const id of ordered) {
    const w = weights.get(id) ?? 0;
    const v = Math.floor((total * w) / weightSum);
    out.set(id, v);
    consumed += v;
    remainders.push({ id, remainder: total * w - v * weightSum });
  }
  let leftover = total - consumed;
  // Mathematically leftover is always >= 0 here (see above), but floating-
  // point division can, in principle, tip a floor the wrong way at the
  // extreme magnitudes this module allows. Handle both signs so the
  // reconciliation invariant holds unconditionally rather than assuming it.
  const step = leftover < 0 ? -1 : 1;
  // Stable sort keeps `ordered`'s memberOrder as the tie-break for equal
  // remainders. Largest remainder first when handing units out; smallest
  // first when clawing an over-allocation back.
  remainders.sort((a, b) => (step > 0 ? b.remainder - a.remainder : a.remainder - b.remainder));
  for (let i = 0; leftover !== 0 && remainders.length > 0; i += 1) {
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

  const hasItemLines = lines.some((l) => l.kind === "item");
  // Degenerate receipt — nothing but surcharges. There is no item subtotal to
  // be proportional to, so surcharges behave as ordinary shared items.
  const isItemLike = (l: SplitLine) => (hasItemLines ? l.kind === "item" : true);

  const itemSubtotal = new Map<string, number>();
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
  }

  const subtotalSum = [...itemSubtotal.values()].reduce((a, b) => a + b, 0);
  for (const ln of lines) {
    if (isItemLike(ln)) continue;
    const slices = distributeProportionally(
      ln.amountMinor,
      itemSubtotal,
      subtotalSum,
      memberOrder,
    );
    perLineByMember.set(ln.id, slices);
    for (const [id, v] of slices) {
      owedByMemberId.set(id, (owedByMemberId.get(id) ?? 0) + v);
    }
  }

  return { owedByMemberId, perLineByMember, unassignedLineIds };
}
