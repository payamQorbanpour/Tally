import type { TallyDb } from "../db/tallyDb";
import { computeBalances, type BalanceMap } from "../core/balances";
import type { ExpenseLedgerLine, SettlementLine } from "../core/types";
import { splitEqualMinor } from "../core/splitEqual";
import { LOCAL_USER_ID, newId } from "../db/ids";
export {
  addThousandsSeparators,
  formatMinor,
  formatSignedMoneyInputDisplay,
  formatUnsignedMoneyInputDisplay,
  minorToAmountString,
  parseMoneyToMinor,
  parseSignedMoneyToMinor,
} from "./currencies";

export type GroupType = "home" | "trip" | "couple" | "other";

const GROUP_TYPES = new Set<string>(["home", "trip", "couple", "other"]);

export type GroupRow = {
  id: string;
  name: string;
  currency: string;
  icon: string | null;
  group_type: GroupType;
  simplify_debts: boolean;
  created_at: string;
};

type GroupRowDb = {
  id: string;
  name: string;
  currency: string;
  icon: string | null;
  group_type: string | null;
  simplify_debts: number | null;
  created_at: string;
};

function parseGroupRow(r: GroupRowDb): GroupRow {
  const gt =
    r.group_type && GROUP_TYPES.has(r.group_type) ? r.group_type : "other";
  return {
    id: r.id,
    name: r.name,
    currency: r.currency,
    icon: r.icon,
    group_type: gt as GroupType,
    simplify_debts: (r.simplify_debts ?? 1) === 1,
    created_at: r.created_at,
  };
}

export type MemberRow = { id: string; name: string };

export type ExpenseRow = {
  id: string;
  description: string;
  amount_minor: number;
  expense_date: string;
  created_at: string;
  payer_id: string;
  payer_name: string;
  category: string | null;
  notes: string | null;
};

/** Expense row plus current user’s split share (minor units), if they participate. */
export type ExpenseRowWithMyShare = ExpenseRow & {
  my_owed_minor: number | null;
};

export async function listGroups(db: TallyDb): Promise<GroupRow[]> {
  const rows = await db.getAllAsync<GroupRowDb>(
    `SELECT id, name, currency, icon, group_type, simplify_debts, created_at FROM groups ORDER BY created_at DESC`,
  );
  return rows.map(parseGroupRow);
}

export async function createGroup(
  db: TallyDb,
  input: {
    name: string;
    currency: string;
    icon: string | null;
    groupType: GroupType;
    simplifyDebts: boolean;
    members: {
      linkedUserId?: string | null;
      name: string;
      email?: string | null;
    }[];
  },
): Promise<string> {
  const id = newId();
  const now = new Date().toISOString();
  const currency = input.currency.trim().toUpperCase() || "USD";
  const gt = GROUP_TYPES.has(input.groupType) ? input.groupType : "other";

  await db.withTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO groups (id, name, currency, icon, group_type, simplify_debts, created_at, last_modified) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name.trim(),
      currency,
      input.icon,
      gt,
      input.simplifyDebts ? 1 : 0,
      now,
      now,
    );
    const gm0 = newId();
    await tx.runAsync(
      `INSERT INTO group_members (id, group_id, user_id, joined_at, last_modified) VALUES (?, ?, ?, ?, ?)`,
      gm0,
      id,
      LOCAL_USER_ID,
      now,
      now,
    );

    const added = new Set<string>([LOCAL_USER_ID]);

    for (const m of input.members) {
      const name = m.name.trim();
      if (!name) continue;

      let userId: string | null = null;
      if (m.linkedUserId) {
        const row = await tx.getFirstAsync<{ id: string }>(
          `SELECT id FROM users WHERE id = ?`,
          m.linkedUserId,
        );
        if (row) userId = row.id;
      }

      if (userId) {
        if (added.has(userId)) continue;
        const exGm = await tx.getFirstAsync<{ id: string }>(
          `SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`,
          id,
          userId,
        );
        if (exGm) {
          continue;
        }
        const gm1 = newId();
        await tx.runAsync(
          `INSERT INTO group_members (id, group_id, user_id, joined_at, last_modified) VALUES (?, ?, ?, ?, ?)`,
          gm1,
          id,
          userId,
          now,
          now,
        );
        added.add(userId);
        const em = m.email?.trim();
        if (em) {
          await tx.runAsync(
            `UPDATE users SET email = ?, last_modified = ? WHERE id = ? AND (email IS NULL OR email = '')`,
            em,
            now,
            userId,
          );
        }
        continue;
      }

      const uid = newId();
      const em = m.email?.trim() || null;
      await tx.runAsync(
        `INSERT INTO users (id, name, email, last_modified) VALUES (?, ?, ?, ?)`,
        uid,
        name,
        em,
        now,
      );
      const gmx = newId();
      await tx.runAsync(
        `INSERT INTO group_members (id, group_id, user_id, joined_at, last_modified) VALUES (?, ?, ?, ?, ?)`,
        gmx,
        id,
        uid,
        now,
        now,
      );
      added.add(uid);
    }
  });

  return id;
}

