import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import {
  parseInviteTokenFromScannedUrl,
  type ScannedInvite,
} from "../core/inviteEnv";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import {
  acceptGroupInvite,
  type AcceptInviteError,
} from "../sync/groupInviteAccept";
import { showAlert } from "../ui/appAlert";
import { navigationRef } from "./navigationRef";

function inviteKey(invite: ScannedInvite): string {
  return invite.kind === "group"
    ? `group:${invite.token}`
    : `expense:${invite.expenseId}`;
}

/** Each refusal gets its own line — "invite failed" alone tells nobody what to do next. */
const ERROR_KEY: Record<AcceptInviteError, string> = {
  missing_token: "groupJoin.notFound",
  invite_not_found: "groupJoin.notFound",
  email_mismatch: "groupJoin.emailMismatch",
  not_signed_in: "groupJoin.signInBody",
  invite_lookup_failed: "groupJoin.lookupFailed",
  invite_failed: "groupJoin.failed",
};

/**
 * Handles invite deep links arriving via the OS: `tally://group-invite?token=…`
 * for group joins and `tally://expense-invite?id=…` for expense joins, plus
 * the `https://<host>/join/<token>` and `/expense/<id>` web variants. The QR
 * scanner forwards scanned URLs through `Linking.openURL`, which round-trips
 * them back here. On web `Linking.getInitialURL()` is the address bar, so
 * pasting a share link into a browser lands here too.
 */
export function InviteDeepLinkHandler() {
  const { session, loading } = useSupabaseSession();
  const {
    db,
    pullCloudData,
    cloudSyncCanBeUsed,
    cloudSyncUserEnabled,
    cloudSyncPremiumBlocked,
    localUserHasProfileEmail,
  } = useTallyData();
  const { t } = useLocale();
  const handledRef = useRef(new Set<string>());
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);

  useEffect(() => {
    void Linking.getInitialURL().then((u) => {
      if (u && parseInviteTokenFromScannedUrl(u)) setPendingUrl(u);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (parseInviteTokenFromScannedUrl(url)) setPendingUrl(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading || !pendingUrl) return;
    const invite = parseInviteTokenFromScannedUrl(pendingUrl);
    if (!invite) {
      setPendingUrl(null);
      return;
    }
    const key = inviteKey(invite);
    if (handledRef.current.has(key)) {
      setPendingUrl(null);
      return;
    }

    if (invite.kind === "expense") {
      handledRef.current.add(key);
      setPendingUrl(null);
      void (async () => {
        const row = await db.getFirstAsync<{ group_id: string }>(
          `SELECT group_id FROM expenses WHERE id = ?`,
          invite.expenseId,
        );
        if (!row) {
          handledRef.current.delete(key);
          showAlert(
            t("qrScan.expenseNotFoundTitle"),
            t("qrScan.expenseNotFoundBody"),
          );
          return;
        }
        if (navigationRef.isReady()) {
          navigationRef.navigate("Main", {
            screen: "Groups",
            params: {
              screen: "AddExpense",
              params: { groupId: row.group_id, expenseId: invite.expenseId },
            },
          });
        }
      })();
      return;
    }

    const token = invite.token;

    void (async () => {
      if (!session?.user?.id) {
        showAlert(t("groupJoin.signInTitle"), t("groupJoin.signInBody"));
        setPendingUrl(null);
        return;
      }

      // Joining is a cloud operation end to end: the membership row is written
      // on the server and the group only reaches this device by pulling. With
      // sync off there is nowhere for either half to happen, so refuse up front
      // rather than half-joining an account whose device will never see it.
      if (
        !cloudSyncCanBeUsed ||
        !cloudSyncUserEnabled ||
        cloudSyncPremiumBlocked ||
        !localUserHasProfileEmail
      ) {
        showAlert(t("groupJoin.cloudTitle"), t("groupJoin.cloudBody"));
        setPendingUrl(null);
        return;
      }

      const client = createTallySupabaseClient();
      if (!client) {
        showAlert(t("groupJoin.cloudTitle"), t("groupJoin.cloudBody"));
        setPendingUrl(null);
        return;
      }

      handledRef.current.add(key);
      setPendingUrl(null);
      try {
        const res = await acceptGroupInvite(client, token);
        if (!res.ok) {
          // Let the user retry the same link once the cause is fixed (signing
          // in with the right address, coming back online).
          handledRef.current.delete(key);
          showAlert(t("groupJoin.failedTitle"), t(ERROR_KEY[res.error]));
          return;
        }
        // Pull, don't `refreshCloudData()`: that pushes and then prunes remote
        // rows missing locally, and right now this device holds none of the
        // group it just joined.
        await pullCloudData();
        if (navigationRef.isReady()) {
          navigationRef.navigate("Main", {
            screen: "Groups",
            params: {
              screen: "InviteAccepted",
              params: { groupId: res.groupId },
            },
          });
        }
      } catch (e) {
        handledRef.current.delete(key);
        const msg = e instanceof Error ? e.message : String(e);
        showAlert(t("groupJoin.failedTitle"), msg);
      }
    })();
  }, [
    loading,
    pendingUrl,
    session?.user?.id,
    db,
    pullCloudData,
    cloudSyncCanBeUsed,
    cloudSyncUserEnabled,
    cloudSyncPremiumBlocked,
    localUserHasProfileEmail,
    t,
  ]);

  return null;
}
