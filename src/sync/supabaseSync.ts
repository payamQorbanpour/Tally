import type { SupabaseClient } from "@supabase/supabase-js";
import type { SQLiteDatabase } from "expo-sqlite";
import { getLocalUserId } from "../db/ids";

export { createTallySupabaseClient } from "../auth/supabaseClient";

const TABLE_DELETE_ORDER = [
  "feedback_reports",
  "splits",
  "expenses",
  "settlements",
  "group_invites",
  "group_members",
  "groups",
  "users",
] as const;

const TABLE_UPSERT_ORDER = [
  "feedback_reports",
  "users",
  "groups",
  "group_invites",
  "group_members",
  "expenses",
  "splits",
  "settlements",
] as const;

/** Public table names in Postgres (for Realtime and sync). */
export const TALLY_SUPABASE_TABLES: readonly string[] = [...TABLE_UPSERT_ORDER];

type SyncedTable = (typeof TABLE_UPSERT_ORDER)[number];
type TConn = Pick<SQLiteDatabase, "getAllAsync" | "getFirstAsync" | "runAsync" | "execAsync">;

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}

function setFromIds(rows: { id: string }[] | null | undefined, extra: string[] = []) {
  const s = new Set((rows || []).map((r) => r.id));
  for (const e of extra) s.add(e);
  return s;
}

async function deleteLocalNotInRemote(
  t: TConn,
  name: (typeof TABLE_DELETE_ORDER)[number],
  ids: Set<string>,
  preserveNotYetUploaded: Set<string>,
) {
  const all = await t.getAllAsync<{ id: string }>(`SELECT id FROM ${name}`);
  for (const row of all) {
    if (name === "users" && row.id === getLocalUserId()) continue;
    if (ids.has(row.id)) continue;
    if (preserveNotYetUploaded.has(row.id)) continue;
    await t.runAsync(`DELETE FROM ${name} WHERE id = ?`, row.id);
  }
}

