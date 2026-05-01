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

// Order matters under the tightened RLS in `…_tighten_rls.sql`. The "others"
// rows for `users` and `group_members` only pass their policy checks once
// the caller's OWN membership / user row is already present server-side, so:
//   1. groups before group_members  (so the inviter is a recognised collaborator)
//   2. group_members before users    (so a participant `users` row can prove
//      membership via tally_user_in_my_group)
//   3. group_members before group_invites/expenses/splits/settlements
//      (every write into those tables is gated by group membership)
// `pushUpsertsToSupabase` further splits each `users` / `group_members` push
// into a "self first" call followed by an "others" call — see the comment
// there for why the same-statement snapshot makes a single batch insufficient.
const TABLE_UPSERT_ORDER = [
  "feedback_reports",
  "groups",
  "group_members",
  "users",
  "group_invites",
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

/**
 * Map from each synced table to the SQL we use to read its current
 * `last_modified` for a given row id. Used by `applyRemoteRow` to decide
 * whether the incoming remote row is genuinely newer than what's already
 * stored locally — protects against the race where a fresh local edit
 * (with a `now`-timestamped `last_modified`) gets clobbered by an older
 * remote copy that came back from a pull.
 */
const LAST_MODIFIED_SELECT: Record<SyncedTable, string> = {
  feedback_reports: `SELECT last_modified FROM feedback_reports WHERE id = ?`,
  groups: `SELECT last_modified FROM groups WHERE id = ?`,
  users: `SELECT last_modified FROM users WHERE id = ?`,
  group_invites: `SELECT last_modified FROM group_invites WHERE id = ?`,
  group_members: `SELECT last_modified FROM group_members WHERE id = ?`,
  expenses: `SELECT last_modified FROM expenses WHERE id = ?`,
  splits: `SELECT last_modified FROM splits WHERE id = ?`,
  settlements: `SELECT last_modified FROM settlements WHERE id = ?`,
};

/**
 * Decides whether a remote row from a pull should be written into the
 * local database. Returns false (skip the write) when:
 *
 *   1. The id is in `preserveNotYetUploaded` — we have a local edit that
 *      hasn't been pushed yet. Overwriting now would silently revert the
 *      user's edit; the next push will resolve the conflict the right way.
 *   2. A local copy already exists with a `last_modified >=` the remote's
 *      timestamp — local wins last-write-wins.
 *
 * The previous code path called `INSERT OR REPLACE` unconditionally,
 * which is what made offline-edit-then-reconnect revert to the pre-edit
 * state.
 */
async function shouldApplyRemoteRow(
  t: TConn,
  table: SyncedTable,
  row: Record<string, unknown>,
  preserveNotYetUploaded: Set<string>,
): Promise<boolean> {
  const id = String(row.id);
  if (preserveNotYetUploaded.has(id)) return false;
  const remoteLm = String(row.last_modified ?? "");
  if (!remoteLm) return true;
  try {
    const local = await t.getFirstAsync<{ last_modified: string | null }>(
      LAST_MODIFIED_SELECT[table],
      id,
    );
    const localLm = local?.last_modified ?? "";
    if (!localLm) return true;
    // ISO-8601 timestamps compare lexicographically — same as numeric.
    return remoteLm > localLm;
  } catch {
    // If the SELECT fails (table missing on a very old DB, etc.) fall
    // back to applying the remote row so we don't strand the device.
    return true;
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
      for (const row of byTable[t]) {
        // Skip the upsert when the local row is in the pending-push set
        // OR when the local copy already has a newer/equal `last_modified`.
        // Without this guard, a pull during reconnect would clobber
        // unsynced local edits (the symptom: edit → save → revert).
        const apply = await shouldApplyRemoteRow(
          db,
          t,
          row,
          preserveNotYetUploaded,
        );
        if (!apply) continue;
        await upsertRow(db, t, row);
      }
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
  const myId = getLocalUserId();
  for (const t of TABLE_UPSERT_ORDER) {
    const rows = await db.getAllAsync<Record<string, unknown>>(SELECT_SQL[t]);
    if (t === "users" || t === "group_members") {
      // RLS gotcha: policies on "other" rows depend on the caller's OWN row
      // already being on the server (e.g. a participant `users` row passes
      // `tally_user_in_my_group(id)` only when the caller's `group_members`
      // row exists; a co-member `group_members` row passes
      // `tally_is_group_collaborator(group_id)` only when the caller's
      // membership is on file). A single upserted batch is one Postgres
      // statement, and policy checks see the snapshot taken at statement
      // start — they can't see rows from earlier in the same batch. So we
      // commit the caller's own row(s) first, then the rest.
      const matchKey = t === "users" ? "id" : "user_id";
      const mine: Record<string, unknown>[] = [];
      const others: Record<string, unknown>[] = [];
      for (const r of rows) {
        if (r[matchKey] === myId) mine.push(r);
        else others.push(r);
      }
      if (mine.length > 0) await upsertRemote(sb, t, mine);
      if (others.length > 0) await upsertRemote(sb, t, others);
    } else {
      await upsertRemote(sb, t, rows);
    }
  }
}

/** Removes Supabase rows whose ids are not present locally (propagates local deletes). */
export async function pruneRemoteRowsNotInLocalDb(
  sb: SupabaseClient,
  db: SQLiteDatabase,
): Promise<void> {
  const myId = getLocalUserId();
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
      // Never delete your own row from `users` even if local is missing it.
      if (t === "users" && id === myId) continue;
      if (local.has(id)) continue;
      const { error: dErr } = await sb.from(t).delete().eq("id", id);
      if (dErr) {
        // The tightened RLS denies deletes the caller doesn't have rights to
        // (e.g. another collaborator's `users` row, or a `group_members`
        // row in a group you're no longer in). Skip those silently — the
        // owner's device will prune their own copy. Any other error still
        // bubbles up so genuine sync breakage isn't masked.
        const msg = dErr.message ?? "";
        if (/permission denied|policy|row-level security|RLS/i.test(msg)) {
          continue;
        }
        throw new Error(`Supabase delete ${t}: ${msg}`);
      }
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
