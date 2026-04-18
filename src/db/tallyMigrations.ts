import type { SQLiteDatabase } from "expo-sqlite";
import { newId } from "./ids";

type PragmaInfo = { name: string };

async function hasColumn(
  db: SQLiteDatabase,
  table: string,
  column: string,
): Promise<boolean> {
  const rows = await db.getAllAsync<PragmaInfo>(`PRAGMA table_info(${table})`);
  return (rows || []).some((r) => r.name === column);
}

async function tableExists(db: SQLiteDatabase, table: string): Promise<boolean> {
  const r = await db.getFirstAsync<{ c: string }>(
    "SELECT 1 as c FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
    table,
  );
  return r != null;
}

/**
 * `app_settings` was stored as `key` / no `id` in some old builds. Current code uses `id`, `setting_key`, `value`.
 */
async function migrateAppSettingsIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, "app_settings"))) return;
  if (!(await hasColumn(db, "app_settings", "setting_key"))) {
    if (await hasColumn(db, "app_settings", "key")) {
      await db.execAsync("ALTER TABLE app_settings ADD COLUMN setting_key TEXT");
      await db.runAsync("UPDATE app_settings SET setting_key = key");
    } else if (await hasColumn(db, "app_settings", "name")) {
      await db.execAsync("ALTER TABLE app_settings ADD COLUMN setting_key TEXT");
      await db.runAsync("UPDATE app_settings SET setting_key = name");
    }
  }
  if (!(await hasColumn(db, "app_settings", "id"))) {
    await db.execAsync("ALTER TABLE app_settings ADD COLUMN id TEXT");
    const rowids = await db.getAllAsync<{ rowid: number }>(
      "SELECT rowid FROM app_settings WHERE id IS NULL OR TRIM(COALESCE(id, '')) = ''",
    );
    for (const { rowid } of rowids) {
      await db.runAsync("UPDATE app_settings SET id = ? WHERE rowid = ?", [newId(), rowid]);
    }
  }
}

/**
 * Very old Tally DBs had `group_members` with `PRIMARY KEY (group_id, user_id)` and no `id` column
 * (see `schema.sql`). Current code and sync expect a row `id` (UUID) per membership.
 */
async function migrateGroupMembersIdIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, "group_members"))) return;
  if (await hasColumn(db, "group_members", "id")) return;
  await db.execAsync("ALTER TABLE group_members ADD COLUMN id TEXT");
  const rows = await db.getAllAsync<{ group_id: string; user_id: string }>(
    `SELECT group_id, user_id FROM group_members
     WHERE id IS NULL OR TRIM(COALESCE(id, '')) = ''`,
  );
  for (const { group_id, user_id } of rows) {
    await db.runAsync(
      "UPDATE group_members SET id = ? WHERE group_id = ? AND user_id = ?",
      [newId(), group_id, user_id],
    );
  }
}

/**
 * Older `createGroup` inserted every member with the same `joined_at`, so lists could only fall back
 * to arbitrary `id` order. Spread `joined_at` by SQLite insertion order (`rowid`) so “first added first”
 * matches creation order. Idempotent: groups with distinct `joined_at` values are skipped.
 */
