import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { setSetting, SETTINGS_KEYS, updateLocalUserProfile } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";
import { DEFAULT_LOCAL_USER_ID, getLocalUserId } from "../db/ids";
import { remapLocalUserIdInSqlite } from "../db/remapLocalUserId";
import { useLocale } from "../i18n/LocaleContext";
import {
  hydrateLocalProfileFromCloud,
  pushLocalProfileToCloud,
} from "./postSignInBootstrap";
import {
  hydrateProfilePrefs,
  pushAllCurrentProfilePrefs,
} from "../sync/profilePrefsSync";
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
      // Already linked from a previous session — but the user's avatar /
      // display name may have changed on another device since we last
      // pulled. Re-hydrate so cross-device profile updates land here too.
      // (The full sync intentionally skips the user's own row.)
      lastLinkedUid.current = uid;
      void (async () => {
        try {
          await hydrateLocalProfileFromCloud(db, uid);
          bumpDataRevision();
        } catch {
          /* best-effort */
        }
      })();
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
        // Pull the authenticated user's profile row (name, avatar) so the UI
        // reflects the signed-in identity before anything else.
        await hydrateLocalProfileFromCloud(db, uid);
        // Push local profile data (name / email / avatar) up so this device's
        // identity row is current, independent of the groups/expenses sync
        // toggle. The main sync stays at whatever pref the user had — we never
        // silently enable it on sign-in.
        await pushLocalProfileToCloud(db);
        // Preferences (locale, currency, appearance). Local values win when
        // already set so we don't overwrite offline edits; gaps are filled
        // from the remote `public.profiles` row. Then we push the merged set
        // back so the remote always reflects this device's current prefs.
        await hydrateProfilePrefs(db);
        await pushAllCurrentProfilePrefs(db);
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
