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
  await migrateFeedbackReportsTableIfNeeded(db);
  await migratePassEntitlementsTableIfNeeded(db);

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

  if (await tableExists(db, "users")) {
    if (!(await hasColumn(db, "users", "deleted_at"))) {
      await db.execAsync("ALTER TABLE users ADD COLUMN deleted_at TEXT;");
    }
    if (!(await hasColumn(db, "users", "hidden_from_friends"))) {
      await db.execAsync(
        "ALTER TABLE users ADD COLUMN hidden_from_friends INTEGER NOT NULL DEFAULT 0;",
      );
    }
  }

  await migrateCleanupOrphanGroupRelatedRowsIfNeeded(db);
  await migrateSyncPendingRemoteDeleteIfNeeded(db);
  await migrateSyncCloudInsertPendingIfNeeded(db);
  await migrateGroupTypeLabelPendingIfNeeded(db);
  await migrateIrtIrrMinorScaleToHundredthsIfNeeded(db);
  await migrateGroupMembersRoleIfNeeded(db);
  await migrateGroupInvitesTableIfNeeded(db);
  await migrateFixSplitExpenseMismatchesIfNeeded(db);
}

async function migrateGroupMembersRoleIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (!(await tableExists(db, "group_members"))) return;
  if (await hasColumn(db, "group_members", "role")) return;
  await db.execAsync(
    `ALTER TABLE group_members ADD COLUMN role TEXT NOT NULL DEFAULT 'collaborator'`,
  );
}

async function migrateGroupInvitesTableIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (await tableExists(db, "group_invites")) return;
  await db.execAsync(`
    CREATE TABLE group_invites (
      id TEXT NOT NULL PRIMARY KEY,
      group_id TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE,
      invited_by_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_modified TEXT NOT NULL,
      accepted_at TEXT
    );
    CREATE INDEX group_invites_by_group ON group_invites (group_id);
    CREATE INDEX group_invites_by_token ON group_invites (token);
  `);
}

async function migrateSyncPendingRemoteDeleteIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (await tableExists(db, "sync_pending_remote_delete")) return;
  await db.execAsync(`
    CREATE TABLE sync_pending_remote_delete (
      id TEXT NOT NULL PRIMARY KEY,
      kind TEXT NOT NULL
    );
  `);
}

async function migrateSyncCloudInsertPendingIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (await tableExists(db, "sync_cloud_insert_pending")) return;
  await db.execAsync(`
    CREATE TABLE sync_cloud_insert_pending (
      id TEXT NOT NULL PRIMARY KEY
    );
  `);
}

async function migrateGroupTypeLabelPendingIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (await tableExists(db, "group_type_label_pending")) return;
  await db.execAsync(`
    CREATE TABLE group_type_label_pending (
      group_id TEXT NOT NULL PRIMARY KEY,
      created_at TEXT NOT NULL
    );
  `);
}

async function migrateFeedbackReportsTableIfNeeded(db: SQLiteDatabase): Promise<void> {
  if (await tableExists(db, "feedback_reports")) return;
  await db.execAsync(`
    CREATE TABLE feedback_reports (
      id TEXT NOT NULL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT,
      message TEXT,
      details_json TEXT,
      created_at TEXT NOT NULL,
      last_modified TEXT NOT NULL
    );
    CREATE INDEX feedback_reports_by_kind ON feedback_reports (kind, created_at);
  `);
}

/**
 * Pass entitlements (Tally Passes — see `src/premium/passes.ts`). One row per
 * purchase event: initial buy, extension, or "marked ended" (manual settle).
 * The user's *current* pass is the most-recent row whose `ended_at` is null.
 *
 * Mirrors the remote `pass_entitlements` Supabase table — columns line up so a
 * future sync layer can pull-merge directly. Cross-device sync isn't wired
 * yet; for v1 the local rows are the source of truth on this device, and
 * `profiles.is_premium` (written by `PremiumContext`) is the cross-device
 * signal.
 */
async function migratePassEntitlementsTableIfNeeded(
  db: SQLiteDatabase,
): Promise<void> {
  if (await tableExists(db, "pass_entitlements")) return;
  await db.execAsync(`
    CREATE TABLE pass_entitlements (
      id TEXT NOT NULL PRIMARY KEY,
      user_id TEXT NOT NULL,
      pass_type TEXT NOT NULL,
      kind TEXT NOT NULL,
      product_id TEXT NOT NULL,
      store_transaction_id TEXT,
      activated_at TEXT NOT NULL,
      expires_at TEXT,
      ended_at TEXT,
      bound_group_id TEXT,
      price_amount REAL,
      price_currency TEXT,
      created_at TEXT NOT NULL,
      last_modified TEXT NOT NULL
    );
    CREATE INDEX pass_entitlements_by_user_active
      ON pass_entitlements (user_id, expires_at);
    CREATE INDEX pass_entitlements_by_user_created
      ON pass_entitlements (user_id, created_at);
  `);
}

/**
 * IRR / IRT used to use exponent 0 (whole units in `amount_minor`). Code now uses
 * exponent 2 (hundredths) so decimals work like USD. Multiply existing rows once so
 * economic values are unchanged (e.g. 65_001 tomans → minor 6_500_100).
 */
