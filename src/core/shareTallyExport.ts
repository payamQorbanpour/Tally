import {
  cacheDirectory,
  documentDirectory,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

/**
 * Web: triggers a file download. Native: writes a temp file and opens the system share sheet when available.
 */
export async function shareOrDownloadTallyExport(json: string, fileName: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return;
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  const base = cacheDirectory ?? documentDirectory;
  if (!base) {
    await Share.share({ message: json, title: fileName });
    return;
  }
  const path = `${base}${fileName}`;
  await writeAsStringAsync(path, json);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "application/json",
      UTI: "public.json",
      dialogTitle: fileName,
    });
  } else {
    await Share.share({ message: json, title: fileName });
  }
}
