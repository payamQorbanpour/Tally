import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { setSetting, SETTINGS_KEYS, updateLocalUserProfile } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import { DEFAULT_LOCAL_USER_ID, getLocalUserId } from "../db/ids";
import { remapLocalUserIdInSqlite } from "../db/remapLocalUserId";
import { useLocale } from "../i18n/LocaleContext";
import { useSupabaseSession } from "./SupabaseSessionContext";

/**
 * Links Supabase Auth `user.id` to the local SQLite profile (remaps the seeded default row once).
 * Must render under `DatabaseProvider` and `SupabaseSessionProvider`.
 */
export function AuthSQLiteBinding() {
  const { db, bumpDataRevision } = useTallyData();
  const { session, loading, signOut } = useSupabaseSession();
  const { t } = useLocale();
  const lastLinkedUid = useRef<string | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!session?.user?.id) {
      lastLinkedUid.current = null;
      return;
    }
    const uid = session.user.id;
    const myId = getLocalUserId();
    if (myId === uid) {
      lastLinkedUid.current = uid;
      return;
    }
    if (myId !== DEFAULT_LOCAL_USER_ID) {
      void (async () => {
        try {
          await signOut();
        } catch {
          /* ignore */
        }
        Alert.alert(
          t("account.authAccountConflictTitle"),
          t("account.authAccountConflictBody"),
        );
      })();
      return;
    }
    void (async () => {
      try {
        await remapLocalUserIdInSqlite(db, myId, uid);
        await setSetting(db, SETTINGS_KEYS.activeLocalUserId, uid);
        const email = session.user.email?.trim();
        if (email) {
          await updateLocalUserProfile(db, { email });
        }
        lastLinkedUid.current = uid;
        bumpDataRevision();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === "local_user_id_conflict") {
          try {
            await signOut();
          } catch {
            /* ignore */
          }
          Alert.alert(
            t("account.authAccountConflictTitle"),
            t("account.authAccountConflictBody"),
          );
          return;
        }
        // eslint-disable-next-line no-console
        console.error(e);
      }
    })();
  }, [loading, session?.user?.id, db, bumpDataRevision, signOut, t]);

  return null;
}
