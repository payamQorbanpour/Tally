import {
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  type PowerSyncCredentials,
  UpdateType,
} from "@powersync/common";
import { getSupabaseAnonKey, getSupabaseUrl, isPowerSyncConfigured } from "./config";

const PS_PREFIX = "ps_data__";
const PS_LOCAL_PREFIX = "ps_data_local__";

function publicTableName(entryTable: string): string | null {
  if (entryTable.startsWith(PS_PREFIX)) {
    return entryTable.slice(PS_PREFIX.length);
  }
  if (entryTable.startsWith(PS_LOCAL_PREFIX) || entryTable === "ps_data_local__app_settings") {
    return null;
  }
  return entryTable;
}

/**
 * Development helper: return the published anon key from env if present.
 * Replace with `supabase.auth.getSession().access_token` in production.
 */
export async function getDevSupabaseToken(): Promise<string | null> {
  return getSupabaseAnonKey();
}

/**
 * Pushes the PowerSync upload queue to Supabase PostgREST. Configure
 * `EXPO_PUBLIC_POWERSYNC_URL`, `EXPO_PUBLIC_SUPABASE_URL`, and a JWT (anon or
 * user — see RLS) for Supabase fetches; align buckets with your PowerSync rules.
 */
export function createSupabaseConnector(
  getSessionToken: () => Promise<string | null>,
): PowerSyncBackendConnector {
  return {
    fetchCredentials,
    async uploadData(database) {
      await applyUploadBatches(database, getSessionToken);
    },
  };

  async function fetchCredentials(): Promise<PowerSyncCredentials | null> {
    if (!isPowerSyncConfigured()) return null;
    const e = (process.env.EXPO_PUBLIC_POWERSYNC_URL ?? "").trim();
    if (!e) return null;
    const token = await getSessionToken();
    if (!token) return null;
    return { endpoint: e, token, expiresAt: new Date(Date.now() + 55 * 60 * 1000) };
  }
}

function restHeaders(anon: string, bearer: string, withMerge = false) {
  const c: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    apikey: anon,
    Authorization: "Bearer " + (bearer || anon),
  };
  if (withMerge) c.Prefer = "return=representation,resolution=merge-duplicates";
  return c;
}

async function applyOne(
  e: CrudEntry,
  supabase: string,
  anon: string,
  userJwt: string,
): Promise<void> {
  const t = publicTableName(e.table);
  if (t == null) return;
  if (e.op === UpdateType.PUT) {
    const u = new URL("rest/v1/" + t, supabase);
    u.searchParams.set("on_conflict", "id");
    const r = await fetch(u, {
      method: "POST",
      headers: restHeaders(anon, userJwt, true),
      body: JSON.stringify({ id: e.id, ...(e.opData ?? {}) }),
    });
    if (!r.ok) throw new Error((await r.text()) || "PostgREST upsert failed: " + r.status);
  } else if (e.op === UpdateType.PATCH) {
    const p = new URL("rest/v1/" + t, supabase);
    p.search = "?id=eq." + encodeURIComponent(e.id);
    const r = await fetch(p, {
      method: "PATCH",
      headers: restHeaders(anon, userJwt),
      body: JSON.stringify(e.opData ?? {}),
    });
    if (!r.ok) throw new Error((await r.text()) || "PostgREST patch failed: " + r.status);
  } else if (e.op === UpdateType.DELETE) {
    const p = new URL("rest/v1/" + t, supabase);
    p.search = "?id=eq." + encodeURIComponent(e.id);
    const r = await fetch(p, { method: "DELETE", headers: restHeaders(anon, userJwt) });
    if (!r.ok) throw new Error((await r.text()) || "PostgREST delete failed: " + r.status);
  }
}

export async function applyUploadBatches(
  database: AbstractPowerSyncDatabase,
  getToken: () => Promise<string | null>,
): Promise<void> {
  const supabase = getSupabaseUrl();
  const anon = getSupabaseAnonKey() ?? null;
  const userJwt = (await getToken()) ?? anon;
  if (!supabase || !anon) return;
  for (;;) {
    const tx = await database.getNextCrudTransaction();
    if (!tx) return;
    for (const e of tx.crud) {
      await applyOne(e, supabase, anon, userJwt ?? "");
    }
    await tx.complete();
  }
}
