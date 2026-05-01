import { guardNetworkCall } from "../core/networkGuard";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { deleteAvatarFromStorage } from "../core/avatarStorage";

/** Display name written into the `users` row when an account is soft-deleted.
 *  Visible to other group members in shared expenses / settlements. */
export const SOFT_DELETED_NAME = "[Deleted]";

/**
 * Soft-delete the user's account: mark the `public.users` row with
 * `deleted_at = now()`, anonymize PII (name → SOFT_DELETED_NAME, avatar_uri
 * → null), drop the avatar object, and STOP THERE. We do NOT delete:
 *
 *   • the `auth.users` row — kept so the user can sign back in with the
 *     same email + password during the grace window and call
 *     `restoreSoftDeletedAccount` to recover their account.
 *   • their group_members / expenses / settlements rows — co-owned with
 *     other users; deleting them would silently break those people's data.
 *     The `[Deleted]` display name keeps history readable.
 *
 * The retained email is what powers the restore-on-signin prompt.
 *
 * After the configured grace period (30 days, enforced by a Supabase
 * scheduled function), a hard-purge job clears the auth row + the
 * `users` row entirely.
 *
 * Best-effort: every step is wrapped in a try/catch so a single 400
 * doesn't stop the rest. Pre-condition: caller is still signed in.
 */
export async function softDeleteRemoteAccount(userId: string): Promise<void> {
  const client = createTallySupabaseClient();
  if (!client) return;

  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await guardNetworkCall(async () => {
        await fn();
      });
    } catch (e) {
      if (process.env["NODE_ENV"] === "development") {
        console.warn(`[softDeleteRemoteAccount] ${label} failed:`, e);
      }
    }
  };

  const nowIso = new Date().toISOString();

  // 1. Anonymize the public users row. Email is retained for restore.
  await safe("users row anonymize", () =>
    client
      .from("users")
      .update({
        name: SOFT_DELETED_NAME,
        avatar_uri: null,
        deleted_at: nowIso,
        last_modified: nowIso,
      })
      .eq("id", userId),
  );

  // 2. Drop the avatar object — there's no public reference to it after
  //    anonymization, and we don't need to keep storage tied to the account.
  await safe("avatar object", () => deleteAvatarFromStorage());

  // 3. Best-effort profile-row anonymize too (separate `profiles` table on
  //    some Tally deployments). Skip silently if the table isn't present.
  await safe("profiles row anonymize", () =>
    client
      .from("profiles")
      .update({
        name: SOFT_DELETED_NAME,
        avatar_uri: null,
        deleted_at: nowIso,
      })
      .eq("id", userId),
  );
}

/**
 * Inverse of {@link softDeleteRemoteAccount}: clear the `deleted_at`
 * marker so the account is live again. The caller is responsible for
 * re-collecting the user's display name + avatar — those were anonymized
 * at delete time and aren't recoverable from the server.
 */
export async function restoreSoftDeletedAccount(
  userId: string,
  newName: string,
): Promise<void> {
  const client = createTallySupabaseClient();
  if (!client) return;
  const nowIso = new Date().toISOString();
  await guardNetworkCall(() =>
    client
      .from("users")
      .update({
        name: newName.trim() || SOFT_DELETED_NAME,
        deleted_at: null,
        last_modified: nowIso,
      })
      .eq("id", userId),
  );
}

/**
 * Returns the `deleted_at` ISO string on the user's row if the account
 * is currently soft-deleted, or null if the row is live (or missing).
 * Intended for the post-sign-in restore-prompt check.
 */
export async function fetchSoftDeleteState(
  userId: string,
): Promise<{ deletedAt: string | null; email: string | null } | null> {
  const client = createTallySupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await guardNetworkCall(() =>
      client
        .from("users")
        .select("deleted_at, email")
        .eq("id", userId)
        .maybeSingle(),
    );
    if (error || !data) return null;
    const row = data as { deleted_at?: string | null; email?: string | null };
    return {
      deletedAt: row.deleted_at ?? null,
      email: row.email ?? null,
    };
  } catch {
    return null;
  }
}
