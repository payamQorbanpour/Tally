import type { TallyDb } from "../db/tallyDb";

export const TALLY_EXPORT_FORMAT = "tally-export" as const;
export const TALLY_EXPORT_VERSION = 1 as const;

export type TallyExportPayload = {
  format: typeof TALLY_EXPORT_FORMAT;
  version: typeof TALLY_EXPORT_VERSION;
  exportedAt: string;
  tables: {
    users: Record<string, unknown>[];
    groups: Record<string, unknown>[];
    group_members: Record<string, unknown>[];
    expenses: Record<string, unknown>[];
    splits: Record<string, unknown>[];
    settlements: Record<string, unknown>[];
    app_settings: Record<string, unknown>[];
  };
};

/**
 * Serializes all local Tally tables (including device-only `app_settings`) to JSON for backup / export.
 */
export async function buildTallyExportPayload(db: TallyDb): Promise<TallyExportPayload> {
  const [
    users,
    groups,
    group_members,
    expenses,
    splits,
    settlements,
    app_settings,
  ] = await Promise.all([
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM users"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM groups"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM group_members"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM expenses"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM splits"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM settlements"),
    db.getAllAsync<Record<string, unknown>>("SELECT * FROM app_settings"),
  ]);
  return {
    format: TALLY_EXPORT_FORMAT,
    version: TALLY_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    tables: {
      users,
      groups,
      group_members,
      expenses,
      splits,
      settlements,
      app_settings,
    },
  };
}

export function stringifyTallyExport(payload: TallyExportPayload): string {
  return `${JSON.stringify(payload, null, 2)}\n`;
}
