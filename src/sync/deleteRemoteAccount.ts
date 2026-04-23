import { guardNetworkCall } from "../core/networkGuard";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { deleteAvatarFromStorage } from "../core/avatarStorage";

/**
 * Tear down everything this user owns on Supabase, in an order that respects
 * the (logical, non-FK'd) parent→child relationships in `tally_remote_schema.sql`.
 *
 * Scope:
 *   • splits/settlements/expenses authored by the user (payer_id = uid, etc.)
 *   • group_members rows for the user
 *   • group_invites issued by the user
 *   • groups where the user was the only member — plus everything in them
 *   • the user's `public.users` and `public.profiles` rows
 *   • the user's avatar object in the `avatars` bucket
 *
 * What this does NOT delete:
 *   • the `auth.users` row itself — that requires a Supabase Edge Function
 *     with the service-role key (client anon key cannot delete auth users).
 *     Users can sign back in later with the same email; they'll just see a
 *     freshly empty account.
 *   • shared groups that still have other members — we remove the user but
 *     leave the group intact so the remaining members' data survives.
 *
 * Best-effort: failures are swallowed per step so a single 400 from one table
 * doesn't prevent the next delete. Pre-conditions: caller is still signed in
 * (we need their access token). Must run BEFORE `signOut`.
 */
export async function deleteRemoteAccountData(userId: string): Promise<void> {
  const client = createTallySupabaseClient();
  if (!client) return;

  const safe = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await guardNetworkCall(async () => {
        await fn();
      });
    } catch (e) {
      if (process.env["NODE_ENV"] === "development") {
        // eslint-disable-next-line no-console
        console.warn(`[deleteRemoteAccount] ${label} failed:`, e);
      }
    }
  };

  // 1. Find groups where the user is the ONLY member. Those are safe to wipe
  //    entirely — no one else is relying on their expenses / settlements.
  let soloGroupIds: string[] = [];
  try {
    const { data: myGroups } = await guardNetworkCall(() =>
      client
        .from("group_members")
        .select("group_id")
        .eq("user_id", userId),
    );
    const candidateIds = Array.from(
      new Set(
        (myGroups ?? [])
          .map((r) => (r as { group_id?: string }).group_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    );
    if (candidateIds.length > 0) {
      const { data: allMembers } = await guardNetworkCall(() =>
        client
          .from("group_members")
          .select("group_id, user_id")
          .in("group_id", candidateIds),
      );
      const countsByGroup = new Map<string, Set<string>>();
      for (const r of allMembers ?? []) {
        const row = r as { group_id?: string; user_id?: string };
        if (!row.group_id || !row.user_id) continue;
        if (!countsByGroup.has(row.group_id)) {
          countsByGroup.set(row.group_id, new Set());
        }
        countsByGroup.get(row.group_id)!.add(row.user_id);
      }
      for (const gid of candidateIds) {
        const users = countsByGroup.get(gid);
        if (users && users.size === 1 && users.has(userId)) {
          soloGroupIds.push(gid);
        }
      }
    }
  } catch {
    // If this query fails we still continue — the per-row deletes below
    // remain best-effort and won't touch other users' groups.
    soloGroupIds = [];
  }

  // 2. Solo-group teardown — wipe every child row first, then the group itself.
  if (soloGroupIds.length > 0) {
    await safe("splits (solo groups)", async () => {
      // Splits don't have a group_id column; join via expenses.
      const { data: exps } = await guardNetworkCall(() =>
        client
          .from("expenses")
          .select("id")
          .in("group_id", soloGroupIds),
      );
      const expenseIds = (exps ?? [])
        .map((r) => (r as { id?: string }).id)
        .filter((id): id is string => typeof id === "string" && id.length > 0);
      if (expenseIds.length > 0) {
        await client.from("splits").delete().in("expense_id", expenseIds);
      }
    });
    await safe("settlements (solo groups)", () =>
      client.from("settlements").delete().in("group_id", soloGroupIds),
    );
    await safe("expenses (solo groups)", () =>
      client.from("expenses").delete().in("group_id", soloGroupIds),
    );
    await safe("group_invites (solo groups)", () =>
      client.from("group_invites").delete().in("group_id", soloGroupIds),
    );
    await safe("group_members (solo groups)", () =>
      client.from("group_members").delete().in("group_id", soloGroupIds),
    );
    await safe("groups (solo)", () =>
      client.from("groups").delete().in("id", soloGroupIds),
    );
  }

  // 3. In shared groups: pull the user out but leave the group running.
  await safe("splits authored by user", () =>
    client.from("splits").delete().eq("user_id", userId),
  );
  await safe("settlements from user", () =>
    client.from("settlements").delete().eq("from_user_id", userId),
  );
  await safe("settlements to user", () =>
    client.from("settlements").delete().eq("to_user_id", userId),
  );
  await safe("expenses paid by user", () =>
    client.from("expenses").delete().eq("payer_id", userId),
  );
  await safe("group_invites issued by user", () =>
    client.from("group_invites").delete().eq("invited_by_user_id", userId),
  );
  await safe("group_members (remaining)", () =>
    client.from("group_members").delete().eq("user_id", userId),
  );

  // 4. Profile rows + storage.
  await safe("avatar object", () => deleteAvatarFromStorage());
  await safe("users row", () =>
    client.from("users").delete().eq("id", userId),
  );
  await safe("profiles row", () =>
    client.from("profiles").delete().eq("id", userId),
  );
}
