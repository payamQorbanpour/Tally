import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { getSetting, setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import type { TallyDb } from "../db/tallyDb";
import { DEFAULT_LOCAL_USER_ID, getLocalUserId } from "../db/ids";
import { guardNetworkCall } from "./networkGuard";

/**
 * Storage bucket that holds avatar files under `"<auth.uid>/profile.jpg"`.
 * See `supabase/migrations/20260424_profile_prefs_and_avatars_bucket.sql`.
 */
const BUCKET = "avatars";
const OBJECT_NAME = "profile.jpg";

function isSignedIn(): boolean {
  return getLocalUserId() !== DEFAULT_LOCAL_USER_ID;
}

function currentObjectPath(): string {
  return `${getLocalUserId()}/${OBJECT_NAME}`;
}

/**
 * Base64 → ArrayBuffer without external deps. React Native 0.72+ exposes
 * `atob` globally; the browser does too.
 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const decode: (s: string) => string = (globalThis as any).atob;
  const binary = decode(b64);
  const len = binary.length;
  const buf = new Uint8Array(len);
  for (let i = 0; i < len; i++) buf[i] = binary.charCodeAt(i);
  return buf.buffer;
}

/**
 * Upload a local avatar image (file:// on native, blob/data URL on web) to
 * Supabase Storage and return the public URL. Returns `null` when not
 * signed in, Supabase isn't configured, or the upload fails.
 *
 * Appends a cache-busting query string so other devices don't keep serving
 * a stale image after the user changes it.
 */
export async function uploadAvatarToStorage(
  localUri: string,
): Promise<string | null> {
  if (!isSignedIn()) return null;
  const client = createTallySupabaseClient();
  if (!client) return null;
  const objectPath = currentObjectPath();

  try {
    let body: ArrayBuffer | Blob;
    let contentType = "image/jpeg";

    if (Platform.OS === "web" || localUri.startsWith("data:")) {
      const res = await fetch(localUri);
      body = await res.blob();
      if ((body as Blob).type) contentType = (body as Blob).type;
    } else {
      const base64 = await FileSystem.readAsStringAsync(localUri, {
        encoding: "base64",
      });
      body = base64ToArrayBuffer(base64);
    }

    const { error } = await guardNetworkCall(() =>
      client.storage
        .from(BUCKET)
        .upload(objectPath, body, { upsert: true, contentType }),
    );
    if (error) {
      if (process.env["NODE_ENV"] === "development") {
        // eslint-disable-next-line no-console
        console.warn("[avatarStorage] upload failed:", error.message, error);
      }
      return null;
    }

    const { data } = client.storage.from(BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) return null;
    return `${data.publicUrl}?v=${Date.now()}`;
  } catch (e) {
    if (process.env["NODE_ENV"] === "development") {
      // eslint-disable-next-line no-console
      console.warn("[avatarStorage] upload threw:", e);
    }
    return null;
  }
}

/**
 * Deterministic on-disk path for the cached copy of the cloud avatar.
 * Per-user so signing in/out doesn't accidentally serve a previous user's
 * cached image. Returns null on web (no FileSystem document directory).
 */
function cachedAvatarFilePath(userId: string): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}avatar_cache_${userId}.jpg`;
}

async function fileExistsAt(uri: string): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists;
  } catch {
    return false;
  }
}

/**
 * Returns the local cache path iff `remoteUrl` matches what we previously
 * cached AND the file is still on disk. No I/O beyond two settings reads
 * and one stat. Fast path for render — never downloads.
 *
 * Returns null on web (no persistent FS) or if the cache is missing /
 * stale / for a different URL.
 */
export async function readCachedAvatarLocalPath(
  db: TallyDb,
  remoteUrl: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const url = remoteUrl.trim();
  if (!url) return null;
  const storedUrl = await getSetting(db, SETTINGS_KEYS.avatarCacheSourceUrl);
  if (!storedUrl || storedUrl !== url) return null;
  const storedPath = await getSetting(db, SETTINGS_KEYS.avatarCacheLocalPath);
  if (!storedPath) return null;
  if (!(await fileExistsAt(storedPath))) return null;
  return storedPath;
}

/**
 * Records that `localPath` already mirrors the contents of `remoteUrl` —
 * used right after a fresh upload, where we already have the source file
 * on disk and a re-download would be wasted bandwidth.
 *
 * On web this is a no-op (we don't have a persistent FS to point at).
 */
export async function setCachedAvatarLocalPathForUrl(
  db: TallyDb,
  remoteUrl: string,
  localPath: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  const url = remoteUrl.trim();
  if (!url || !localPath) return;
  // Copy into a stable per-user cache path so the original picker file
  // (`tally_profile_photo.jpg`) can be deleted independently without
  // invalidating the cache.
  const dest = cachedAvatarFilePath(getLocalUserId());
  if (!dest) return;
  try {
    if (localPath !== dest) {
      if (await fileExistsAt(dest)) {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      }
      await FileSystem.copyAsync({ from: localPath, to: dest });
    }
    await setSetting(db, SETTINGS_KEYS.avatarCacheSourceUrl, url);
    await setSetting(db, SETTINGS_KEYS.avatarCacheLocalPath, dest);
  } catch (e) {
    if (process.env["NODE_ENV"] === "development") {
      console.warn("[avatarStorage] setCachedAvatarLocalPathForUrl failed:", e);
    }
  }
}

/**
 * Ensures the cloud avatar at `remoteUrl` is mirrored to disk and returns
 * the local path. Returns the cached path immediately when the URL hasn't
 * changed; otherwise downloads (with `FileSystem.downloadAsync`) into a
 * deterministic per-user file and updates the tracking settings.
 *
 * Returns null on web or on download failure — caller should fall back to
 * the remote URL. Never throws.
 */
export async function ensureCachedAvatarLocalPath(
  db: TallyDb,
  remoteUrl: string,
): Promise<string | null> {
  if (Platform.OS === "web") return null;
  const url = remoteUrl.trim();
  if (!url) return null;
  const cached = await readCachedAvatarLocalPath(db, url);
  if (cached) return cached;
  const dest = cachedAvatarFilePath(getLocalUserId());
  if (!dest) return null;
  try {
    if (await fileExistsAt(dest)) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    }
    const res = await FileSystem.downloadAsync(url, dest);
    if (res.status < 200 || res.status >= 300) {
      try {
        await FileSystem.deleteAsync(dest, { idempotent: true });
      } catch {
        /* ignore */
      }
      return null;
    }
    await setSetting(db, SETTINGS_KEYS.avatarCacheSourceUrl, url);
    await setSetting(db, SETTINGS_KEYS.avatarCacheLocalPath, dest);
    return dest;
  } catch (e) {
    if (process.env["NODE_ENV"] === "development") {
      console.warn("[avatarStorage] ensureCachedAvatarLocalPath failed:", e);
    }
    return null;
  }
}

/** Drops the URL→file mapping and best-effort deletes the cached file. */
export async function clearCachedAvatarLocalPath(db: TallyDb): Promise<void> {
  const stored = await getSetting(db, SETTINGS_KEYS.avatarCacheLocalPath);
  if (stored && Platform.OS !== "web") {
    try {
      if (await fileExistsAt(stored)) {
        await FileSystem.deleteAsync(stored, { idempotent: true });
      }
    } catch {
      /* ignore */
    }
  }
  await setSetting(db, SETTINGS_KEYS.avatarCacheSourceUrl, "");
  await setSetting(db, SETTINGS_KEYS.avatarCacheLocalPath, "");
}

/** Remove the current user's avatar from Storage. Best-effort. */
export async function deleteAvatarFromStorage(): Promise<void> {
  if (!isSignedIn()) return;
  const client = createTallySupabaseClient();
  if (!client) return;
  try {
    await guardNetworkCall(() =>
      client.storage.from(BUCKET).remove([currentObjectPath()]),
    );
  } catch {
    /* best-effort */
  }
}
