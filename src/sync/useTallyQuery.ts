import { addDatabaseChangeListener, type DatabaseChangeEvent } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import { useTallyData } from "../db/DatabaseContext";

/**
 * Re-runs a `SELECT` when given tables change (or globally if `tables` omitted), for live list updates.
 */
function tableNamesKey(tables: string[] | undefined): string {
  if (tables == null) return "\u0000:all";
  if (tables.length === 0) return "\u0000:none";
  return [...new Set(tables)].sort().join("\u0000");
}

function watchMatches(ev: DatabaseChangeEvent, tables: string[] | undefined): boolean {
  if (tables == null) return true;
  if (tables.length === 0) return true;
  return tables.includes(ev.tableName);
}

export function useTallyQuery<T = Record<string, unknown>>(
  sql: string,
  parameters: unknown[],
  options?: { tables?: string[] },
): T[] {
  const { db, dataRevision } = useTallyData();
  const [data, setData] = useState<T[]>([]);
  const pKey = useMemo(() => JSON.stringify(parameters), [parameters]);
  const watchTables = options?.tables;
  const tableDep = tableNamesKey(watchTables);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void (async () => {
        const rows = await (parameters.length
          ? db.getAllAsync<T>(sql, ...(parameters as any[]))
          : db.getAllAsync<T>(sql));
        if (!cancelled) setData(rows ?? []);
      })();
    };
    refresh();
    const sub = addDatabaseChangeListener((ev) => {
      if (!watchMatches(ev, watchTables)) return;
      refresh();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [db, sql, pKey, tableDep, dataRevision, watchTables]);

  return data;
}