function upsertRow(t: TConn, table: SyncedTable, row: Record<string, unknown>) {
  if (table === "users" && String(row.id) === getLocalUserId()) {
    return Promise.resolve();
  }
  if (table === "feedback_reports")
    return t.runAsync(
      `INSERT OR REPLACE INTO feedback_reports (id, kind, title, message, details_json, created_at, last_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.kind),
      row.title != null && String(row.title) !== "" ? String(row.title) : null,
      row.message != null && String(row.message) !== "" ? String(row.message) : null,
      row.details_json != null && String(row.details_json) !== ""
        ? String(row.details_json)
        : null,
      String(row.created_at),
      String(row.last_modified),
    );
  if (table === "groups")
    return t.runAsync(
      `INSERT OR REPLACE INTO groups (id, name, currency, icon, group_type, simplify_debts, created_at, last_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.name),
      String(row.currency),
      row.icon != null && String(row.icon) !== "" ? String(row.icon) : null,
      row.group_type != null && String(row.group_type) !== "" ? String(row.group_type) : null,
      Number.isFinite(Number(row.simplify_debts)) ? Math.round(Number(row.simplify_debts)) : 1,
      String(row.created_at),
      String(row.last_modified),
    );
  if (table === "users")
    return t.runAsync(
      `INSERT OR REPLACE INTO users (id, name, email, avatar_uri, last_modified) VALUES (?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.name),
      row.email != null && String(row.email) !== "" ? String(row.email) : null,
      row.avatar_uri != null && String(row.avatar_uri) !== ""
        ? String(row.avatar_uri)
        : null,
      String(row.last_modified),
    );
  if (table === "group_members")
    return t.runAsync(
      `INSERT OR REPLACE INTO group_members (id, group_id, user_id, joined_at, last_modified, role) VALUES (?, ?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.group_id),
      String(row.user_id),
      String(row.joined_at),
      String(row.last_modified),
      row.role != null && String(row.role) !== "" ? String(row.role) : "collaborator",
    );
  if (table === "group_invites")
    return t.runAsync(
      `INSERT OR REPLACE INTO group_invites (id, group_id, email, role, token, invited_by_user_id, created_at, last_modified, accepted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.group_id),
      String(row.email),
      String(row.role),
      String(row.token),
      String(row.invited_by_user_id),
      String(row.created_at),
      String(row.last_modified),
      row.accepted_at != null && String(row.accepted_at) !== ""
        ? String(row.accepted_at)
        : null,
    );
  if (table === "expenses")
    return t.runAsync(
      `INSERT OR REPLACE INTO expenses (id, group_id, payer_id, amount_minor, description, expense_date, created_at, category, notes, last_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.group_id),
      String(row.payer_id),
      Math.round(Number(row.amount_minor)),
      String(row.description),
      String(row.expense_date),
      String(row.created_at),
      row.category != null && String(row.category) !== "" ? String(row.category) : null,
      row.notes != null && String(row.notes) !== "" ? String(row.notes) : null,
      String(row.last_modified),
    );
  if (table === "splits")
    return t.runAsync(
      `INSERT OR REPLACE INTO splits (id, expense_id, user_id, owed_minor, last_modified) VALUES (?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.expense_id),
      String(row.user_id),
      Math.round(Number(row.owed_minor)),
      String(row.last_modified),
    );
  return t.runAsync(
    `INSERT OR REPLACE INTO settlements (id, group_id, from_user_id, to_user_id, amount_minor, settled_at, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    String(row.id),
    String(row.group_id),
    String(row.from_user_id),
    String(row.to_user_id),
    Math.round(Number(row.amount_minor)),
    String(row.settled_at),
    String(row.last_modified),
  );
}

/**
 * Applies queued local deletes to Supabase before reading, so a pull cannot re-insert rows
 * the user removed on this device.
 */
async function flushPendingRemoteDeletes(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  const pending = await db.getAllAsync<{ id: string; kind: string }>(
    `SELECT id, kind FROM sync_pending_remote_delete`,
  );
  for (const row of pending) {
    try {
      if (row.kind === "expense") {
        const sp = await sb.from("splits").delete().eq("expense_id", row.id);
        if (sp.error) throw new Error(sp.error.message);
        const ex = await sb.from("expenses").delete().eq("id", row.id);
        if (ex.error) throw new Error(ex.error.message);
      } else if (row.kind === "group") {
        const gid = row.id;
        const exRes = await sb.from("expenses").select("id").eq("group_id", gid);
        if (exRes.error) throw new Error(exRes.error.message);
        const exIds = ((exRes.data as { id: string }[] | null) ?? []).map((r) => r.id);
        if (exIds.length > 0) {
          const sp = await sb.from("splits").delete().in("expense_id", exIds);
          if (sp.error) throw new Error(sp.error.message);
        }
        const eDel = await sb.from("expenses").delete().eq("group_id", gid);
        if (eDel.error) throw new Error(eDel.error.message);
        const stDel = await sb.from("settlements").delete().eq("group_id", gid);
        if (stDel.error) throw new Error(stDel.error.message);
        const invDel = await sb.from("group_invites").delete().eq("group_id", gid);
        if (invDel.error) throw new Error(invDel.error.message);
        const gmDel = await sb.from("group_members").delete().eq("group_id", gid);
        if (gmDel.error) throw new Error(gmDel.error.message);
        const gDel = await sb.from("groups").delete().eq("id", gid);
        if (gDel.error) throw new Error(gDel.error.message);
      }
      await db.runAsync(
        `DELETE FROM sync_pending_remote_delete WHERE id = ? AND kind = ?`,
        row.id,
        row.kind,
      );
    } catch {
      /* Keep the row; retry on the next pull when the network allows. */
    }
  }
}

/**
 * Fetches all synced tables from Supabase, then rewrites the local `SQLite` file to match.
 */
export async function pullAllFromSupabase(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  await flushPendingRemoteDeletes(sb, db);
  const byTable: Record<SyncedTable, Record<string, unknown>[]> = {
    feedback_reports: [],
    users: [],
    groups: [],
    group_invites: [],
    group_members: [],
    expenses: [],
    splits: [],
    settlements: [],
  };
  const reads = await Promise.all(
    TABLE_UPSERT_ORDER.map(async (t) => {
      const { data, error } = await sb.from(t).select("*");
      if (error) throw new Error(`Supabase read ${t}: ${error.message}`);
      return [t, (data as Record<string, unknown>[]) ?? []] as const;
    }),
  );
  for (const [t, rows] of reads) {
    byTable[t] = rows;
  }
  const usersKeep = setFromIds(byTable.users as { id: string }[] | null, [
    getLocalUserId(),
  ]);
  const groupsKeep = setFromIds(byTable.groups as { id: string }[] | null, []);
  const idKeep: Record<SyncedTable, Set<string>> = {
    feedback_reports: setFromIds(byTable.feedback_reports as { id: string }[] | null, []),
    users: usersKeep,
    groups: groupsKeep,
    group_invites: setFromIds(
      byTable.group_invites as { id: string }[] | null,
    ),
    group_members: setFromIds(
      byTable.group_members as { id: string }[] | null,
    ),
    expenses: setFromIds(byTable.expenses as { id: string }[] | null, []),
    splits: setFromIds(byTable.splits as { id: string }[] | null, []),
    settlements: setFromIds(byTable.settlements as { id: string }[] | null, []),
  };

  let preserveNotYetUploaded = new Set<string>();
  try {
    const pr = await db.getAllAsync<{ id: string }>(
      `SELECT id FROM sync_cloud_insert_pending`,
    );
    preserveNotYetUploaded = new Set(pr.map((r) => r.id));
  } catch {
    /* table missing on ancient DBs */
  }

  await db.execAsync("BEGIN");
  try {
    for (const d of TABLE_DELETE_ORDER) {
      await deleteLocalNotInRemote(db, d, idKeep[d]!, preserveNotYetUploaded);
    }
    for (const t of TABLE_UPSERT_ORDER) {
      for (const row of byTable[t])
        await upsertRow(db, t, row);
    }
    await db.execAsync("COMMIT");
  } catch (e) {
    try {
      await db.execAsync("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

const SELECT_SQL: Record<SyncedTable, string> = {
  feedback_reports: `SELECT id, kind, title, message, details_json, created_at, last_modified FROM feedback_reports`,
  groups: `SELECT id, name, currency, icon, group_type, simplify_debts, created_at, last_modified FROM groups`,
  users: `SELECT id, name, email, avatar_uri, last_modified FROM users`,
  group_invites: `SELECT id, group_id, email, role, token, invited_by_user_id, created_at, last_modified, accepted_at FROM group_invites`,
  group_members: `SELECT id, group_id, user_id, joined_at, last_modified, role FROM group_members`,
  expenses: `SELECT id, group_id, payer_id, amount_minor, description, expense_date, created_at, category, notes, last_modified FROM expenses`,
  splits: `SELECT id, expense_id, user_id, owed_minor, last_modified FROM splits`,
  settlements: `SELECT id, group_id, from_user_id, to_user_id, amount_minor, settled_at, last_modified FROM settlements`,
};

const REMOTE_DELETE_TABLES = [
  "feedback_reports",
  "splits",
  "expenses",
  "settlements",
  "group_invites",
  "group_members",
  "groups",
  "users",
] as const;

async function upsertRemote(
  sb: SupabaseClient,
  t: SyncedTable,
  rows: Record<string, unknown>[],
) {
  for (const c of chunk(rows, 200)) {
    if (c.length === 0) continue;
    const { error } = await sb
      .from(t)
      .upsert(
        c.map((r) => {
          if (t === "groups" && "simplify_debts" in r)
            return { ...r, simplify_debts: Math.round(Number(r.simplify_debts)) };
          if (t === "expenses" && "amount_minor" in r)
            return { ...r, amount_minor: Math.round(Number(r.amount_minor)) };
          if (t === "splits" && "owed_minor" in r)
            return { ...r, owed_minor: Math.round(Number(r.owed_minor)) };
          if (t === "settlements" && "amount_minor" in r)
            return { ...r, amount_minor: Math.round(Number(r.amount_minor)) };
          if (t === "users") {
            const raw = r.avatar_uri;
            const s = raw != null && String(raw).trim() !== "" ? String(raw).trim() : "";
            const safe =
              s.startsWith("https://") || s.startsWith("http://") ? s : null;
            return { ...r, avatar_uri: safe };
          }
          return r;
        }),
        { onConflict: "id" },
      );
    if (error) throw new Error(`Supabase upsert ${t}: ${error.message}`);
  }
}

/** Upload local rows (insert/update). Does not delete remote rows missing locally. */
export async function pushUpsertsToSupabase(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  for (const t of TABLE_UPSERT_ORDER) {
    const rows = await db.getAllAsync<Record<string, unknown>>(SELECT_SQL[t]);
    await upsertRemote(sb, t, rows);
  }
}

/** Removes Supabase rows whose ids are not present locally (propagates local deletes). */
export async function pruneRemoteRowsNotInLocalDb(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  for (const t of REMOTE_DELETE_TABLES) {
    const { data, error: selErr } = await sb.from(t).select("id");
    if (selErr) throw new Error(`Supabase list ${t}: ${selErr.message}`);
    const remote = new Set((data as { id: string }[] | null | undefined)?.map((r) => r.id) ?? []);
    const local = new Set(
      (
        (await db.getAllAsync<{ id: string }>(
          t === "users" ? "SELECT id FROM users" : `SELECT id FROM ${t}`,
        )) as { id: string }[]
      ).map((r) => r.id),
    );
    for (const id of remote) {
      if (t === "users" && id === getLocalUserId()) continue;
      if (local.has(id)) continue;
      const { error: dErr } = await sb.from(t).delete().eq("id", id);
      if (dErr) throw new Error(`Supabase delete ${t}: ${dErr.message}`);
    }
  }
}

/**
 * Full push path: merge from Supabase first (so deletes/edits on other devices apply here),
 * upload local rows, clear “pending upload” guards, then prune remote rows removed locally.
 * Upload-before-pull wrongly re-inserted rows another client had deleted from the server.
 */
export async function pushMergedToSupabase(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  await pullAllFromSupabase(sb, db);
  await pushUpsertsToSupabase(sb, db);
  try {
    await db.execAsync(`DELETE FROM sync_cloud_insert_pending`);
  } catch {
    /* missing table on very old DBs */
  }
  await pruneRemoteRowsNotInLocalDb(sb, db);
}

export async function pushAllToSupabase(sb: SupabaseClient, db: SQLiteDatabase): Promise<void> {
  await pushUpsertsToSupabase(sb, db);
  await pruneRemoteRowsNotInLocalDb(sb, db);
}
