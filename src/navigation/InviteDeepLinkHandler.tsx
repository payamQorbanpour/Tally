import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import {
  parseInviteTokenFromScannedUrl,
  type ScannedInvite,
} from "../core/inviteEnv";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { acceptGroupInviteWithAuth } from "../sync/groupInviteAccept";
import { navigationRef } from "./navigationRef";

function inviteKey(invite: ScannedInvite): string {
  return invite.kind === "group"
    ? `group:${invite.token}`
    : `expense:${invite.expenseId}`;
}

/**
 * Handles invite deep links arriving via the OS: `tally://group-invite?token=…`
 * for group joins and `tally://expense-invite?id=…` for expense joins, plus
 * the configured web-base variants. The QR scanner forwards scanned URLs
 * through `Linking.openURL`, which round-trips them back here.
 */
export function InviteDeepLinkHandler() {
  const { session, loading } = useSupabaseSession();
  const {
    db,
    refreshCloudData,
    cloudSyncCanBeUsed,
    cloudSyncUserEnabled,
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
          Alert.alert(
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
      if (!session?.user?.id || !session.user.email) {
        Alert.alert(
          t("groupDetail.inviteSignInTitle"),
          t("groupDetail.inviteSignInBody"),
        );
        setPendingUrl(null);
        return;
      }

      if (!cloudSyncCanBeUsed || !cloudSyncUserEnabled || !localUserHasProfileEmail) {
        Alert.alert(
          t("groupDetail.inviteCloudTitle"),
          t("groupDetail.inviteCloudBody"),
        );
        setPendingUrl(null);
        return;
      }

      const client = createTallySupabaseClient();
      if (!client) {
        Alert.alert(t("groupDetail.inviteCloudTitle"), t("groupDetail.inviteCloudBody"));
        setPendingUrl(null);
        return;
      }

      handledRef.current.add(key);
      setPendingUrl(null);
      try {
        await refreshCloudData();
        const res = await acceptGroupInviteWithAuth(
          client,
          db,
          token,
          session.user.id,
          session.user.email,
        );
        if (!res.ok) {
          handledRef.current.delete(key);
          const msg =
            res.error === "email_mismatch"
              ? t("groupDetail.inviteEmailMismatch")
              : res.error === "invite_not_found"
                ? t("groupDetail.inviteNotFound")
                : t("groupDetail.inviteFailed");
          Alert.alert(t("groupDetail.inviteFailedTitle"), msg);
          return;
        }
        await refreshCloudData();
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
        Alert.alert(t("groupDetail.inviteFailedTitle"), msg);
      }
    })();
  }, [
    loading,
    pendingUrl,
    session?.user?.email,
    session?.user?.id,
    db,
    refreshCloudData,
    cloudSyncCanBeUsed,
    cloudSyncUserEnabled,
    localUserHasProfileEmail,
    t,
  ]);

  return null;
}
