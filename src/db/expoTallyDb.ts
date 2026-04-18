import { Platform } from "react-native";
import type { SQLiteDatabase, SQLiteRunResult } from "expo-sqlite";
import type { TallyDb } from "./tallyDb";

function isWriteSql(sql: string) {
  return /^\s*(insert|update|delete|replace)/i.test(sql);
}

type Conn = Pick<SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync">;

/**
 * `withTransaction` callback receives the same connection as the outer transaction.
 * No nested `BEGIN` — the repo only sequences statements on `tx` today.
 */
function makeInnerDuringTxn(conn: Conn): TallyDb {
  return {
    getAllAsync: (s, ...p) => conn.getAllAsync(s, ...p as never[]),
    getFirstAsync: (s, ...p) => conn.getFirstAsync(s, ...p as never[]),
    runAsync: async (s, ...p) => conn.runAsync(s, ...p as never[]),
    withTransactionAsync: (fn) => fn(makeInnerDuringTxn(conn)),
  };
}

async function runOuterTransaction<T>(
  base: SQLiteDatabase,
  body: (db: TallyDb) => Promise<T>,
  onCommitted: () => void,
): Promise<T> {
  if (Platform.OS === "web") {
    try {
      await base.execAsync("BEGIN");
      const out = await body(makeInnerDuringTxn(base));
      await base.execAsync("COMMIT");
      onCommitted();
      return out;
    } catch (e) {
      try {
        await base.execAsync("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw e;
    }
  }
  let out!: T;
  await base.withExclusiveTransactionAsync(async (txn) => {
    out = await body(makeInnerDuringTxn(txn));
  });
  onCommitted();
  return out;
}

/**
 * Tally’s SQL over expo-sqlite. `onAfterWrite` is invoked once per successful `runAsync` write, or
 * after each committed `withTransactionAsync`.
 */
export function createExpoTallyDb(
  base: SQLiteDatabase,
  onAfterWrite: () => void,
): TallyDb {
  return {
    getAllAsync: (s, ...p) => base.getAllAsync(s, ...p as never[]),
    getFirstAsync: (s, ...p) => base.getFirstAsync(s, ...p as never[]),
    runAsync: async (s, ...p) => {
      const r = (await base.runAsync(s, ...p as never[])) as
        | SQLiteRunResult
        | { rowsAffected: number }
        | void;
      if (isWriteSql(s)) onAfterWrite();
      return r;
    },
    withTransactionAsync: (fn) =>
      runOuterTransaction(base, (inner) => fn(inner), onAfterWrite),
  };
}
