import { useEffect, useState } from "react";
import { useTallyData } from "../db/DatabaseContext";
import { getNotificationsUnreadCount } from "../core/notifications";

/**
 * Live count of derived notifications the user hasn't yet read or
 * archived. Recomputes on every `dataRevision` bump — popover / full
 * screen call `bumpDataRevision` after persisting read or archive state,
 * so the header bell badge updates without prop drilling.
 */
export function useNotificationsUnreadCount(): number {
  const { db, dataRevision } = useTallyData();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const n = await getNotificationsUnreadCount(db);
        if (!cancelled) setCount(n);
      } catch {
        if (!cancelled) setCount(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, dataRevision]);

  return count;
}