export async function getGroup(
  db: TallyDb,
  groupId: string,
): Promise<GroupRow | null> {
  const row = await db.getFirstAsync<GroupRowDb>(
    `SELECT id, name, currency, icon, group_type, simplify_debts, created_at FROM groups WHERE id = ?`,
    groupId,
  );
  return row ? parseGroupRow(row) : null;
}

export async function updateGroup(
  db: TallyDb,
  groupId: string,
  input: {
    name: string;
    currency: string;
    icon: string | null;
    groupType: GroupType;
    simplifyDebts: boolean;
  },
): Promise<void> {
  const currency = input.currency.trim().toUpperCase() || "USD";
  const gt = GROUP_TYPES.has(input.groupType) ? input.groupType : "other";
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM groups WHERE id = ?`,
    groupId,
  );
  if (!row) throw new Error("Group not found");
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE groups SET name = ?, currency = ?, icon = ?, group_type = ?, simplify_debts = ?, last_modified = ? WHERE id = ?`,
    input.name.trim(),
    currency,
    input.icon,
    gt,
    input.simplifyDebts ? 1 : 0,
    now,
    groupId,
  );
}

/** Removes the group and cascades to members, expenses, splits, and settlements. */
export async function deleteGroup(db: TallyDb, groupId: string): Promise<void> {
  await db.runAsync(`DELETE FROM groups WHERE id = ?`, groupId);
}

export async function listMembers(
  db: TallyDb,
  groupId: string,
): Promise<MemberRow[]> {
  return db.getAllAsync<MemberRow>(
    `SELECT u.id AS id, u.name AS name
     FROM group_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.group_id = ?
     ORDER BY u.name`,
    groupId,
  );
}

export async function addPersonToGroup(
  db: TallyDb,
  groupId: string,
  name: string,
): Promise<void> {
  const uid = newId();
  const now = new Date().toISOString();
  const gm = newId();
  await db.withTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO users (id, name, email, last_modified) VALUES (?, ?, NULL, ?)`,
      uid,
      name.trim(),
      now,
    );
    await tx.runAsync(
      `INSERT INTO group_members (id, group_id, user_id, joined_at, last_modified) VALUES (?, ?, ?, ?, ?)`,
      gm,
      groupId,
      uid,
      now,
      now,
    );
  });
}

/** Users you’ve shared an expense split with, excluding you and anyone already in this group. */
export async function searchSplitContactsNotInGroup(
  db: TallyDb,
  groupId: string,
  localUserId: string,
  nameQuery: string,
): Promise<MemberRow[]> {
  const q = nameQuery.trim();
  const base = `SELECT DISTINCT u.id AS id, u.name AS name
     FROM splits s_me
     JOIN splits s_other ON s_me.expense_id = s_other.expense_id AND s_other.user_id != ?
     JOIN users u ON u.id = s_other.user_id
     WHERE s_me.user_id = ?
       AND u.id NOT IN (SELECT user_id FROM group_members WHERE group_id = ?)
       AND u.id != ?`;
  if (q === "") {
    return db.getAllAsync<MemberRow>(
      `${base} ORDER BY u.name COLLATE NOCASE LIMIT 100`,
      localUserId,
      localUserId,
      groupId,
      localUserId,
    );
  }
  return db.getAllAsync<MemberRow>(
    `${base} AND INSTR(LOWER(u.name), LOWER(?)) > 0 ORDER BY u.name COLLATE NOCASE LIMIT 100`,
    localUserId,
    localUserId,
    groupId,
    localUserId,
    q,
  );
}

export async function addExistingUserToGroup(
  db: TallyDb,
  groupId: string,
  userId: string,
): Promise<void> {
  const now = new Date().toISOString();
  const ex = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM group_members WHERE group_id = ? AND user_id = ?`,
    groupId,
    userId,
  );
  if (ex) return;
  const id = newId();
  await db.runAsync(
    `INSERT INTO group_members (id, group_id, user_id, joined_at, last_modified) VALUES (?, ?, ?, ?, ?)`,
    id,
    groupId,
    userId,
    now,
    now,
  );
}

