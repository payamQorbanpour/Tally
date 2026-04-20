import type { BalanceMap } from "./balances";
import type {
  EntityId,
  ExpenseLedgerLine,
  MinorAmount,
  SettlementLine,
  SimplifiedPayment,
} from "./types";

/**
 * Greedy minimization of transfers (same class as Splitwise "simplify debts").
 * Requires integer minor units; ignores entries with zero balance.
 */
export function simplifyDebts(balances: BalanceMap): SimplifiedPayment[] {
  const entries: { id: EntityId; b: MinorAmount }[] = [];
  for (const [id, b] of balances) {
    if (b !== 0) entries.push({ id, b });
  }

  const creditors = entries
    .filter((e) => e.b > 0)
    .sort((a, b) => b.b - a.b);
  const debtors = entries
    .filter((e) => e.b < 0)
    .sort((a, b) => a.b - b.b);

  const out: SimplifiedPayment[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const owe = -debtors[i]!.b;
    const get = creditors[j]!.b;
    const pay = Math.min(owe, get);
    if (pay <= 0) break;

    out.push({
      fromUserId: debtors[i]!.id,
      toUserId: creditors[j]!.id,
      amountMinor: pay,
    });

    debtors[i]!.b += pay;
    creditors[j]!.b -= pay;

    if (debtors[i]!.b === 0) i++;
    if (creditors[j]!.b === 0) j++;
  }

  return out;
}

/**
 * Generate non-simplified (pairwise) settlements from balances.
 * Each debtor pays the creditor directly without optimization.
 */
export function getNonSimplifiedPayments(balances: BalanceMap): SimplifiedPayment[] {
  const creditors: { id: EntityId; balance: MinorAmount }[] = [];
  const debtors: { id: EntityId; balance: MinorAmount }[] = [];

  for (const [id, balance] of balances) {
    if (balance > 0) {
      creditors.push({ id, balance });
    } else if (balance < 0) {
      debtors.push({ id, balance: -balance });
    }
  }

  const out: SimplifiedPayment[] = [];

  for (const debtor of debtors) {
    let remaining = debtor.balance;
    for (const creditor of creditors) {
      if (remaining <= 0) break;
      const pay = Math.min(remaining, creditor.balance);
      if (pay > 0) {
        out.push({
          fromUserId: debtor.id,
          toUserId: creditor.id,
          amountMinor: pay,
        });
        remaining -= pay;
        creditor.balance -= pay;
      }
    }
  }

  return out;
}

/** Pairwise transfers implied by expenses + settlements (no debt simplification). */
export function getDirectPaymentsFromLedger(
  expenses: ExpenseLedgerLine[],
  settlements: SettlementLine[],
): SimplifiedPayment[] {
  const pairTotals = new Map<string, MinorAmount>();

  const add = (fromUserId: EntityId, toUserId: EntityId, amountMinor: MinorAmount) => {
    if (amountMinor <= 0) return;
    if (fromUserId === toUserId) return;
    const key = `${fromUserId}\u0000${toUserId}`;
    pairTotals.set(key, (pairTotals.get(key) ?? 0) + amountMinor);
  };

  for (const e of expenses) {
    for (const s of e.splits) {
      // Each split means: this user owes the payer this amount (directly).
      add(s.userId, e.payerId, s.owedMinor);
    }
  }

  for (const p of settlements) {
    add(p.fromUserId, p.toUserId, p.amountMinor);
  }

  const out: SimplifiedPayment[] = [];
  for (const [key, amountMinor] of pairTotals) {
    if (amountMinor === 0) continue;
    const [fromUserId, toUserId] = key.split("\u0000");
    out.push({ fromUserId, toUserId, amountMinor });
  }
  return out;
}
