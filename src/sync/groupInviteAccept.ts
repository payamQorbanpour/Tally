import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupMemberRole } from "../data/tallyRepo";

/** Why an invite could not be redeemed. Each maps to its own user-facing line. */
export type AcceptInviteError =
  | "missing_token"
  | "not_signed_in"
  | "invite_not_found"
  | "email_mismatch"
  | "invite_lookup_failed"
  | "invite_failed";

export type AcceptInviteResult =
  | { ok: true; groupId: string; role: GroupMemberRole }
  | { ok: false; error: AcceptInviteError };

const KNOWN_ERRORS = new Set<string>([
  "missing_token",
  "not_signed_in",
  "invite_not_found",
  "email_mismatch",
  "invite_lookup_failed",
]);

/** PostgREST returns a scalar for a plain function but can wrap it in a row set. */
function unwrap(data: unknown): Record<string, unknown> | null {
  const v = Array.isArray(data) ? data[0] : data;
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

/**
 * Redeems a group invite token — either a personal invite (addressed to the
 * caller's email) or the group's open share link.
 *
 * The work happens in `tally_accept_group_invite` on the server, for two
 * reasons that are easy to lose:
 *
 *   1. The invitee cannot *read* their own invite from the client. RLS on
 *      `group_invites` grants SELECT to group members and to the person who
 *      created the invite — an invitee is neither. "The caller knows the
 *      token" is not expressible in a USING clause, since USING is evaluated
 *      per row and never sees the query's predicate.
 *   2. Writing the membership row locally and letting the ordinary sync push
 *      it is unsafe: that push is followed immediately by
 *      `pruneRemoteRowsNotInLocalDb`, and at that moment this device still
 *      knows nothing about the group it just joined — so the prune would
 *      delete the group's remote expenses, splits and members. Joining on the
 *      server and *pulling* afterwards keeps that window closed.
 *
 * The caller is responsible for the pull (see `pullCloudData` on the database
 * context); until then the group is not on this device.
 */
export async function acceptGroupInvite(
  sb: SupabaseClient,
  token: string,
): Promise<AcceptInviteResult> {
  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "missing_token" };

  const { data, error } = await sb.rpc("tally_accept_group_invite", {
    p_token: trimmed,
  });
  // A transport or permission failure is not "no such invite" — telling the
  // user to check their link when the link is fine sends them the wrong way.
  if (error) return { ok: false, error: "invite_lookup_failed" };

  const row = unwrap(data);
  if (!row) return { ok: false, error: "invite_failed" };

  if (row.ok !== true) {
    const reason = String(row.error ?? "");
    return {
      ok: false,
      error: KNOWN_ERRORS.has(reason)
        ? (reason as AcceptInviteError)
        : "invite_failed",
    };
  }

  const groupId = typeof row.group_id === "string" ? row.group_id.trim() : "";
  if (!groupId) return { ok: false, error: "invite_failed" };

  return {
    ok: true,
    groupId,
    role: row.role === "viewer" ? "viewer" : "collaborator",
  };
}