/**
 * Removes a user from the group. Blocked if they are the last member, or appear in
 * expenses, splits, or settlements for this group (edit/delete those first).
 */
export async function removeMemberFromGroup(
  db: TallyDb,
  groupId: string,
  userId: string,
): Promise<void> {
  const memberCount = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM group_members WHERE group_id = ?`,
    groupId,
  );
  if ((memberCount?.n ?? 0) <= 1) {
    throw new Error("Cannot remove the last person from the group.");
  }

  const asPayer = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM expenses WHERE group_id = ? AND payer_id = ?`,
    groupId,
    userId,
  );
  if ((asPayer?.n ?? 0) > 0) {
    throw new Error(
      "This person paid for an expense. Delete or edit those expenses first.",
    );
  }

  const inSplits = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM splits s
     JOIN expenses e ON e.id = s.expense_id
     WHERE e.group_id = ? AND s.user_id = ?`,
    groupId,
    userId,
  );
  if ((inSplits?.n ?? 0) > 0) {
    throw new Error(
      "This person is in an expense split. Delete or edit those expenses first.",
    );
  }

  const inSettlement = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM settlements
     WHERE group_id = ? AND (from_user_id = ? OR to_user_id = ?)`,
    groupId,
    userId,
    userId,
  );
  if ((inSettlement?.n ?? 0) > 0) {
    throw new Error(
      "This person appears in a settlement. Resolve or remove it first.",
    );
  }

  await db.runAsync(
    `DELETE FROM group_members WHERE group_id = ? AND user_id = ?`,
    groupId,
    userId,
  );
}

/** Local `users` rows (excluding you) whose name matches — for “link friend” autocomplete. */
export async function searchFriendsByName(
  db: TallyDb,
  query: string,
  limit = 15,
): Promise<MemberRow[]> {
  const q = query.trim();
  if (q.length < 1) return [];
  return db.getAllAsync<MemberRow>(
    `SELECT id, name FROM users
     WHERE id != ? AND LOWER(name) LIKE '%' || LOWER(?) || '%'
     ORDER BY name COLLATE NOCASE LIMIT ?`,
    LOCAL_USER_ID,
    q,
    limit,
  );
}

/** Saved people on this device (other than you). Same `users` rows used in groups and splits. */
export type FriendContactRow = {
  id: string;
  name: string;
  email: string | null;
};

export async function listFriendContacts(
  db: TallyDb,
): Promise<FriendContactRow[]> {
  return db.getAllAsync<FriendContactRow>(
    `SELECT id, name, email FROM users WHERE id != ? ORDER BY name COLLATE NOCASE`,
    LOCAL_USER_ID,
  );
}

