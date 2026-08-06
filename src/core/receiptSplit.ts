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
  /** Lines that require sharers but have none. Spread lines only appear here
   *  in the degenerate case where there are no item lines at all. */
  unassignedLineIds: string[];
};

/** Sort a line's sharers by their position in the group's member order, so
 *  the odd minor unit lands on a stable person instead of drifting with the
 *  order the user happened to tap people in. */
function orderSharers(sharerIds: string[], memberOrder: string[]): string[] {
  const rank = new Map(memberOrder.map((id, i) => [id, i] as const));
  return [...sharerIds].sort(
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

export function computeReceiptOwed(
  lines: SplitLine[],
  memberOrder: string[],
): ReceiptSplitResult {
  const owedByMemberId = new Map<string, number>();
  const perLineByMember = new Map<string, Map<string, number>>();
  const unassignedLineIds: string[] = [];

  const itemSubtotal = new Map<string, number>();
  for (const ln of lines) {
    if (ln.kind !== "item") continue;
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

  return { owedByMemberId, perLineByMember, unassignedLineIds };
}
