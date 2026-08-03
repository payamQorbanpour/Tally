/**
 * House rule for OS permissions: **never pre-prompt**. Ask the platform first,
 * so the user's first sight of a permission request is the system dialog
 * ("Tally" Would Like to Access the Camera). Custom UI is for *after* a
 * denial — explaining what broke and offering Settings — never before.
 *
 * A custom screen shown ahead of the OS dialog trains users to dismiss both,
 * and on iOS the system dialog can only ever be shown once.
 *
 * The usage-description strings the dialog renders live in `app.json`: the
 * `expo-camera` / `expo-image-picker` / `expo-audio` plugin configs and the
 * iOS `infoPlist` block.
 */

export type PermissionSnapshot = {
  granted: boolean;
  /** False once the OS will no longer show the dialog — offer Settings instead. */
  canAskAgain: boolean;
  status: string;
};

/**
 * Read current status, and request whenever the OS is still willing to show
 * its dialog. Returns the resulting snapshot.
 *
 * Keys on `canAskAgain`, not on `status === "undetermined"`: on iOS a denial
 * sets `canAskAgain` false, so this never re-triggers the dead-button case
 * where a re-request resolves instantly with no dialog. On Android a soft
 * deny (without "Don't ask again") leaves `canAskAgain` true, and the OS
 * really will show its dialog again on the next `request*Async()` call —
 * which a user-initiated retry (e.g. tapping "Add Photo" again) needs in
 * order to not strand the user with a denial they can't undo from here.
 *
 * This is deliberately different from a mount-triggered request (see
 * `QrScanScreen`'s effect, which guards on `status === "undetermined"`
 * instead): a screen that asks automatically on open must not re-prompt
 * every time the user re-enters it after a soft denial, but an explicit
 * user action asking for the resource again should re-prompt whenever the
 * platform allows it.
 */
export async function ensureNativePermission(
  get: () => Promise<PermissionSnapshot>,
  request: () => Promise<PermissionSnapshot>,
): Promise<PermissionSnapshot> {
  const current = await get();
  if (current.granted) return current;
  if (!current.canAskAgain) return current;
  return request();
}
