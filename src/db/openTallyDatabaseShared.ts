import type { AbstractPowerSyncDatabase } from "@powersync/common";
import { LOCAL_USER_ID } from "./ids";
import type { TallyDb } from "./tallyDb";

/**
 * One row for “self” in `users` — required for groups/splits. Shared by web + native.
 */
export async function ensureLocalUserSeed(
  powerSync: AbstractPowerSyncDatabase,
  _tally: TallyDb,
): Promise<void> {
  await powerSync.writeTransaction(async (tx) => {
    const row = await tx.getOptional<{ c: number }>(
      "SELECT 1 as c FROM users WHERE id = ?",
      [LOCAL_USER_ID],
    );
    if (row) return;
    const now = new Date().toISOString();
    await tx.execute(
      "INSERT INTO users (id, name, email, last_modified) VALUES (?, ?, NULL, ?)",
      [LOCAL_USER_ID, "You", now],
    );
  });
}

