/**
 * Subset of expo-sqlite used by `tallyRepo` (backed by `expo-sqlite` / `createExpoTallyDb`).
 */
import type { SQLiteRunResult } from "expo-sqlite";

export type TallyQueryResult = SQLiteRunResult;

export type TallyDb = {
  getAllAsync<T>(sql: string, ...params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, ...params: unknown[]): Promise<T | null>;
  runAsync(
    sql: string,
    ...params: unknown[]
  ): Promise<TallyQueryResult | { rowsAffected: number } | void>;
  withTransactionAsync<T>(fn: (tx: TallyDb) => Promise<T>): Promise<T>;
};
