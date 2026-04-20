import type { TallyDb } from "../db/tallyDb";
import { formatMinor } from "../data/currencies";
import {
  getGroup,
  listExpenses,
  type ExpenseRow,
  type GroupRow,
} from "../data/tallyRepo";
import { lightColors } from "../theme/tokens";

export const GROUP_EXPORT_JSON_FORMAT = "tally-group-export" as const;
export const GROUP_EXPORT_VERSION = 1 as const;

/** Shown diagonally on PDF/PNG exports */
export const GROUP_EXPORT_WATERMARK_TEXT = "Tally";

/** Short tagline under the wordmark on PNG/PDF/HTML exports (English; matches product tone). */
export const GROUP_EXPORT_TAGLINE = "Split expenses fairly";

/** Brand styling aligned with `lightColors` — shared by HTML exports and RN snapshot. */
export const GROUP_EXPORT_BRAND = {
  primary: lightColors.primary,
  text: lightColors.text,
  /** Dark surface / splash tone */
  surfaceDeep: "#123635",
  headerTint: lightColors.bg,
  muted: lightColors.muted,
  border: "rgba(29, 69, 68, 0.22)",
} as const;

/** Same hash-tint circles as net balances on `GroupDetailScreen`. */
export function settlementExportAvatarStyle(userId: string): {
  backgroundColor: string;
  borderColor: string;
} {
  const options = [
    { backgroundColor: lightColors.inputSurface, borderColor: lightColors.border },
    { backgroundColor: lightColors.owedSoft, borderColor: lightColors.primary },
    { backgroundColor: lightColors.oweSoft, borderColor: lightColors.owe },
  ] as const;
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = (h + userId.charCodeAt(i)! * (i + 1)) % 1000007;
  }
  return options[Math.abs(h) % options.length]!;
}

export function settlementExportPersonInitial(name: string): string {
  const t = name.trim();
  if (!t) return "•";
  return t.slice(0, 1).toUpperCase();
}

/** Faint “Tally” watermark (same graphic for expense + settlement exports). */
const GROUP_EXPORT_WATERMARK_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 945 1024'%3E%3Ctext x='50%25' y='50%25' text-anchor='middle' dominant-baseline='middle' font-size='100' font-weight='700' fill='%23000000'%3ETally%3C/text%3E%3C/svg%3E";

function groupExportHtmlBaseStyles(): string {
  const { primary, text, headerTint, muted, border } = GROUP_EXPORT_BRAND;
  return `
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: ${text}; background: #fff; }
    .report-root { position: relative; background: #fff; min-height: 200px; }
    .accent-strip { height: 4px; width: 100%; background: linear-gradient(90deg, ${primary} 0%, #34D399 100%); position: relative; z-index: 2; }
    .wm { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; overflow: hidden; }
    .wm img { width: 300px; height: 300px; opacity: 0.08; transform: rotate(-28deg); user-select: none; }
    .report-inner { position: relative; z-index: 1; padding: 16px; }
    .brand-head { display: flex; align-items: center; gap: 12px; margin: 0 0 16px; padding-bottom: 14px; border-bottom: 1px solid ${border}; }
    .brand-mark {
      width: 40px; height: 40px; border-radius: 10px;
      background: linear-gradient(145deg, ${GROUP_EXPORT_BRAND.surfaceDeep} 0%, #061E1E 100%);
      color: ${primary}; font-size: 20px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      font-family: ui-sans-serif, system-ui, sans-serif;
      flex-shrink: 0;
      box-shadow: 0 2px 10px rgba(16, 185, 129, 0.22);
    }
    .brand-head--image { align-items: flex-start; }
    .brand-logo-img { max-height: 88px; width: auto; max-width: min(320px, 100%); height: auto; display: block; object-fit: contain; }
    .brand-name { font-size: 17px; font-weight: 700; color: ${text}; letter-spacing: -0.02em; }
    .brand-tag { font-size: 11px; color: ${muted}; margin-top: 2px; }
    h1 { font-size: 18px; margin: 0 0 8px; font-weight: 700; color: ${text}; }
    .meta { color: ${muted}; font-size: 12px; margin: 0 0 16px; }
    h2 { font-size: 15px; font-weight: 700; margin: 0 0 4px; color: ${text}; }
    .sectionSub { color: ${muted}; font-size: 12px; margin: 0 0 10px; line-height: 1.35; }
  `.trim();
}

