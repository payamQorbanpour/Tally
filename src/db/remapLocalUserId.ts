import type { TallyDb } from "./tallyDb";
import { setResolvedLocalUserId } from "./ids";

/**
 * Rewrites the local “you” user id everywhere in SQLite (e.g. default device id → Supabase `auth.users.id`).
 */
export async function remapLocalUserIdInSqlite(
  db: TallyDb,
  fromId: string,
  toId: string,
): Promise<void> {
  if (fromId === toId) return;
  const existing = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM users WHERE id = ?",
    toId,
  );
  if (existing && existing.id !== fromId) {
    throw new Error("local_user_id_conflict");
  }
  await db.withTransactionAsync(async (tx) => {
    await tx.runAsync("UPDATE group_members SET user_id = ? WHERE user_id = ?", toId, fromId);
    await tx.runAsync("UPDATE expenses SET payer_id = ? WHERE payer_id = ?", toId, fromId);
    await tx.runAsync("UPDATE splits SET user_id = ? WHERE user_id = ?", toId, fromId);
    await tx.runAsync(
      "UPDATE settlements SET from_user_id = ? WHERE from_user_id = ?",
      toId,
      fromId,
    );
    await tx.runAsync(
      "UPDATE settlements SET to_user_id = ? WHERE to_user_id = ?",
      toId,
      fromId,
    );
    await tx.runAsync("UPDATE users SET id = ? WHERE id = ?", toId, fromId);
  });
  setResolvedLocalUserId(toId);
}
