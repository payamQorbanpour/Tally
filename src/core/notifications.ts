import type { TallyDb } from "../db/tallyDb";
import { getLocalUserId } from "../db/ids";
import { formatMinor } from "../data/currencies";
import {
  getGroupBalances,
  listExpenses,
  listGroups,
  type ExpenseRow,
  type GroupRow,
} from "../data/tallyRepo";

/**
 * Notification taxonomy used by {@link deriveNotifications} and the UI.
 *
 * Derivation is deliberately pure — every notification is recomputed from
 * the local SQLite tables, so there's no read/ack schema to sync yet. When
 * you want persistent read state, add a `notifications` table + sync and
 * swap the derivation for a table-backed list.
 */
export type NotificationKind =
  | "owed_by_me"
  | "owed_to_me"
  | "pending_invite"
  | "new_expense"
  | "system";

export type NotificationSection =
  | "action_required"
  | "money_updates"
  | "activity"
  | "system";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  section: NotificationSection;
  /** Accent color hint for the UI — mapped to a theme color at render time. */
  accent: "red" | "green" | "blue" | "neutral";
  /** Sort key: higher = more prominent. Within a section, bigger-money
   *  items surface first; invites also beat activity. */
  priority: number;
  createdAt: string; // ISO
  title: string;
  subtitle: string | null;
  groupId: string | null;
  /** Optional deep-link payload the UI uses on tap. */
  target:
    | { kind: "group"; groupId: string }
    | { kind: "invite"; groupId: string; token: string }
    | null;
  /** Letter to draw inside the avatar badge (payer initial, etc.). */
  avatarLetter: string | null;
};

const RECENT_EXPENSE_DAYS = 14;

/**
 * Build the notification feed from current local state. Called from the
 * notifications screen whenever it regains focus; cheap to recompute.
 */
export async function deriveNotifications(
  db: TallyDb,
): Promise<NotificationItem[]> {
  const myId = getLocalUserId();
  const groups = await listGroups(db);
  const out: NotificationItem[] = [];

  const [balancesByGroup, expensesByGroup, pendingInvites] = await Promise.all([
    loadBalancesByGroup(db, groups),
    loadRecentExpensesByGroup(db, groups),
    loadPendingInvites(db),
  ]);

  // --- Balances → you owe / you're owed ---------------------------------
  for (const g of groups) {
    const balance = balancesByGroup.get(g.id)?.get(myId) ?? 0;
    if (balance < 0) {
      const owes = Math.abs(balance);
      out.push({
        id: `balance:${g.id}:owe`,
        kind: "owed_by_me",
        section: "action_required",
        accent: "red",
        priority: 1000 + owes,
        createdAt: g.created_at ?? new Date().toISOString(),
        title: `You owe ${formatMinor(owes, g.currency)}`,
        subtitle: g.name,
        groupId: g.id,
        target: { kind: "group", groupId: g.id },
        avatarLetter: initialOf(g.name),
      });
    } else if (balance > 0) {
      out.push({
        id: `balance:${g.id}:owed`,
        kind: "owed_to_me",
        section: "money_updates",
        accent: "green",
        priority: 500 + balance,
        createdAt: g.created_at ?? new Date().toISOString(),
        title: `You're owed ${formatMinor(balance, g.currency)}`,
        subtitle: g.name,
        groupId: g.id,
        target: { kind: "group", groupId: g.id },
        avatarLetter: initialOf(g.name),
      });
    }
  }

  // --- Pending invites (anything I sent that still hasn't been accepted,
  //     useful because it reminds me to ping the recipient) --------------
  for (const inv of pendingInvites) {
    const group = groups.find((g) => g.id === inv.groupId);
    out.push({
      id: `invite:${inv.id}`,
      kind: "pending_invite",
      section: "action_required",
      accent: "red",
      priority: 900,
      createdAt: inv.createdAt,
      title: `Invite pending: ${inv.email}`,
      subtitle: group?.name ?? null,
      groupId: inv.groupId,
      target: {
        kind: "invite",
        groupId: inv.groupId,
        token: inv.token,
      },
      avatarLetter: initialOf(inv.email),
    });
  }

  // --- Recent expenses → activity --------------------------------------
  for (const g of groups) {
    const rows = expensesByGroup.get(g.id) ?? [];
    for (const e of rows) {
      const isMine = e.payer_id === myId;
      out.push({
        id: `expense:${e.id}`,
        kind: "new_expense",
        section: "activity",
        accent: "blue",
        priority: 100,
        createdAt: e.created_at || e.expense_date,
        title: isMine
          ? `You added ${formatMinor(e.amount_minor, g.currency)}`
          : `${e.payer_name} added ${formatMinor(e.amount_minor, g.currency)}`,
        subtitle: `${g.name} · ${e.description}`,
        groupId: g.id,
        target: { kind: "group", groupId: g.id },
        avatarLetter: initialOf(e.payer_name),
      });
    }
  }

  // --- System / fallback: welcome card when nothing else exists --------
  if (out.length === 0) {
    out.push({
      id: "system:welcome",
      kind: "system",
      section: "system",
      accent: "neutral",
      priority: 1,
      createdAt: new Date().toISOString(),
      title: "Welcome to Tally",
      subtitle: "Track shared expenses. Notifications show up here.",
      groupId: null,
      target: null,
      avatarLetter: "T",
    });
  }

  return out.sort((a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    return (b.createdAt || "").localeCompare(a.createdAt || "");
  });
}

async function loadBalancesByGroup(
  db: TallyDb,
  groups: GroupRow[],
): Promise<Map<string, Map<string, number>>> {
  const entries = await Promise.all(
    groups.map(async (g) => [g.id, await getGroupBalances(db, g.id)] as const),
  );
  return new Map(entries);
}

async function loadRecentExpensesByGroup(
  db: TallyDb,
  groups: GroupRow[],
): Promise<Map<string, ExpenseRow[]>> {
  const cutoff = Date.now() - RECENT_EXPENSE_DAYS * 24 * 60 * 60 * 1000;
  const entries = await Promise.all(
    groups.map(async (g) => {
      const all = await listExpenses(db, g.id);
      const recent = all.filter(
        (e) => Date.parse(e.created_at || e.expense_date) >= cutoff,
      );
      return [g.id, recent] as const;
    }),
  );
  return new Map(entries);
}

type PendingInviteRow = {
  id: string;
  group_id: string;
  email: string;
  token: string;
  created_at: string;
  accepted_at: string | null;
};

async function loadPendingInvites(db: TallyDb): Promise<
  {
    id: string;
    groupId: string;
    email: string;
    token: string;
    createdAt: string;
  }[]
> {
  try {
    const rows = await db.getAllAsync<PendingInviteRow>(
      `SELECT id, group_id, email, token, created_at, accepted_at
       FROM group_invites
       WHERE accepted_at IS NULL
       ORDER BY created_at DESC`,
    );
    return rows.map((r) => ({
      id: r.id,
      groupId: r.group_id,
      email: r.email,
      token: r.token,
      createdAt: r.created_at,
    }));
  } catch {
    // Older DBs without the group_invites table.
    return [];
  }
}

function initialOf(s: string | null | undefined): string {
  const first = (s ?? "").trim().slice(0, 1).toUpperCase();
  return first || "•";
}
