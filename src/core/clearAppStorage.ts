import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { openDatabaseAsync } from "expo-sqlite";
import { DEFAULT_LOCAL_USER_ID, setResolvedLocalUserId } from "../db/ids";
import { TALLY_DB_NAME } from "../db/tallySchema";
import type { TallyDb } from "../db/tallyDb";

/**
 * AsyncStorage flag set from the account-delete flow. Read at boot BEFORE the
 * SQLite handle is opened so the wipe runs on a clean slate — no effects, no
 * Supabase sync in-flight, no live DB handle racing with `DELETE FROM`.
 */
const PENDING_ACCOUNT_DELETE_KEY = "@tally:pending_account_delete";

/**
 * Called from the delete button BEFORE `reloadAppAsync`. Records intent; the
 * actual wipe happens on the next cold boot via
 * {@link applyPendingAccountDeletionIfAny}.
 */
export async function markPendingAccountDeletion(): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_ACCOUNT_DELETE_KEY, "1");
  } catch {
    /* best-effort — if this fails, the reload still proceeds and the user can
       tap Delete again. */
  }
}

/**
 * Boot hook: if a deletion was marked before the last reload, delete the
 * SQLite file and clear AsyncStorage (removing the Supabase session cache and
 * the flag itself). Must be called BEFORE `openTallyDatabase` so nothing in
 * the app is holding a handle to the DB we're deleting.
 */
export async function applyPendingAccountDeletionIfAny(): Promise<void> {
  let flag: string | null = null;
  try {
    flag = await AsyncStorage.getItem(PENDING_ACCOUNT_DELETE_KEY);
  } catch {
    return;
  }
  if (flag !== "1") return;

  // Wipe data via `DELETE FROM` on an open handle instead of
  // `deleteDatabaseAsync`. The file-level delete raced with expo-sqlite's
  // cached handles / WAL files and produced
  //   "Calling the 'finalizeAsync' function has failed → database is locked"
  // on reload. Running DELETE FROM on a fresh connection is idempotent,
  // works even if the schema hasn't been created yet, and leaves the file
  // in a clean state that `openTallyDatabase` can re-migrate. This runs on
  // web too — expo-sqlite's web impl stores in OPFS / IndexedDB, which
  // `localStorage.clear()` below does NOT touch.
  try {
    const db = await openDatabaseAsync(TALLY_DB_NAME);
    try {
      for (const table of TABLES_TO_WIPE) {
        try {
          await db.execAsync(`DELETE FROM ${table}`);
        } catch {
          // Table may not exist yet — normal for the very first boot.
        }
      }
    } finally {
      try {
        await db.closeAsync();
      } catch {
        /* best-effort */
      }
    }
  } catch {
    // If we couldn't even open, the next `openTallyDatabase` call will
    // still succeed with whatever state is on disk. AsyncStorage clear
    // below + `setResolvedLocalUserId` cover the in-memory side.
  }
  try {
    await AsyncStorage.clear();
  } catch {
    /* best-effort */
  }
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    try {
      localStorage.clear();
    } catch {
      /* best-effort */
    }
  }
  setResolvedLocalUserId(DEFAULT_LOCAL_USER_ID);
}

/**
 * Tables are wiped in an order that tolerates foreign-key-like references
 * (splits before expenses, group_members before groups, etc.). DELETE FROM
 * is used on the caller-supplied live handle so we don't race with the
 * provider on closing / deleting the SQLite file (which previously produced
 * `database is locked` errors).
 */
const TABLES_TO_WIPE = [
  "splits",
  "settlements",
  "expenses",
  "group_invites",
  "group_members",
  "groups",
  "users",
  "feedback_reports",
  "sync_pending_remote_delete",
  "sync_cloud_insert_pending",
  "app_settings",
];

/**
 * Wipe local app state so the app can start from scratch. Pass the live
 * `TallyDb` handle when possible — we run `DELETE FROM` on the open
 * connection instead of trying to delete the underlying file, which avoids
 * "database is locked" errors from expo-sqlite's handle caching.
 */
export async function clearAllAppStorage(db?: TallyDb): Promise<void> {
  try {
    // Wipe AsyncStorage first (auth sessions, cached preferences).
    await AsyncStorage.clear();

    if (db) {
      // Prefer a single transaction so a failure halfway through doesn't
      // leave the DB in an inconsistent state.
      try {
        await db.withTransactionAsync(async (tx) => {
          for (const table of TABLES_TO_WIPE) {
            try {
              await tx.runAsync(`DELETE FROM ${table}`);
            } catch {
              // Table may not exist on older schemas; keep going.
            }
          }
        });
      } catch {
        // Transaction failed — best-effort fall back to per-statement DELETE.
        for (const table of TABLES_TO_WIPE) {
          try {
            await db.runAsync(`DELETE FROM ${table}`);
          } catch {
            // ignore
          }
        }
      }
    } else if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      // No db handle and we're on web — clear the raw browser storage so the
      // Supabase web client and any other localStorage consumers start fresh.
      localStorage.clear();
    }

    // Reset the module-level resolved user id so the next sign-in starts
    // from DEFAULT_LOCAL_USER_ID instead of hitting the
    // "Different account on this device" guard.
    setResolvedLocalUserId(DEFAULT_LOCAL_USER_ID);
  } catch (error) {
    console.error("Error clearing app storage:", error);
    throw error;
  }
}
