import { useEffect, useState } from "react";
import { useTallyData } from "../db/DatabaseContext";
import { getLocalUserProfile } from "../data/tallyRepo";
import { getLocalUserId } from "../db/ids";

/**
 * Returns the current local user's id and avatar URI.
 * Re-reads whenever `dataRevision` bumps so profile edits propagate.
 */
export function useLocalUserAvatar(): {
  userId: string;
  avatarUri: string | null;
} {
  const { db, dataRevision } = useTallyData();
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const p = await getLocalUserProfile(db);
      if (!cancelled) setAvatarUri(p.avatarUri ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, dataRevision]);

  return { userId: getLocalUserId(), avatarUri };
}
