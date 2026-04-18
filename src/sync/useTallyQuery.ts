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

export function useTallyQuery<T = Record<string, unknown>>(
  sql: string,
  parameters: unknown[],
  options?: { tables?: string[] },
): T[] {
  const { powerSync } = useTallyData();
  const [data, setData] = useState<T[]>([]);
  const ps = powerSync;
  const pKey = useMemo(() => JSON.stringify(parameters), [parameters]);
  const watchTables = options?.tables;
  const tableDep = tableNamesKey(watchTables);

  useEffect(() => {
    if (!ps) return;
    const refresh = () => {
      void (async () => {
        setData((await ps.getAll<T>(sql, parameters as any)) ?? []);
      })();
    };
    refresh();
    return ps.onChange(
      { onChange: () => {
        refresh();
      } },
      { tables: watchTables, triggerImmediate: true },
    );
    // Do not use `options?.tables` in deps — a new `["a","b"]` is created every render
    // when the caller inlines the options object; `tableDep` is a stable string key.
  }, [ps, sql, pKey, tableDep]);

  return data;
}
