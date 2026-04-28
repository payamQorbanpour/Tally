import { useEffect, useState } from "react";
import { useTallyData } from "../db/DatabaseContext";
import { getLocalUserProfile } from "../data/tallyRepo";
import { getLocalUserId } from "../db/ids";
import {
  ensureCachedAvatarLocalPath,
  readCachedAvatarLocalPath,
} from "../core/avatarStorage";

/**
 * Returns the current local user's id and avatar URI.
 *
 * When the stored URI is a remote `https://` URL, this hook resolves it
 * through the on-disk cache so consumers (`<Image>` in tab headers, member
 * rows, etc.) render straight from the local file — no per-render network
 * round-trip. A cache miss falls back to the URL while a background
 * download populates the cache; the next `dataRevision` bump rerenders
 * with the local path.
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
      const raw = p.avatarUri ?? null;
      if (!raw || !/^https?:\/\//i.test(raw)) {
        if (!cancelled) setAvatarUri(raw);
        return;
      }
      const cached = await readCachedAvatarLocalPath(db, raw);
      if (cancelled) return;
      if (cached) {
        setAvatarUri(cached);
        return;
      }
      // No (or stale) cache for this URL — show the URL while we
      // download. Once cached, the next dataRevision bump (or the next
      // mount) will pick up the local path.
      setAvatarUri(raw);
      const local = await ensureCachedAvatarLocalPath(db, raw);
      if (!cancelled && local) setAvatarUri(local);
    })();
    return () => {
      cancelled = true;
    };
  }, [db, dataRevision]);

  return { userId: getLocalUserId(), avatarUri };
}