function groupExportHtmlExpenseTableStyles(): string {
  const { primary, text, headerTint, muted, border } = GROUP_EXPORT_BRAND;
  return `
    table { border-collapse: collapse; width: 100%; font-size: 11px; border-radius: 8px; overflow: hidden; box-shadow: 0 0 0 1px ${border}; }
    th, td { border: 1px solid ${border}; padding: 6px 8px; vertical-align: top; }
    th { background: ${headerTint}; text-align: left; color: ${text}; font-weight: 600; border-bottom: 2px solid ${primary}; }
    td.amount { text-align: right; white-space: nowrap; }
  `.trim();
}

function groupExportHtmlSharedStyles(): string {
  return `${groupExportHtmlBaseStyles()}
${groupExportHtmlExpenseTableStyles()}`;
}

/** Settlement share receipt: app-like cards, no From/To, balance-style avatars. */
function groupExportHtmlSettlementReceiptStyles(): string {
  const { text, headerTint, muted, border, surfaceDeep, primary } = GROUP_EXPORT_BRAND;
  return `
    .settle-receipt-inner { padding-top: 0; }
    .settle-receipt-head {
      background: ${surfaceDeep};
      margin: 0 -16px 16px -16px;
      padding: 22px 16px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .settle-receipt-head img { max-height: 56px; width: auto; max-width: min(280px, 100%); object-fit: contain; display: block; }
    .settle-receipt-fallback {
      width: 48px; height: 48px; border-radius: 24px;
      background: linear-gradient(145deg, ${surfaceDeep} 0%, #061E1E 100%);
      color: ${primary}; font-size: 22px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(52, 211, 153, 0.35);
    }
    .settle-list { display: flex; flex-direction: column; gap: 10px; }
    .settle-card {
      border-radius: 14px;
      border: 1px solid ${border};
      background: ${headerTint};
      padding: 12px 14px;
      box-sizing: border-box;
    }
    .settle-row { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .settle-parties { display: flex; flex: 1; min-width: 180px; align-items: flex-start; gap: 2px; }
    .settle-person { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; }
    .settle-identity {
      display: flex; flex-direction: column; align-items: center; width: 100%;
      gap: 4px; box-sizing: border-box; padding: 0 1px;
    }
    .settle-av {
      width: 40px; height: 40px; border-radius: 20px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0; align-self: center;
      font-size: 16px; font-weight: 800; color: ${text};
      border: 1px solid;
      box-sizing: border-box; margin: 0;
    }
    .settle-under-name {
      font-size: 12px; font-weight: 600; color: ${muted};
      text-align: center; line-height: 1.3; word-break: break-word; width: 100%; max-width: 100%;
      box-sizing: border-box; margin: 0; padding: 0 1px; align-self: stretch;
    }
    .settle-arr-slot { flex-shrink: 0; width: 22px; min-width: 22px; height: 40px; display: flex; align-items: center; justify-content: center; padding: 0; align-self: flex-start; }
    .settle-arr { color: ${muted}; font-size: 18px; line-height: 1; }
    .settle-amt-block { text-align: right; flex-shrink: 0; min-width: 96px; }
    .settle-amt { font-size: 18px; font-weight: 800; color: ${text}; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .settle-empty { color: ${muted}; font-size: 13px; margin: 4px 0 0; }
  `.trim();
}

export type GroupExportHtmlOptions = {
  /** `data:image/png;base64,...` for the Tally slogan artwork when available. */
  brandImageDataUri?: string | null;
  /**
   * Web: absolute same-origin packager URL for Tally-Slogan.png. Used when inlining a data URL
   * fails (e.g. fetch taint) but the browser can still display the file in <img> for html2canvas.
   */
  brandImageUrl?: string | null;
};