export async function createFriendContact(
  db: TallyDb,
  input: { name: string; email?: string | null },
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const id = newId();
  const em = input.email?.trim() ? input.email.trim() : null;
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO users (id, name, email, last_modified) VALUES (?, ?, ?, ?)`,
    id,
    name,
    em,
    now,
  );
  return id;
}

export async function updateFriendContact(
  db: TallyDb,
  userId: string,
  input: { name: string; email: string | null },
): Promise<void> {
  if (userId === LOCAL_USER_ID) {
    throw new Error("Cannot edit the local profile here.");
  }
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");
  const em = input.email?.trim() ? input.email.trim() : null;
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM users WHERE id = ?`,
    userId,
  );
  if (!row) throw new Error("Friend not found");
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE users SET name = ?, email = ?, last_modified = ? WHERE id = ?`,
    name,
    em,
    now,
    userId,
  );
}

/**
 * Removes a `users` row only when it is unused. People still in groups or on expenses
 * cannot be deleted (same constraints as removing someone from a group, but global).
 */
export async function deleteFriendContact(
  db: TallyDb,
  userId: string,
): Promise<void> {
  if (userId === LOCAL_USER_ID) throw new Error("Cannot delete yourself.");
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM users WHERE id = ?`,
    userId,
  );
  if (!row) throw new Error("Friend not found");

  const gm = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?`,
    userId,
  );
  if ((gm?.n ?? 0) > 0) {
    throw new Error(
      "This person is in one or more groups. Remove them from groups first.",
    );
  }

  const pay = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM expenses WHERE payer_id = ?`,
    userId,
  );
  if ((pay?.n ?? 0) > 0) {
    throw new Error(
      "This person paid for an expense. Delete or edit those expenses first.",
    );
  }

  const sp = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM splits WHERE user_id = ?`,
    userId,
  );
  if ((sp?.n ?? 0) > 0) {
    throw new Error(
      "This person appears in a split. Delete or edit those expenses first.",
    );
  }

  const st = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM settlements WHERE from_user_id = ? OR to_user_id = ?`,
    userId,
    userId,
  );
  if ((st?.n ?? 0) > 0) {
    throw new Error(
      "This person appears in a settlement. Resolve or remove it first.",
    );
  }

  await db.runAsync(`DELETE FROM users WHERE id = ?`, userId);
}

