import type { TallyDb } from "../db/tallyDb";
import { formatMinor } from "../data/currencies";
import {
  getGroup,
  listExpenses,
  type ExpenseRow,
  type GroupRow,
} from "../data/tallyRepo";

export const GROUP_EXPORT_JSON_FORMAT = "tally-group-export" as const;
export const GROUP_EXPORT_VERSION = 1 as const;

/** Shown diagonally on PDF/PNG exports */
export const GROUP_EXPORT_WATERMARK_TEXT = "Tally";

export type GroupExpenseExportLine = {
  expense: ExpenseRow;
  splits: { user_id: string; name: string; owed_minor: number }[];
};

export type GroupExportBundle = {
  group: GroupRow;
  expenses: GroupExpenseExportLine[];
};

export type GroupReportRow = {
  date: string;
  paidBy: string;
  amount: string;
  description: string;
  category: string;
  split: string;
};

export type GroupReportModel = {
  title: string;
  metaLine: string;
  rows: GroupReportRow[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function csvCell(s: string): string {
  const t = s.replace(/"/g, '""');
  if (/[",\n\r]/.test(t)) return `"${t}"`;
  return t;
}

/** Safe ASCII-ish filename segment from group name. */
export function safeGroupExportFileStem(groupName: string): string {
  const t = groupName
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 48);
  return t.length > 0 ? t : "group";
}

export async function loadGroupExportBundle(
  db: TallyDb,
  groupId: string,
): Promise<GroupExportBundle> {
  const group = await getGroup(db, groupId);
  if (!group) throw new Error("Group not found");
  const expenses = await listExpenses(db, groupId);
  const splitRows = await db.getAllAsync<{
    expense_id: string;
    user_id: string;
    owed_minor: number;
    name: string;
  }>(
    `SELECT s.expense_id, s.user_id, s.owed_minor, u.name AS name
     FROM splits s
     INNER JOIN users u ON u.id = s.user_id
     INNER JOIN expenses e ON e.id = s.expense_id
     WHERE e.group_id = ?
     ORDER BY s.expense_id, u.name`,
    groupId,
  );
  const byExpense = new Map<string, GroupExpenseExportLine["splits"]>();
  for (const r of splitRows) {
    const list = byExpense.get(r.expense_id) ?? [];
    list.push({
      user_id: r.user_id,
      name: r.name,
      owed_minor: r.owed_minor,
    });
    byExpense.set(r.expense_id, list);
  }
  const lines: GroupExpenseExportLine[] = expenses.map((e) => ({
    expense: e,
    splits: byExpense.get(e.id) ?? [],
  }));
  return { group, expenses: lines };
}

export function buildGroupReportModel(bundle: GroupExportBundle): GroupReportModel {
  const { group, expenses } = bundle;
  const metaLine = `${group.currency} · ${new Date().toISOString().slice(0, 10)}`;
  const rows: GroupReportRow[] = expenses.map(({ expense: e, splits }) => ({
    date: e.expense_date,
    paidBy: e.payer_name,
    amount: formatMinor(e.amount_minor, group.currency),
    description: e.description,
    category: e.category?.trim() ?? "",
    split:
      splits.length > 0
        ? splits
            .map((s) => `${s.name} (${formatMinor(s.owed_minor, group.currency)})`)
            .join(", ")
        : "—",
  }));
  return { title: group.name, metaLine, rows };
}

/**
 * Full HTML document: same layout for PDF and for web PNG (html2canvas).
 * Includes the Tally logo as a faint diagonal watermark.
 */
export function buildGroupExportReportHtml(bundle: GroupExportBundle): string {
  const m = buildGroupReportModel(bundle);
  const title = escapeHtml(m.title);
  const meta = escapeHtml(m.metaLine);
  const rowsHtml =
    m.rows.length === 0
      ? `<tr><td colspan="6">No expenses</td></tr>`
      : m.rows
          .map(
            (r) => `<tr>
  <td>${escapeHtml(r.date)}</td>
  <td>${escapeHtml(r.paidBy)}</td>
  <td class="amount">${escapeHtml(r.amount)}</td>
  <td>${escapeHtml(r.description)}</td>
  <td>${escapeHtml(r.category)}</td>
  <td>${escapeHtml(r.split)}</td>
</tr>`,
          )
          .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; }
    .report-root { position: relative; background: #fff; padding: 16px; min-height: 200px; }
    .wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; overflow: hidden; }
    .wm img { width: 300px; height: 300px; opacity: 0.08; transform: rotate(-28deg); user-select: none; }
    .report-inner { position: relative; z-index: 1; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    .meta { color: #555; font-size: 12px; margin: 0 0 16px; }
    table { border-collapse: collapse; width: 100%; font-size: 11px; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; vertical-align: top; }
    th { background: #f4f4f5; text-align: left; }
    td.amount { text-align: right; }
  </style>
</head>
<body>
  <div class="report-root">
    <div class="wm" aria-hidden="true"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 945 1024'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='100' font-weight='700' fill='%23000000'%3ETally%3C/text%3E%3C/svg%3E" alt="" /></div>
    <div class="report-inner">
      <h1>${title}</h1>
      <p class="meta">${meta}</p>
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Paid by</th>
            <th>Amount</th>
            <th>Description</th>
            <th>Category</th>
            <th>Split</th>
          </tr>
        </thead>
        <tbody>
${rowsHtml}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>`;
}

/** @deprecated Use {@link buildGroupExportReportHtml} — same function, kept for call sites. */
export const buildGroupExportPdfHtml = buildGroupExportReportHtml;

export async function buildGroupExportJsonPayload(
  db: TallyDb,
  groupId: string,
): Promise<Record<string, unknown>> {
  const groupRow = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM groups WHERE id = ?",
    groupId,
  );
  const users = await db.getAllAsync<Record<string, unknown>>(
    `SELECT DISTINCT u.* FROM users u
     INNER JOIN group_members gm ON gm.user_id = u.id
     WHERE gm.group_id = ?`,
    groupId,
  );
  const group_members = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM group_members WHERE group_id = ?",
    groupId,
  );
  const expenses = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM expenses WHERE group_id = ? ORDER BY expense_date DESC, created_at DESC",
    groupId,
  );
  const expenseIds = expenses.map((e) => String(e.id));
  let splits: Record<string, unknown>[] = [];
  if (expenseIds.length > 0) {
    const placeholders = expenseIds.map(() => "?").join(",");
    splits = await db.getAllAsync<Record<string, unknown>>(
      `SELECT * FROM splits WHERE expense_id IN (${placeholders}) ORDER BY expense_id`,
      ...expenseIds,
    );
  }
  const settlements = await db.getAllAsync<Record<string, unknown>>(
    "SELECT * FROM settlements WHERE group_id = ?",
    groupId,
  );
  return {
    format: GROUP_EXPORT_JSON_FORMAT,
    version: GROUP_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    groupId,
    tables: {
      groups: groupRow,
      users,
      group_members,
      expenses,
      splits,
      settlements,
    },
  };
}

export function stringifyGroupExportJson(payload: Record<string, unknown>): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function buildGroupExportCsv(bundle: GroupExportBundle): string {
  const { group, expenses } = bundle;
  const header = [
    "Who paid",
    "Amount (minor)",
    "Currency",
    "For whom",
    "Split amounts (minor)",
    "Purpose",
    "Category",
    "Date & time",
    "Type",
  ];
  const rows: string[] = [header.map(csvCell).join(",")];
  for (const { expense: e, splits } of expenses) {
    const names = splits.map((s) => s.name).join(";");
    const amounts = splits.map((s) => String(s.owed_minor)).join(";");
    rows.push(
      [
        csvCell(e.payer_name),
        csvCell(String(e.amount_minor)),
        csvCell(group.currency),
        csvCell(names),
        csvCell(amounts),
        csvCell(e.description),
        csvCell(e.category?.trim() ?? ""),
        csvCell(e.expense_date),
        csvCell("expense"),
      ].join(","),
    );
  }
  return rows.join("\r\n");
}