function groupExportHtmlBrandBlock(options?: GroupExportHtmlOptions | null): string {
  const dataUri = options?.brandImageDataUri?.trim() ?? "";
  const pageUrl = options?.brandImageUrl?.trim() ?? "";
  const src = dataUri || pageUrl;
  if (src) {
    return `
    <header class="brand-head brand-head--image">
      <img class="brand-logo-img" src="${escapeHtml(src)}" alt="Tally" />
    </header>`;
  }
  const tag = escapeHtml(GROUP_EXPORT_TAGLINE);
  return `
    <header class="brand-head">
      <div class="brand-mark" aria-hidden="true">T</div>
      <div class="brand-text">
        <div class="brand-name">Tally</div>
        <div class="brand-tag">${tag}</div>
      </div>
    </header>`;
}

function groupExportHtmlWatermark(): string {
  return `<div class="wm" aria-hidden="true"><img src="${GROUP_EXPORT_WATERMARK_DATA_URI}" alt="" /></div>`;
}

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

/** PNG/HTML snapshot for “share suggested settlements” — who pays whom. */
export type SuggestedSettlementExportRow = {
  payer: string;
  payee: string;
  amount: string;
  payerUserId: string;
  payeeUserId: string;
};

export type SuggestedSettlementsReportModel = {
  rows: SuggestedSettlementExportRow[];
};

export type GroupPngSnapshot =
  | { kind: "expenses"; model: GroupReportModel }
  | { kind: "settlements"; model: SuggestedSettlementsReportModel };

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
export function buildGroupExportReportHtml(
  bundle: GroupExportBundle,
  options?: GroupExportHtmlOptions,
): string {
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
${groupExportHtmlSharedStyles()}
  </style>
</head>
<body>
  <div class="report-root">
    <div class="accent-strip"></div>
    ${groupExportHtmlWatermark()}
    <div class="report-inner">
      ${groupExportHtmlBrandBlock(options)}
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

/**
 * HTML for web PNG capture when sharing suggested settlements (who pays whom).
 */
export function buildSuggestedSettlementsExportHtml(
  m: SuggestedSettlementsReportModel,
  options?: GroupExportHtmlOptions,
): string {
  const dataUri = options?.brandImageDataUri?.trim() ?? "";
  const brandUrl = options?.brandImageUrl?.trim() ?? "";
  const brandSrc = dataUri || brandUrl;
  const headBlock = brandSrc
    ? `<header class="settle-receipt-head"><img src="${escapeHtml(brandSrc)}" alt=""/></header>`
    : `<header class="settle-receipt-head"><div class="settle-receipt-fallback" aria-hidden="true">T</div></header>`;
  const rowsHtml =
    m.rows.length === 0
      ? `<p class="settle-empty">—</p>`
      : m.rows
          .map((r) => {
            const avP = settlementExportAvatarStyle(r.payerUserId);
            const avR = settlementExportAvatarStyle(r.payeeUserId);
            const ip = escapeHtml(settlementExportPersonInitial(r.payer));
            const ir = escapeHtml(settlementExportPersonInitial(r.payee));
            return `<div class="settle-card">
  <div class="settle-row">
    <div class="settle-parties">
      <div class="settle-person">
        <div class="settle-identity">
          <div class="settle-av" style="background-color:${avP.backgroundColor};border-color:${avP.borderColor}">${ip}</div>
          <div class="settle-under-name">${escapeHtml(r.payer)}</div>
        </div>
      </div>
      <span class="settle-arr-slot" aria-hidden="true"><span class="settle-arr">→</span></span>
      <div class="settle-person">
        <div class="settle-identity">
          <div class="settle-av" style="background-color:${avR.backgroundColor};border-color:${avR.borderColor}">${ir}</div>
          <div class="settle-under-name">${escapeHtml(r.payee)}</div>
        </div>
      </div>
    </div>
    <div class="settle-amt-block">
      <div class="settle-amt">${escapeHtml(r.amount)}</div>
    </div>
  </div>
</div>`;
          })
          .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Tally</title>
  <style>
${groupExportHtmlBaseStyles()}
${groupExportHtmlSettlementReceiptStyles()}
  </style>
</head>
<body>
  <div class="report-root">
    ${groupExportHtmlWatermark()}
    <div class="report-inner settle-receipt-inner">
      ${headBlock}
      <div class="settle-list">
${rowsHtml}
      </div>
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