export async function addExpenseWithSplits(
  db: TallyDb,
  groupId: string,
  input: {
    description: string;
    amountMinor: number;
    payerId: string;
    expenseDate: string;
    owedByUserId: Map<string, number>;
    category?: string | null;
  },
): Promise<void> {
  const members = await listMembers(db, groupId);
  const memberSet = new Set(members.map((m) => m.id));
  let sum = 0;
  for (const [uid, owed] of input.owedByUserId) {
    if (!memberSet.has(uid)) throw new Error("Split includes a non-member");
    if (!Number.isInteger(owed) || owed < 0) {
      throw new Error("Each owed amount must be a non-negative integer");
    }
    sum += owed;
  }
  if (sum !== input.amountMinor) {
    throw new Error("Split total does not match expense amount");
  }
  if (input.owedByUserId.size === 0) {
    throw new Error("At least one participant is required");
  }

  const expenseId = newId();
  const now = new Date().toISOString();
  const cat = input.category?.trim() || null;

  await db.withTransactionAsync(async (tx) => {
    await tx.runAsync(
      `INSERT INTO expenses (id, group_id, payer_id, amount_minor, description, expense_date, created_at, category, notes, last_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      expenseId,
      groupId,
      input.payerId,
      input.amountMinor,
      input.description.trim(),
      input.expenseDate,
      now,
      cat,
      now,
    );
    for (const [userId, owedMinor] of input.owedByUserId) {
      const splitId = newId();
      await tx.runAsync(
        `INSERT INTO splits (id, expense_id, user_id, owed_minor, last_modified) VALUES (?, ?, ?, ?, ?)`,
        splitId,
        expenseId,
        userId,
        owedMinor,
        now,
      );
    }
  });
}

export async function getExpenseWithSplits(
  db: TallyDb,
  groupId: string,
  expenseId: string,
): Promise<{
  expense: ExpenseRow;
  splits: { user_id: string; owed_minor: number }[];
} | null> {
  const expense = await db.getFirstAsync<ExpenseRow>(
    `SELECT e.id, e.description, e.amount_minor, e.expense_date, e.created_at, e.payer_id, u.name AS payer_name,
            e.category AS category, e.notes AS notes
     FROM expenses e
     JOIN users u ON u.id = e.payer_id
     WHERE e.id = ? AND e.group_id = ?`,
    expenseId,
    groupId,
  );
  if (!expense) return null;
  const splits = await db.getAllAsync<{ user_id: string; owed_minor: number }>(
    `SELECT user_id, owed_minor FROM splits WHERE expense_id = ? ORDER BY user_id`,
    expenseId,
  );
  return { expense, splits };
}

/** Updates expense fields and replaces splits. Preserves created_at and notes. */
export async function updateExpenseWithSplits(
  db: TallyDb,
  groupId: string,
  expenseId: string,
  input: {
    description: string;
    amountMinor: number;
    payerId: string;
    expenseDate: string;
    owedByUserId: Map<string, number>;
    category?: string | null;
  },
): Promise<void> {
  const existing = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM expenses WHERE id = ? AND group_id = ?`,
    expenseId,
    groupId,
  );
  if (!existing) throw new Error("Expense not found");

  const members = await listMembers(db, groupId);
  const memberSet = new Set(members.map((m) => m.id));
  let sum = 0;
  for (const [uid, owed] of input.owedByUserId) {
    if (!memberSet.has(uid)) throw new Error("Split includes a non-member");
    if (!Number.isInteger(owed) || owed < 0) {
      throw new Error("Each owed amount must be a non-negative integer");
    }
    sum += owed;
  }
  if (sum !== input.amountMinor) {
    throw new Error("Split total does not match expense amount");
  }
  if (input.owedByUserId.size === 0) {
    throw new Error("At least one participant is required");
  }

  const cat = input.category?.trim() || null;
  const now = new Date().toISOString();

  await db.withTransactionAsync(async (tx) => {
    await tx.runAsync(
      `UPDATE expenses
       SET payer_id = ?, amount_minor = ?, description = ?, expense_date = ?, category = ?, last_modified = ?
       WHERE id = ? AND group_id = ?`,
      input.payerId,
      input.amountMinor,
      input.description.trim(),
      input.expenseDate,
      cat,
      now,
      expenseId,
      groupId,
    );
    await tx.runAsync(`DELETE FROM splits WHERE expense_id = ?`, expenseId);
    for (const [userId, owedMinor] of input.owedByUserId) {
      const splitId = newId();
      await tx.runAsync(
        `INSERT INTO splits (id, expense_id, user_id, owed_minor, last_modified) VALUES (?, ?, ?, ?, ?)`,
        splitId,
        expenseId,
        userId,
        owedMinor,
        now,
      );
    }
  });
}

export async function addExpenseEqualSplit(
  db: TallyDb,
  groupId: string,
  input: {
    description: string;
    amountMinor: number;
    payerId: string;
    expenseDate: string;
    category?: string | null;
  },
): Promise<void> {
  const members = await listMembers(db, groupId);
  if (members.length === 0) throw new Error("Group has no members");
  const userIds = members.map((m) => m.id);
  const owed = splitEqualMinor(input.amountMinor, userIds);
  await addExpenseWithSplits(db, groupId, {
    ...input,
    owedByUserId: owed,
  });
}

export async function listExpenses(
  db: TallyDb,
  groupId: string,
): Promise<ExpenseRow[]> {
  return db.getAllAsync<ExpenseRow>(
    `SELECT e.id, e.description, e.amount_minor, e.expense_date, e.created_at, e.payer_id, u.name AS payer_name,
            e.category AS category, e.notes AS notes
     FROM expenses e
     JOIN users u ON u.id = e.payer_id
     WHERE e.group_id = ?
     ORDER BY e.expense_date DESC, e.created_at DESC`,
    groupId,
  );
}

/** For `useTallyQuery` / `PowerSync.watch` — same query as `listExpensesWithMyShare`. */
export const SQL_LIST_EXPENSES_WITH_MY_SHARE = `SELECT e.id, e.description, e.amount_minor, e.expense_date, e.created_at, e.payer_id, u.name AS payer_name,
            e.category AS category, e.notes AS notes,
            (SELECT s.owed_minor FROM splits s
              WHERE s.expense_id = e.id AND s.user_id = ?) AS my_owed_minor
     FROM expenses e
     JOIN users u ON u.id = e.payer_id
     WHERE e.group_id = ?
     ORDER BY e.expense_date DESC, e.created_at DESC`;

export async function listExpensesWithMyShare(
  db: TallyDb,
  groupId: string,
  userId: string,
): Promise<ExpenseRowWithMyShare[]> {
  return db.getAllAsync<ExpenseRowWithMyShare>(
    SQL_LIST_EXPENSES_WITH_MY_SHARE,
    userId,
    groupId,
  );
}

/** Pairwise net with each friend (only when you or they paid), per currency. Positive = they owe you. */
export type FriendBalanceRow = {
  friendId: string;
  name: string;
  currency: string;
  netMinor: number;
};

export async function listFriendBalances(
  db: TallyDb,
  localUserId: string,
): Promise<FriendBalanceRow[]> {
  const expenseRows = await db.getAllAsync<{
    id: string;
    payer_id: string;
    currency: string;
  }>(
    `SELECT e.id, e.payer_id, g.currency AS currency
     FROM expenses e
     JOIN groups g ON g.id = e.group_id`,
  );

  const net = new Map<string, number>();

  for (const e of expenseRows) {
    const splits = await db.getAllAsync<{ user_id: string; owed_minor: number }>(
      `SELECT user_id, owed_minor FROM splits WHERE expense_id = ?`,
      e.id,
    );
    const splitMap = new Map(splits.map((s) => [s.user_id, s.owed_minor]));
    if (!splitMap.has(localUserId)) continue;
    const lOwed = splitMap.get(localUserId)!;
    for (const s of splits) {
      if (s.user_id === localUserId) continue;
      const f = s.user_id;
      const fOwed = splitMap.get(f)!;
      const key = `${f}\u0000${e.currency}`;
      if (e.payer_id === localUserId) {
        net.set(key, (net.get(key) ?? 0) + fOwed);
      } else if (e.payer_id === f) {
        net.set(key, (net.get(key) ?? 0) - lOwed);
      }
    }
  }

  const out: FriendBalanceRow[] = [];
  for (const [key, netMinor] of net) {
    if (netMinor === 0) continue;
    const [friendId, currency] = key.split("\u0000");
    const nameRow = await db.getFirstAsync<{ name: string }>(
      `SELECT name FROM users WHERE id = ?`,
      friendId,
    );
    out.push({
      friendId,
      name: nameRow?.name ?? friendId.slice(0, 8),
      currency,
      netMinor,
    });
  }
  out.sort((a, b) => Math.abs(b.netMinor) - Math.abs(a.netMinor));
  return out;
}

/** Month window for `expense_date` (ISO date, optionally with time) — same month as `anchorDate`. */
export async function getGroupMonthSpendByCategory(
  db: TallyDb,
  groupId: string,
  anchorDate: string,
): Promise<{ category: string | null; totalMinor: number }[]> {
  const month = anchorDate.slice(0, 7);
  const y = Number.parseInt(month.slice(0, 4), 10);
  const mo = Number.parseInt(month.slice(5, 7), 10);
  const nextMonthStart =
    mo === 12
      ? `${y + 1}-01-01`
      : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  return db.getAllAsync<{ category: string | null; totalMinor: number }>(
    `SELECT e.category AS category, SUM(e.amount_minor) AS totalMinor
     FROM expenses e
     WHERE e.group_id = ? AND e.expense_date >= ? AND e.expense_date < ?
     GROUP BY e.category
     ORDER BY totalMinor DESC`,
    groupId,
    `${month}-01`,
    nextMonthStart,
  );
}

export async function updateExpenseNotes(
  db: TallyDb,
  groupId: string,
  expenseId: string,
  notes: string | null,
): Promise<void> {
  const n = notes?.trim() || null;
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE expenses SET notes = ?, last_modified = ? WHERE id = ? AND group_id = ?`,
    n,
    now,
    expenseId,
    groupId,
  );
}

/** Aggregated “you are owed” / “you owe” across all groups (local user). */
export async function getOverallBalanceForUser(
  db: TallyDb,
  userId: string,
): Promise<{ owedMinor: number; owesMinor: number }> {
  const groups = await listGroups(db);
  let owedMinor = 0;
  let owesMinor = 0;
  for (const g of groups) {
    const b = await getGroupBalances(db, g.id);
    const raw = b.get(userId) ?? 0;
    if (raw > 0) owedMinor += raw;
    else if (raw < 0) owesMinor += -raw;
  }
  return { owedMinor, owesMinor };
}

export async function getMyBalanceInGroup(
  db: TallyDb,
  groupId: string,
  userId: string,
): Promise<number> {
  const b = await getGroupBalances(db, groupId);
  return b.get(userId) ?? 0;
}

/** Merged, newest-first event stream for the Activity screen (all groups, local data). */
export type ActivityFeedItem =
  | {
      kind: "group";
      at: string;
      id: string;
      groupId: string;
      groupName: string;
      currency: string;
    }
  | {
      kind: "expense";
      at: string;
      id: string;
      groupId: string;
      groupName: string;
      currency: string;
      description: string;
      amountMinor: number;
      payerName: string;
    }
  | {
      kind: "settlement";
      at: string;
      id: string;
      groupId: string;
      groupName: string;
      currency: string;
      amountMinor: number;
      fromName: string;
      toName: string;
    };

const ACTIVITY_FEED_MAX = 200;

export async function listActivityFeed(
  db: TallyDb,
): Promise<ActivityFeedItem[]> {
  const [groupRows, expenseRows, settlementRows] = await Promise.all([
    db.getAllAsync<{
      id: string;
      name: string;
      currency: string;
      created_at: string;
    }>(`SELECT id, name, currency, created_at FROM groups`),
    db.getAllAsync<{
      id: string;
      group_id: string;
      description: string;
      amount_minor: number;
      created_at: string;
      group_name: string;
      currency: string;
      payer_name: string;
    }>(
      `SELECT e.id, e.group_id, e.description, e.amount_minor, e.created_at,
              g.name AS group_name, g.currency, u.name AS payer_name
       FROM expenses e
       JOIN groups g ON g.id = e.group_id
       JOIN users u ON u.id = e.payer_id`,
    ),
    db.getAllAsync<{
      id: string;
      group_id: string;
      amount_minor: number;
      settled_at: string;
      group_name: string;
      currency: string;
      from_name: string;
      to_name: string;
    }>(
      `SELECT s.id, s.group_id, s.amount_minor, s.settled_at, g.name AS group_name, g.currency,
              uf.name AS from_name, ut.name AS to_name
       FROM settlements s
       JOIN groups g ON g.id = s.group_id
       JOIN users uf ON uf.id = s.from_user_id
       JOIN users ut ON ut.id = s.to_user_id`,
    ),
  ]);

  const out: ActivityFeedItem[] = [];
  for (const g of groupRows) {
    out.push({
      kind: "group",
      at: g.created_at,
      id: `g:${g.id}`,
      groupId: g.id,
      groupName: g.name,
      currency: g.currency,
    });
  }
  for (const e of expenseRows) {
    out.push({
      kind: "expense",
      at: e.created_at,
      id: `e:${e.id}`,
      groupId: e.group_id,
      groupName: e.group_name,
      currency: e.currency,
      description: e.description,
      amountMinor: e.amount_minor,
      payerName: e.payer_name,
    });
  }
  for (const s of settlementRows) {
    out.push({
      kind: "settlement",
      at: s.settled_at,
      id: `s:${s.id}`,
      groupId: s.group_id,
      groupName: s.group_name,
      currency: s.currency,
      amountMinor: s.amount_minor,
      fromName: s.from_name,
      toName: s.to_name,
    });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out.slice(0, ACTIVITY_FEED_MAX);
}

/** Deletes the expense and its splits (FK cascade). Scoped to groupId for safety. */
export async function deleteExpense(
  db: TallyDb,
  groupId: string,
  expenseId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM expenses WHERE id = ? AND group_id = ?`, expenseId, groupId);
}

async function loadLedger(
  db: TallyDb,
  groupId: string,
): Promise<{ expenses: ExpenseLedgerLine[]; settlements: SettlementLine[] }> {
  const expenseRows = await db.getAllAsync<{
    id: string;
    payer_id: string;
    amount_minor: number;
  }>(
    `SELECT id, payer_id, amount_minor FROM expenses WHERE group_id = ?`,
    groupId,
  );

  const expenses: ExpenseLedgerLine[] = [];
  for (const e of expenseRows) {
    const splitRows = await db.getAllAsync<{ user_id: string; owed_minor: number }>(
      `SELECT user_id, owed_minor FROM splits WHERE expense_id = ?`,
      e.id,
    );
    expenses.push({
      payerId: e.payer_id,
      amountMinor: e.amount_minor,
      splits: splitRows.map((s) => ({
        userId: s.user_id,
        owedMinor: s.owed_minor,
      })),
    });
  }

  const settlementRows = await db.getAllAsync<{
    from_user_id: string;
    to_user_id: string;
    amount_minor: number;
  }>(
    `SELECT from_user_id, to_user_id, amount_minor FROM settlements WHERE group_id = ?`,
    groupId,
  );

  const settlements: SettlementLine[] = settlementRows.map((r) => ({
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    amountMinor: r.amount_minor,
  }));

  return { expenses, settlements };
}

export async function getGroupBalances(
  db: TallyDb,
  groupId: string,
): Promise<BalanceMap> {
  const { expenses, settlements } = await loadLedger(db, groupId);
  return computeBalances(expenses, settlements);
}

export const SETTINGS_KEYS = {
  appearance: "appearance",
  defaultCurrency: "default_currency",
  locale: "locale",
  /** One-time native I18nManager + reload applied so Farsi is RTL. */
  rtlNativeBootstrap: "rtl_native_bootstrap",
  /**
   * `"1"` = user requested cloud / multi-device sync. Missing or other = off (this device, local only).
   */
  cloudSyncUserEnabled: "cloud_sync_user_enabled",
} as const;

export async function getSetting(
  db: TallyDb,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_settings WHERE setting_key = ?`,
    key,
  );
  return row?.value ?? null;
}

export async function setSetting(
  db: TallyDb,
  key: string,
  value: string,
): Promise<void> {
  const row = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM app_settings WHERE setting_key = ?`,
    key,
  );
  if (row) {
    await db.runAsync(
      `UPDATE app_settings SET value = ? WHERE id = ?`,
      value,
      row.id,
    );
  } else {
    const id = newId();
    await db.runAsync(
      `INSERT INTO app_settings (id, setting_key, value) VALUES (?, ?, ?)`,
      id,
      key,
      value,
    );
  }
}

export type LocalUserProfile = { name: string; email: string | null };

export async function getLocalUserProfile(
  db: TallyDb,
): Promise<LocalUserProfile> {
  const row = await db.getFirstAsync<{ name: string; email: string | null }>(
    `SELECT name, email FROM users WHERE id = ?`,
    LOCAL_USER_ID,
  );
  return row ?? { name: "You", email: null };
}

export async function updateLocalUserProfile(
  db: TallyDb,
  patch: { name?: string; email?: string | null },
): Promise<void> {
  const cur = await getLocalUserProfile(db);
  const name = patch.name !== undefined ? patch.name.trim() || "You" : cur.name;
  const email =
    patch.email !== undefined
      ? patch.email?.trim()
        ? patch.email.trim()
        : null
      : cur.email;
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE users SET name = ?, email = ?, last_modified = ? WHERE id = ?`,
    name,
    email,
    now,
    LOCAL_USER_ID,
  );
}

export { LOCAL_USER_ID };
