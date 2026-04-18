import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { SQLiteDatabase } from "expo-sqlite";
import { getSupabaseAnonKey, getSupabaseUrl } from "./config";
import { LOCAL_USER_ID } from "../db/ids";

const TABLE_DELETE_ORDER = [
  "splits",
  "expenses",
  "settlements",
  "group_members",
  "groups",
  "users",
] as const;

const TABLE_UPSERT_ORDER = [
  "users",
  "groups",
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

let supabaseClientCache: SupabaseClient | null = null;
let supabaseClientCacheKey: string | null = null;

/**
 * Reuses one client per (url, key) so the browser does not get multiple GoTrueClient instances
 * (supabase-js warns when several clients share the same storage key).
 */
export function createTallySupabaseClient(): SupabaseClient | null {
  const url = getSupabaseUrl();
  const key = getSupabaseAnonKey();
  if (!url || !key) {
    supabaseClientCache = null;
    supabaseClientCacheKey = null;
    return null;
  }
  const k = `${url}\0${key}`;
  if (supabaseClientCache && supabaseClientCacheKey === k) return supabaseClientCache;
  supabaseClientCache = createClient(url, key);
  supabaseClientCacheKey = k;
  return supabaseClientCache;
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
) {
  const all = await t.getAllAsync<{ id: string }>(`SELECT id FROM ${name}`);
  for (const row of all) {
    if (name === "users" && row.id === LOCAL_USER_ID) continue;
    if (ids.has(row.id)) continue;
    await t.runAsync(`DELETE FROM ${name} WHERE id = ?`, row.id);
  }
}

function upsertRow(t: TConn, table: SyncedTable, row: Record<string, unknown>) {
  if (table === "users" && String(row.id) === LOCAL_USER_ID) {
    return Promise.resolve();
  }
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
      `INSERT OR REPLACE INTO users (id, name, email, last_modified) VALUES (?, ?, ?, ?)`,
      String(row.id),
      String(row.name),
      row.email != null && String(row.email) !== "" ? String(row.email) : null,
      String(row.last_modified),
    );
  if (table === "group_members")
    return t.runAsync(
      `INSERT OR REPLACE INTO group_members (id, group_id, user_id, joined_at, last_modified) VALUES (?, ?, ?, ?, ?)`,
      String(row.id),
      String(row.group_id),
      String(row.user_id),
      String(row.joined_at),
      String(row.last_modified),
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
 * Fetches all synced tables from Supabase, then rewrites the local `SQLite` file to match.
 */
export async function pullAllFromSupabase(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  const byTable: Record<SyncedTable, Record<string, unknown>[]> = {
    users: [],
    groups: [],
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
  const usersKeep = setFromIds(byTable.users as { id: string }[] | null, [LOCAL_USER_ID]);
  const groupsKeep = setFromIds(byTable.groups as { id: string }[] | null, []);
  const idKeep: Record<SyncedTable, Set<string>> = {
    users: usersKeep,
    groups: groupsKeep,
    group_members: setFromIds(
      byTable.group_members as { id: string }[] | null,
    ),
    expenses: setFromIds(byTable.expenses as { id: string }[] | null, []),
    splits: setFromIds(byTable.splits as { id: string }[] | null, []),
    settlements: setFromIds(byTable.settlements as { id: string }[] | null, []),
  };

  await db.execAsync("BEGIN");
  try {
    for (const d of TABLE_DELETE_ORDER) {
      await deleteLocalNotInRemote(db, d, idKeep[d]!);
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
  groups: `SELECT id, name, currency, icon, group_type, simplify_debts, created_at, last_modified FROM groups`,
  users: `SELECT id, name, email, last_modified FROM users`,
  group_members: `SELECT id, group_id, user_id, joined_at, last_modified FROM group_members`,
  expenses: `SELECT id, group_id, payer_id, amount_minor, description, expense_date, created_at, category, notes, last_modified FROM expenses`,
  splits: `SELECT id, expense_id, user_id, owed_minor, last_modified FROM splits`,
  settlements: `SELECT id, group_id, from_user_id, to_user_id, amount_minor, settled_at, last_modified FROM settlements`,
};

const REMOTE_DELETE_TABLES = [
  "splits",
  "expenses",
  "settlements",
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
          return r;
        }),
        { onConflict: "id" },
      );
    if (error) throw new Error(`Supabase upsert ${t}: ${error.message}`);
  }
}

export async function pushAllToSupabase(sb: SupabaseClient, db: SQLiteDatabase): Promise<void> {
  for (const t of TABLE_UPSERT_ORDER) {
    const rows = await db.getAllAsync<Record<string, unknown>>(SELECT_SQL[t]);
    await upsertRemote(sb, t, rows);
  }
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
      if (t === "users" && id === LOCAL_USER_ID) continue;
      if (local.has(id)) continue;
      const { error: dErr } = await sb.from(t).delete().eq("id", id);
      if (dErr) throw new Error(`Supabase delete ${t}: ${dErr.message}`);
    }
  }
}