async function migrateIrtIrrMinorScaleToHundredthsIfNeeded(
  db: SQLiteDatabase,
): Promise<void> {
  if (!(await tableExists(db, "app_settings"))) return;
  const done = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE setting_key = 'irt_irr_minor_x100_v1' LIMIT 1`,
  );
  if (done?.value === "1") return;
  if (!(await tableExists(db, "groups"))) return;

  await db.execAsync("BEGIN IMMEDIATE");
  try {
    await db.runAsync(
      `UPDATE expenses SET amount_minor = amount_minor * 100
       WHERE group_id IN (SELECT id FROM groups WHERE UPPER(TRIM(currency)) IN ('IRT','IRR'))`,
    );
    await db.runAsync(
      `UPDATE splits SET owed_minor = owed_minor * 100
       WHERE expense_id IN (
         SELECT e.id FROM expenses e
         INNER JOIN groups g ON e.group_id = g.id
         WHERE UPPER(TRIM(g.currency)) IN ('IRT','IRR')
       )`,
    );
    if (await tableExists(db, "settlements")) {
      await db.runAsync(
        `UPDATE settlements SET amount_minor = amount_minor * 100
         WHERE group_id IN (SELECT id FROM groups WHERE UPPER(TRIM(currency)) IN ('IRT','IRR'))`,
      );
    }
    await db.runAsync(
      `INSERT INTO app_settings (id, setting_key, value) VALUES (?, 'irt_irr_minor_x100_v1', '1')`,
      [newId()],
    );
    await db.execAsync("COMMIT");
  } catch (e) {
    await db.execAsync("ROLLBACK");
    throw e;
  }
}

/**
 * Fix expenses where the sum of splits does not match the expense amount.
 * This can happen due to database corruption, sync issues, or failed transactions.
 * Strategy:
 * 1. Find all expenses where splits don't sum to expense amount
 * 2. For each mismatch, delete the splits and rebuild them equally
 * 3. Log the corrections for debugging
 */
async function migrateFixSplitExpenseMismatchesIfNeeded(
  db: SQLiteDatabase,
): Promise<void> {
  if (!(await tableExists(db, "expenses"))) return;
  if (!(await tableExists(db, "splits"))) return;

  // Check if migration has already run
  if (!(await tableExists(db, "app_settings"))) return;
  const done = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE setting_key = 'fix_split_expense_mismatches_v1' LIMIT 1`,
  );
  if (done?.value === "1") return;

  // Find all mismatches
  const mismatches = await db.getAllAsync<{
    expense_id: string;
    amount_minor: number;
    splits_sum: number;
    split_count: number;
  }>(
    `
    SELECT 
      e.id as expense_id,
      e.amount_minor,
      COALESCE(SUM(s.owed_minor), 0) as splits_sum,
      COUNT(s.id) as split_count
    FROM expenses e
    LEFT JOIN splits s ON e.id = s.expense_id
    GROUP BY e.id
    HAVING amount_minor != COALESCE(SUM(s.owed_minor), 0)
    `,
  );

  if (mismatches.length === 0) {
    // Mark migration as done even if no fixes were needed
    await db.runAsync(
      `INSERT INTO app_settings (id, setting_key, value) VALUES (?, 'fix_split_expense_mismatches_v1', '1')`,
      [newId()],
    );
    return;
  }

  console.warn(
    `[Migration] Found ${mismatches.length} expense(s) with split/amount mismatches. Attempting to fix...`,
  );

  await db.execAsync("BEGIN IMMEDIATE");
  try {
    for (const mismatch of mismatches) {
      console.warn(
        `[Migration] Expense ${mismatch.expense_id}: amount=${mismatch.amount_minor}, splits_sum=${mismatch.splits_sum}`,
      );

      // Get all current splits to know who should be in the corrected split
      const currentSplits = await db.getAllAsync<{ user_id: string }>(
        `SELECT DISTINCT user_id FROM splits WHERE expense_id = ?`,
        [mismatch.expense_id],
      );

      if (currentSplits.length > 0) {
        // Delete mismatched splits
        await db.runAsync(`DELETE FROM splits WHERE expense_id = ?`, [
          mismatch.expense_id,
        ]);

        // Rebuild splits equally among the users who had splits
        const base = Math.floor(mismatch.amount_minor / currentSplits.length);
        const rem = mismatch.amount_minor - base * currentSplits.length;

        const now = new Date().toISOString();
        for (let i = 0; i < currentSplits.length; i++) {
          const owed = base + (i < rem ? 1 : 0);
          const splitId = newId();
          await db.runAsync(
            `INSERT INTO splits (id, expense_id, user_id, owed_minor, last_modified) VALUES (?, ?, ?, ?, ?)`,
            [
              splitId,
              mismatch.expense_id,
              currentSplits[i]!.user_id,
              owed,
              now,
            ],
          );
        }
      }
    }

    // Mark migration as done
    await db.runAsync(
      `INSERT INTO app_settings (id, setting_key, value) VALUES (?, 'fix_split_expense_mismatches_v1', '1')`,
      [newId()],
    );

    await db.execAsync("COMMIT");
    console.warn(
      `[Migration] Fixed split/expense mismatches for ${mismatches.length} expense(s)`,
    );
  } catch (e) {
    await db.execAsync("ROLLBACK");
    console.error("[Migration] Failed to fix split/expense mismatches:", e);
    throw e;
  }
}
