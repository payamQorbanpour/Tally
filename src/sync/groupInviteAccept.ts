import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "../data/emailValidation";
import {
  addExistingUserToGroup,
  cloudInsertPendingAdd,
  setGroupMemberRole,
  type GroupMemberRole,
} from "../data/tallyRepo";
import type { TallyDb } from "../db/tallyDb";

function parseInviteRole(raw: unknown): GroupMemberRole {
  return raw === "viewer" ? "viewer" : "collaborator";
}

/**
 * Joins the group in the invite when the signed-in email matches. Updates local SQLite and marks the invite accepted.
 */
export async function acceptGroupInviteWithAuth(
  sb: SupabaseClient,
  db: TallyDb,
  token: string,
  authUserId: string,
  authEmail: string,
): Promise<{ ok: true; groupId: string } | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "missing_token" };

  const { data: inv, error } = await sb
    .from("group_invites")
    .select("*")
    .eq("token", trimmed)
    .maybeSingle();

  if (error) return { ok: false, error: "invite_lookup_failed" };
  if (!inv) return { ok: false, error: "invite_not_found" };

  const inviteEmail = normalizeEmail(String(inv.email ?? ""));
  if (normalizeEmail(authEmail) !== inviteEmail) {
    return { ok: false, error: "email_mismatch" };
  }

  const groupId = String(inv.group_id);
  const role = parseInviteRole(inv.role);
  const inviteId = String(inv.id);
  const now = new Date().toISOString();

  const ex = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`,
    groupId,
    authUserId,
  );
  if (!ex) {
    await addExistingUserToGroup(db, groupId, authUserId, role);
  } else {
    await setGroupMemberRole(db, groupId, authUserId, role);
  }

  await db.runAsync(
    `UPDATE group_invites SET accepted_at = ?, last_modified = ? WHERE id = ?`,
    now,
    now,
    inviteId,
  );
  await cloudInsertPendingAdd(db, inviteId);

  return { ok: true, groupId };
}
