import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import { getLocalUserProfile, setSetting, SETTINGS_KEYS, updateLocalUserProfile } from "../data/tallyRepo";
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
import {
  fetchSoftDeleteState,
  restoreSoftDeletedAccount,
} from "../sync/softDeleteRemoteAccount";
import { setSentryUser } from "../observability/sentry";
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
      // Clear Sentry user context on sign-out so future errors aren't
      // attributed to whoever was last signed in.
      setSentryUser(null);
      return;
    }
    const uid = session.user.id;
    // Tag every Sentry event with the signed-in identity. We set the auth
    // uid + email + the device-local id so reports are filterable by both
    // the logged-in user and the offline-only profile they were on before
    // sign-in (useful when a sync conflict surfaces).
    setSentryUser({
      id: uid,
      email: session.user.email ?? null,
      localUserId: getLocalUserId(),
    });
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
        // Soft-delete check: if the cloud `users` row was previously
        // soft-deleted, ask whether to restore. Cancelling signs out so the
        // user lands back at the auth screen instead of seeing an
        // anonymized "[Deleted]" identity.
        const softState = await fetchSoftDeleteState(uid);
        if (softState?.deletedAt) {
          const when = new Date(softState.deletedAt).toLocaleDateString();
          const restored = await new Promise<boolean>((resolve) => {
            const body = t("account.restorePromptBody", { when });
            if (Platform.OS === "web") {
              resolve(
                typeof window !== "undefined" && window.confirm(body),
              );
              return;
            }
            Alert.alert(t("account.restorePromptTitle"), body, [
              {
                text: t("account.restorePromptStaySignedOut"),
                style: "cancel",
                onPress: () => resolve(false),
              },
              {
                text: t("account.restorePromptRestore"),
                onPress: () => resolve(true),
              },
            ]);
          });
          if (!restored) {
            try {
              await signOut();
            } catch {
              /* ignore */
            }
            return;
          }
          const profile = await getLocalUserProfile(db);
          const newName =
            profile.name && profile.name.trim() && profile.name !== "[Deleted]"
              ? profile.name
              : (session.user.email?.split("@")[0] ?? "You");
          await restoreSoftDeletedAccount(uid, newName);
          await updateLocalUserProfile(db, { name: newName });
        }
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
