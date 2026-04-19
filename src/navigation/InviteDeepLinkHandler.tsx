import * as Linking from "expo-linking";
import { useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { useTallyData } from "../db/DatabaseContext";
import { useLocale } from "../i18n/LocaleContext";
import { acceptGroupInviteWithAuth } from "../sync/groupInviteAccept";
import { navigationRef } from "./navigationRef";

function extractInviteToken(url: string): string | null {
  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams?.token;
    if (typeof q === "string" && q.trim()) return q.trim();
    if (Array.isArray(q) && q[0]) return String(q[0]).trim();
  } catch {
    /* ignore */
  }
  const m = /[?&]token=([^&]+)/.exec(url);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Handles `tally://group-invite?token=…` after the user opens an invite link.
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
      if (u && extractInviteToken(u)) setPendingUrl(u);
    });
    const sub = Linking.addEventListener("url", ({ url }) => {
      if (extractInviteToken(url)) setPendingUrl(url);
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (loading || !pendingUrl) return;
    const token = extractInviteToken(pendingUrl);
    if (!token) {
      setPendingUrl(null);
      return;
    }
    if (handledRef.current.has(token)) {
      setPendingUrl(null);
      return;
    }

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

      handledRef.current.add(token);
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
          handledRef.current.delete(token);
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
              screen: "GroupDetail",
              params: { groupId: res.groupId },
            },
          });
        }
        if (Platform.OS !== "web") {
          Alert.alert(t("groupDetail.inviteAcceptedTitle"), t("groupDetail.inviteAcceptedBody"));
        }
      } catch (e) {
        handledRef.current.delete(token);
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
