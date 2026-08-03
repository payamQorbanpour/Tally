/**
 * Set difference behind the pre-sync merge check, split into its own
 * import-free module so it is testable under vitest's `node` environment —
 * `supabaseSync.ts` pulls in `expo-sqlite` and `@supabase/supabase-js`, which
 * cannot load there.
 *
 * Returns the ids present locally but absent from the account: exactly the
 * rows `deleteLocalNotInRemote` would delete on the next pull.
 */
export function diffLocalOnlyIds(
  localIds: string[],
  remoteIds: Set<string>,
): string[] {
  return localIds.filter((id) => !remoteIds.has(id));
}
