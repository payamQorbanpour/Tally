import { updateLocalUserProfile, SETTINGS_KEYS, setSetting } from "../data/tallyRepo";
import { DEFAULT_LOCAL_USER_ID, getLocalUserId } from "../db/ids";
import { remapLocalUserIdInSqlite } from "../db/remapLocalUserId";
import { deletePersistedProfilePhotoFile } from "../core/pickProfileAvatar";
import type { TallyDb } from "../db/tallyDb";

/**
 * Reverse the sign-in remap so the device is "un-linked" locally. Called on
 * explicit sign-out so the next sign-in (possibly with a different account)
 * starts from `DEFAULT_LOCAL_USER_ID` instead of hitting the
 * "Different account on this device" guard.
 *
 * Also strips the identity the user was signed in with (name, email, avatar)
 * and clears their synced preferences (locale, currency, appearance) so the
 * device looks like a fresh install for the next person. Groups / expenses
 * stay — they're tied to the (now-defaulted) user id and the user can always
 * sign back in to re-link.
 *
 * Best-effort: every step is wrapped so a single failure doesn't block the
 * rest of the cleanup.
 */
export async function performLocalSignOutCleanup(db: TallyDb): Promise<void> {
  const myId = getLocalUserId();
  if (myId !== DEFAULT_LOCAL_USER_ID) {
    try {
      await remapLocalUserIdInSqlite(db, myId, DEFAULT_LOCAL_USER_ID);
      await setSetting(db, SETTINGS_KEYS.activeLocalUserId, DEFAULT_LOCAL_USER_ID);
    } catch {
      // Leave the binding as-is; subsequent cleanup still runs.
    }
  }
  try {
    // Reset the "You" profile to its seeded defaults. Name is forced back to
    // "You" so the UI doesn't keep showing the departed user's display name.
    await updateLocalUserProfile(db, {
      name: "You",
      email: null,
      avatarUri: null,
    });
  } catch {
    /* best-effort */
  }
  try {
    // Drop the cached avatar image file so it doesn't linger on disk.
    await deletePersistedProfilePhotoFile();
  } catch {
    /* best-effort */
  }
  // Clear preferences that were synced from the remote profile. The cloud
  // sync toggle is intentionally NOT reset — it's device-local.
  for (const key of [
    SETTINGS_KEYS.locale,
    SETTINGS_KEYS.defaultCurrency,
    SETTINGS_KEYS.appearance,
  ]) {
    try {
      await db.runAsync(`DELETE FROM app_settings WHERE setting_key = ?`, key);
    } catch {
      /* best-effort */
    }
  }
}
