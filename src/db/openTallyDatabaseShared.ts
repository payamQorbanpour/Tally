import { getLocalUserId } from "./ids";
import type { TallyDb } from "./tallyDb";

/**
 * One row for “self” in `users` — required for groups/splits. Shared by web + native.
 */
export async function ensureLocalUserSeed(tally: TallyDb): Promise<void> {
  const id = getLocalUserId();
  const row = await tally.getFirstAsync<{ c: number }>(
    "SELECT 1 as c FROM users WHERE id = ?",
    id,
  );
  if (row) return;
  const now = new Date().toISOString();
  await tally.runAsync(
    "INSERT INTO users (id, name, email, last_modified) VALUES (?, ?, NULL, ?)",
    id,
    "You",
    now,
  );
}
