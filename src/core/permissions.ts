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
 * Read current status, and request only when the user has never been asked.
 * Returns the resulting snapshot.
 *
 * Never re-requests after an explicit denial: on iOS that call resolves
 * immediately without a dialog, which reads to the user as a dead button.
 * Check `canAskAgain` and send them to Settings instead.
 */
export async function ensureNativePermission(
  get: () => Promise<PermissionSnapshot>,
  request: () => Promise<PermissionSnapshot>,
): Promise<PermissionSnapshot> {
  const current = await get();
  if (current.granted) return current;
  if (current.status !== "undetermined") return current;
  return request();
}
