import type {
  EntityId,
  ExpenseLedgerLine,
  MinorAmount,
  SettlementLine,
} from "./types";

/** Net balance: positive = owed to this user, negative = this user owes others. */
export type BalanceMap = Map<EntityId, MinorAmount>;

function add(map: BalanceMap, id: EntityId, delta: MinorAmount): void {
  map.set(id, (map.get(id) ?? 0) + delta);
}

/**
 * Applies expenses and settlements for one currency within one group.
 * Splits must already be resolved to minor units (equal / exact / % at the edge).
 */
export function computeBalances(
  expenses: ExpenseLedgerLine[],
  settlements: SettlementLine[],
): BalanceMap {
  const balances: BalanceMap = new Map();

  for (const e of expenses) {
    let owedSum = 0;
    for (const s of e.splits) {
      owedSum += s.owedMinor;
      add(balances, s.userId, -s.owedMinor);
    }
    if (owedSum !== e.amountMinor) {
      // Allow for small rounding differences (within 1 minor unit per person)
      // but log a warning for larger discrepancies
      const diff = Math.abs(e.amountMinor - owedSum);
      if (diff > Math.max(1, e.splits.length)) {
        console.warn(
          `Split mismatch for expense: split total ${owedSum} does not match expense amount ${e.amountMinor}`,
        );
      }
      // Use the actual split total to avoid cascading errors
      add(balances, e.payerId, owedSum);
      continue;
    }
    add(balances, e.payerId, e.amountMinor);
  }

  for (const p of settlements) {
    if (p.amountMinor <= 0) {
      console.warn("Settlement amount must be positive:", p.amountMinor);
      continue;
    }
    if (p.fromUserId === p.toUserId) {
      console.warn("Settlement from and to must differ");
      continue;
    }
    add(balances, p.fromUserId, p.amountMinor);
    add(balances, p.toUserId, -p.amountMinor);
  }

  for (const [id, v] of balances) {
    if (v === 0) balances.delete(id);
  }

  return balances;
}

export function sumBalances(balances: BalanceMap): MinorAmount {
  let s = 0;
  for (const v of balances.values()) s += v;
  return s;
}
