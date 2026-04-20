import type { TallyExportPayload } from "./exportTallyData";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Best-effort "portable" CSV export for the whole local dataset.
 * This intentionally focuses on the main user-visible ledger (expenses + splits) rather than
 * trying to represent every table shape in CSV.
 */
export function buildTallyExportCsv(payload: TallyExportPayload): string {
  const groupsById = new Map<string, Record<string, unknown>>();
  for (const g of payload.tables.groups) {
    const id = (g["id"] ?? g["group_id"]) as string | undefined;
    if (id) groupsById.set(id, g);
  }

  const usersById = new Map<string, Record<string, unknown>>();
  for (const u of payload.tables.users) {
    const id = (u["id"] ?? u["user_id"]) as string | undefined;
    if (id) usersById.set(id, u);
  }

  const splitsByExpenseId = new Map<string, Record<string, unknown>[]>();
  for (const s of payload.tables.splits) {
    const eid = String(s["expense_id"] ?? "");
    if (!eid) continue;
    const arr = splitsByExpenseId.get(eid) ?? [];
    arr.push(s);
    splitsByExpenseId.set(eid, arr);
  }

  const header = [
    "Group",
    "Group currency",
    "Date",
    "Description",
    "Category",
    "Paid by",
    "Amount (minor)",
    "Expense id",
    "Split to",
    "Split amounts (minor)",
  ];

  const rows: string[] = [header.map(csvCell).join(",")];
  for (const e of payload.tables.expenses) {
    const groupId = (e["group_id"] as string | undefined) ?? "";
    const group = groupId ? groupsById.get(groupId) : undefined;
    const groupName = (group?.["name"] as string | undefined) ?? "";
    const groupCurrency = (group?.["currency"] as string | undefined) ?? "";

    const expenseId = String(e["id"] ?? "");
    const splits = expenseId ? (splitsByExpenseId.get(expenseId) ?? []) : [];
    const splitTo = splits
      .map((s) => {
        const uid = (s["user_id"] as string | undefined) ?? "";
        const u = uid ? usersById.get(uid) : undefined;
        return (u?.["name"] as string | undefined) ?? uid ?? "";
      })
      .filter(Boolean)
      .join(";");
    const splitAmountsMinor = splits
      .map((s) => String(s["owed_minor"] ?? s["amount_minor"] ?? ""))
      .filter((x) => x.length > 0)
      .join(";");

    rows.push(
      [
        csvCell(groupName),
        csvCell(groupCurrency),
        csvCell(e["expense_date"] ?? e["date"] ?? ""),
        csvCell(e["description"] ?? ""),
        csvCell(e["category"] ?? ""),
        csvCell(e["payer_name"] ?? e["payer_id"] ?? ""),
        csvCell(e["amount_minor"] ?? ""),
        csvCell(expenseId),
        csvCell(splitTo),
        csvCell(splitAmountsMinor),
      ].join(","),
    );
  }

  return `${rows.join("\r\n")}\r\n`;
}

