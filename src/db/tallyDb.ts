/**
 * Subset of expo-sqlite / sqlite calls used by `tallyRepo`, so we can back it with
 * `PowerSyncDatabase` via a thin shim.
 */
import type { QueryResult } from "@powersync/common";

export type TallyDb = {
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(
    sql: string,
    ...params: unknown[]
  ): Promise<QueryResult | { rowsAffected: number } | void>;
  withTransactionAsync<T>(fn: (tx: TallyDb) => Promise<T>): Promise<T>;
};
