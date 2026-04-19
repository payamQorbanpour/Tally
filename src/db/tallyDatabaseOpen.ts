import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";
import { SETTINGS_KEYS } from "../data/tallyRepo";
import { TALLY_DB_NAME, TALLY_INIT_SQL } from "./tallySchema";
import { migrateTallySqliteIfNeeded } from "./tallyMigrations";
import { createExpoTallyDb } from "./expoTallyDb";
import { DEFAULT_LOCAL_USER_ID, setResolvedLocalUserId } from "./ids";
import { ensureLocalUserSeed } from "./openTallyDatabaseShared";
import type { TallyDb } from "./tallyDb";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const persisted = await sqlite.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE setting_key = ?`,
    SETTINGS_KEYS.activeLocalUserId,
  );
  const raw = persisted?.value?.trim();
  if (raw && UUID_RE.test(raw)) setResolvedLocalUserId(raw);
  else setResolvedLocalUserId(DEFAULT_LOCAL_USER_ID);
  const tally = createExpoTallyDb(sqlite, onLocalMutation);
  await ensureLocalUserSeed(tally);
  return { sqlite, tally };
}