async function migrateGroupMembersJoinedAtSpreadIfNeeded(
  db: SQLiteDatabase,
): Promise<void> {
  if (!(await tableExists(db, "group_members"))) return;
  if (!(await hasColumn(db, "group_members", "id"))) return;

  const groups = await db.getAllAsync<{ gid: string }>(
    `SELECT group_id AS gid FROM group_members
     GROUP BY group_id
     HAVING COUNT(*) > 1 AND COUNT(DISTINCT joined_at) = 1`,
  );
  for (const { gid } of groups) {
    const rows = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM group_members WHERE group_id = ? ORDER BY rowid ASC`,
      gid,
    );
    const baseRow = await db.getFirstAsync<{ joined_at: string }>(
      `SELECT joined_at FROM group_members WHERE group_id = ? LIMIT 1`,
      gid,
    );
    if (!baseRow) continue;
    const baseMs = Date.parse(baseRow.joined_at);
    if (!Number.isFinite(baseMs)) continue;
    let i = 0;
    for (const { id } of rows) {
      const t = new Date(baseMs + i++).toISOString();
      await db.runAsync(`UPDATE group_members SET joined_at = ? WHERE id = ?`, t, id);
    }
  }
}

/**
 * Older `deleteGroup` only removed `groups` rows (no FK cascade), leaving `group_members` /
 * expense rows that block deleting contacts. Idempotent.
 */
async function migrateCleanupOrphanGroupRelatedRowsIfNeeded(
  db: SQLiteDatabase,
): Promise<void> {
  if (!(await tableExists(db, "groups"))) return;
  if (!(await tableExists(db, "expenses"))) return;

  await db.runAsync(
    `DELETE FROM splits WHERE expense_id IN (
       SELECT id FROM expenses WHERE group_id NOT IN (SELECT id FROM groups)
     )`,
  );
  await db.runAsync(
    `DELETE FROM expenses WHERE group_id NOT IN (SELECT id FROM groups)`,
  );
  if (await tableExists(db, "splits")) {
    await db.runAsync(
      `DELETE FROM splits WHERE expense_id NOT IN (SELECT id FROM expenses)`,
    );
  }
  if (await tableExists(db, "settlements")) {
    await db.runAsync(
      `DELETE FROM settlements WHERE group_id NOT IN (SELECT id FROM groups)`,
    );
  }
  if (await tableExists(db, "group_members")) {
    await db.runAsync(
      `DELETE FROM group_members WHERE group_id NOT IN (SELECT id FROM groups)`,
    );
  }
}

/**
 * Older Tally DBs (e.g. on web) were created without `last_modified` and optional expense columns.
 * `CREATE TABLE IF NOT EXISTS` does not upgrade existing tables — add missing columns and backfill.
 */
export async function migrateTallySqliteIfNeeded(db: SQLiteDatabase): Promise<void> {
  const now = new Date().toISOString();

  await migrateAppSettingsIfNeeded(db);
  await migrateGroupMembersIdIfNeeded(db);
  await migrateGroupMembersJoinedAtSpreadIfNeeded(db);

  const withLm = [
    "groups",
    "users",
    "group_members",
    "expenses",
    "splits",
    "settlements",
  ] as const;

  for (const t of withLm) {
    if (!(await tableExists(db, t))) continue;
    if (await hasColumn(db, t, "last_modified")) continue;
    await db.execAsync(`ALTER TABLE ${t} ADD COLUMN last_modified TEXT;`);
  }

  if (await tableExists(db, "groups")) {
    await db.runAsync(
      `UPDATE groups SET last_modified = created_at WHERE last_modified IS NULL OR TRIM(COALESCE(last_modified, '')) = ''`,
    );
  }
  if (await tableExists(db, "users")) {
    await db.runAsync(
      `UPDATE users SET last_modified = ? WHERE last_modified IS NULL OR TRIM(COALESCE(last_modified, '')) = ''`,
      [now],
    );
  }
  if (await tableExists(db, "group_members")) {
    await db.runAsync(
      `UPDATE group_members SET last_modified = joined_at WHERE last_modified IS NULL OR TRIM(COALESCE(last_modified, '')) = ''`,
    );
  }
  if (await tableExists(db, "expenses")) {
    await db.runAsync(
      `UPDATE expenses SET last_modified = created_at WHERE last_modified IS NULL OR TRIM(COALESCE(last_modified, '')) = ''`,
    );
  }
  if (await tableExists(db, "splits")) {
    await db.runAsync(
      `UPDATE splits SET last_modified = ? WHERE last_modified IS NULL OR TRIM(COALESCE(last_modified, '')) = ''`,
      [now],
    );
  }
  if (await tableExists(db, "settlements")) {
    await db.runAsync(
      `UPDATE settlements SET last_modified = settled_at WHERE last_modified IS NULL OR TRIM(COALESCE(last_modified, '')) = ''`,
    );
  }

  if (await tableExists(db, "expenses")) {
    if (!(await hasColumn(db, "expenses", "category"))) {
      await db.execAsync("ALTER TABLE expenses ADD COLUMN category TEXT;");
    }
    if (!(await hasColumn(db, "expenses", "notes"))) {
      await db.execAsync("ALTER TABLE expenses ADD COLUMN notes TEXT;");
    }
  }

  await migrateCleanupOrphanGroupRelatedRowsIfNeeded(db);
}
