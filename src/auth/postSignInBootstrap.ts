import { guardNetworkCall } from "../core/networkGuard";
import { getLocalUserProfile, updateLocalUserProfile } from "../data/tallyRepo";
import { getLocalUserId } from "../db/ids";
import type { TallyDb } from "../db/tallyDb";
import { createTallySupabaseClient } from "./supabaseClient";

/**
 * After the SQLite binding has remapped `DEFAULT_LOCAL_USER_ID` → Supabase uid,
 * pull just the authenticated user's `users` row from Supabase and write any
 * non-empty `name` / `avatar_uri` into the local profile. This ensures a device
 * signing in to an existing account immediately reflects the user's identity
 * (display name, profile picture) without waiting for a preference toggle or
 * a full cloud sync.
 *
 * Best-effort: failures (network, RLS, missing row) are swallowed. The regular
 * sync loop will try again later.
 */
export async function hydrateLocalProfileFromCloud(
  db: TallyDb,
  userId: string,
): Promise<void> {
  const client = createTallySupabaseClient();
  if (!client) return;
  try {
    const { data, error } = await guardNetworkCall(() =>
      client
        .from("users")
        .select("name, avatar_uri, email")
        .eq("id", userId)
        .maybeSingle(),
    );
    if (error || !data) return;

    const patch: { name?: string; avatarUri?: string | null; email?: string | null } = {};
    const remoteName = typeof data.name === "string" ? data.name.trim() : "";
    if (remoteName.length > 0 && remoteName.toLowerCase() !== "you") {
      patch.name = remoteName;
    }
    const remoteAvatar =
      typeof data.avatar_uri === "string" ? data.avatar_uri.trim() : "";
    if (remoteAvatar.length > 0) {
      patch.avatarUri = remoteAvatar;
    }
    const remoteEmail = typeof data.email === "string" ? data.email.trim() : "";
    if (remoteEmail.length > 0) {
      patch.email = remoteEmail;
    }
    if (Object.keys(patch).length > 0) {
      await updateLocalUserProfile(db, patch);
    }
  } catch {
    /* best-effort */
  }
}

/**
 * Push the local profile (name / email / avatar_uri) up to `public.users`
 * regardless of whether the cloud-sync toggle is on. Used so that a signed-in
 * user's identity stays in sync across devices even when they've chosen to
 * keep groups & expenses local-only.
 *
 * Best-effort: failures are swallowed. The full sync loop (when enabled) will
 * re-push on its own schedule.
 */
export async function pushLocalProfileToCloud(db: TallyDb): Promise<void> {
  const client = createTallySupabaseClient();
  if (!client) return;
  const userId = getLocalUserId();
  try {
    const profile = await getLocalUserProfile(db);
    const row: Record<string, unknown> = {
      id: userId,
      name: profile.name,
      email: profile.email,
      last_modified: new Date().toISOString(),
    };
    // Only push avatar_uri when it's either cleared (null) or a real remote
    // URL. A `file://` path is only meaningful on this device — pushing it
    // would give every other device a broken image, and would also mask the
    // case where a Storage upload failed silently.
    const local = profile.avatarUri;
    if (local === null) {
      row.avatar_uri = null;
    } else if (typeof local === "string" && /^https?:\/\//i.test(local)) {
      row.avatar_uri = local;
    }
    await guardNetworkCall(() =>
      client.from("users").upsert(row, { onConflict: "id" }),
    );
  } catch {
    /* best-effort */
  }
}
