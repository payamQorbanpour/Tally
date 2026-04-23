import * as FileSystem from "expo-file-system/legacy";
import { Platform } from "react-native";
import { createTallySupabaseClient } from "../auth/supabaseClient";
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
