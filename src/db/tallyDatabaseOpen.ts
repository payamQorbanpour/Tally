import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { TALLY_DB_NAME, TALLY_INIT_SQL } from "./tallySchema";
import { migrateTallySqliteIfNeeded } from "./tallyMigrations";
import { createExpoTallyDb } from "./expoTallyDb";
import { ensureLocalUserSeed } from "./openTallyDatabaseShared";
import type { TallyDb } from "./tallyDb";

export type OpenTallyResult = {
  /** Used for `Supabase` full-table pull / push. */
  sqlite: SQLiteDatabase;
  tally: TallyDb;
};

/**
 * Fired on each autocommit write, or when a `withTransactionAsync` body commits.
 */
export async function openTallyDatabase(
  onLocalMutation: () => void,
): Promise<OpenTallyResult> {
  const sqlite = await openDatabaseAsync(TALLY_DB_NAME, { enableChangeListener: true });
  await sqlite.execAsync(TALLY_INIT_SQL);
  await migrateTallySqliteIfNeeded(sqlite);
  const tally = createExpoTallyDb(sqlite, onLocalMutation);
  await ensureLocalUserSeed(tally);
  return { sqlite, tally };
}
