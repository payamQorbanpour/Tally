import type { AbstractPowerSyncDatabase, QueryResult, Transaction } from "@powersync/common";
import type { TallyDb } from "./tallyDb";

/**
 * Maps expo-sqlite-style `getAllAsync` / `runAsync` calls onto a PowerSync DB or `Transaction`.
 */
export function createTallyShim(powerSync: AbstractPowerSyncDatabase): TallyDb {
  return {
    getAllAsync: (s, ...p) => powerSync.getAll(s, p as any[]),
    getFirstAsync: (s, ...p) => powerSync.getOptional(s, p as any[]),
    runAsync: (s, ...p) => powerSync.execute(s, p as any[]) as Promise<QueryResult | void>,
    withTransactionAsync: (fn) =>
      powerSync.writeTransaction(async (tx) => {
        return await fn(tallyTx(tx, powerSync));
      }),
  };
}

function tallyTx(tx: Transaction, ps: AbstractPowerSyncDatabase): TallyDb {
  return {
    getAllAsync: (s, ...p) => tx.getAll(s, p as any[]),
    getFirstAsync: (s, ...p) => tx.getOptional(s, p as any[]),
    runAsync: (s, ...p) => tx.execute(s, p as any[]) as Promise<QueryResult | void>,
    withTransactionAsync: (fn) =>
      ps.writeTransaction(async (it) => await fn(tallyTx(it, ps))),
  };
}
