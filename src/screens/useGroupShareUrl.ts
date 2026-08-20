import { useEffect, useMemo, useState } from "react";
import { buildInviteUrl } from "../core/inviteEnv";
import { getOrCreateGroupShareInviteToken } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";

/**
 * The URL behind a group's Share link / QR, `""` until it is ready.
 *
 * The link carries the group's share **token**, which has to be read (or
 * minted) from the database, so it cannot be derived synchronously the way
 * `buildInviteUrl(groupId)` used to be. Callers must handle the empty string:
 * `react-native-qrcode-svg` throws on an empty value, and sharing a
 * half-built link is worse than briefly showing a spinner.
 *
 * @param enabled pass `false` to skip the work — a QR sheet that is closed has
 * no reason to create an invite row for a group nobody is sharing.
 */
export function useGroupShareUrl(groupId: string, enabled = true): string {
  const { db, refreshCloudData } = useTallyData();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !groupId) return;
    let alive = true;
    void (async () => {
      const share = await getOrCreateGroupShareInviteToken(db, groupId);
      if (!alive) return;
      setToken(share.token);
      // A token that has not reached the server yet cannot be redeemed, and
      // the user is about to send someone the link. Best-effort: sync carries
      // it up on the next pass regardless.
      if (share.created) void refreshCloudData().catch(() => {});
    })();
    return () => {
      alive = false;
    };
  }, [db, groupId, enabled, refreshCloudData]);

  return useMemo(() => (token ? buildInviteUrl(token) : ""), [token]);
}
