import { SETTINGS_KEYS, setSetting } from "../data/tallyRepo";
import { DEFAULT_LOCAL_USER_ID, getLocalUserId } from "../db/ids";
import { remapLocalUserIdInSqlite } from "../db/remapLocalUserId";
import type { TallyDb } from "../db/tallyDb";

/**
 * Reverse the sign-in remap so the device is "un-linked" locally. Called on
 * explicit sign-out so the next sign-in (possibly with a different account)
 * starts from `DEFAULT_LOCAL_USER_ID` instead of hitting the
 * "Different account on this device" guard.
 *
 * Profile data (name, email, avatar, cached avatar file) and preferences
 * (locale, currency, appearance) are intentionally preserved — signing out
 * is treated as "stop syncing", not "wipe this device". Groups and expenses
 * also stay (they're tied to the now-defaulted user id). On the next
 * sign-in, `hydrateLocalProfileFromCloud` will overlay the cloud profile
 * onto whatever's still locally cached.
 */
export async function performLocalSignOutCleanup(db: TallyDb): Promise<void> {
  const myId = getLocalUserId();
  if (myId === DEFAULT_LOCAL_USER_ID) return;
  try {
    await remapLocalUserIdInSqlite(db, myId, DEFAULT_LOCAL_USER_ID);
    await setSetting(db, SETTINGS_KEYS.activeLocalUserId, DEFAULT_LOCAL_USER_ID);
  } catch {
    // Leave the binding as-is; the user can retry sign-out.
  }
}
