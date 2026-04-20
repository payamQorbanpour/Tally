import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

export const PROFILE_PHOTO_FILE = "tally_profile_photo.jpg";

function profilePhotoDest(): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${PROFILE_PHOTO_FILE}`;
}

export type PickProfileAvatarSource = "library" | "camera";

export type PickProfileAvatarResult =
  | { kind: "uri"; uri: string }
  | { kind: "cancelled" }
  | { kind: "permissionDenied"; reason: PickProfileAvatarSource };

async function finalizeAssetUri(a: ImagePicker.ImagePickerAsset): Promise<PickProfileAvatarResult> {
  if (Platform.OS === "web") {
    if (a.base64) {
      const mime = a.mimeType?.startsWith("image/") ? a.mimeType : "image/jpeg";
      return { kind: "uri", uri: `data:${mime};base64,${a.base64}` };
    }
    if (a.uri) return { kind: "uri", uri: a.uri };
    return { kind: "cancelled" };
  }

  const src = a.uri;
  if (!src) return { kind: "cancelled" };

  const dest = profilePhotoDest();
  if (dest) {
    try {
      await FileSystem.copyAsync({ from: src, to: dest });
      return { kind: "uri", uri: dest };
    } catch {
      /* fall through to ephemeral picker URI */
    }
  }
  return { kind: "uri", uri: src };
}

/**
 * Opens the image library (square crop) or camera. On native, copies into the app sandbox so the URI stays valid.
 * On web, only `library` is practical; callers should hide camera on web.
 */
export async function pickProfileAvatar(
  source: PickProfileAvatarSource = "library",
): Promise<PickProfileAvatarResult> {
  if (source === "library") {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return { kind: "permissionDenied", reason: "library" };

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.52,
      base64: Platform.OS === "web",
    });

    if (res.canceled || !res.assets[0]) return { kind: "cancelled" };
    return finalizeAssetUri(res.assets[0]);
  }

  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { kind: "permissionDenied", reason: "camera" };

  const res = await ImagePicker.launchCameraAsync({
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.52,
  });

  if (res.canceled || !res.assets[0]) return { kind: "cancelled" };
  return finalizeAssetUri(res.assets[0]);
}

/** Best-effort remove of the canonical on-disk profile photo (native). */
export async function deletePersistedProfilePhotoFile(): Promise<void> {
  if (Platform.OS === "web") return;
  const dest = profilePhotoDest();
  if (!dest) return;
  try {
    const info = await FileSystem.getInfoAsync(dest);
    if (info.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {
    /* ignore */
  }
}
