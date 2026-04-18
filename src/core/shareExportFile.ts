import {
  cacheDirectory,
  documentDirectory,
  writeAsStringAsync,
} from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

export async function shareTextFile(
  content: string,
  fileName: string,
  mimeType: string,
  uti?: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof document === "undefined") return;
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
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
    await Share.share({ message: content, title: fileName });
    return;
  }
  const path = `${base}${fileName}`;
  await writeAsStringAsync(path, content);
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType,
      UTI: uti ?? "public.data",
      dialogTitle: fileName,
    });
  } else {
    await Share.share({ message: content, title: fileName });
  }
}

export async function shareFileUri(
  uri: string,
  fileName: string,
  mimeType: string,
  uti?: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (uri.startsWith("data:")) {
      const a = document.createElement("a");
      a.href = uri;
      a.download = fileName;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    const res = await fetch(uri);
    const blob = await res.blob();
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
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType,
      UTI: uti ?? "public.data",
      dialogTitle: fileName,
    });
  } else {
    await Share.share({ url: uri, title: fileName });
  }
}

/**
 * Native: renders HTML to a PDF file and opens the share sheet.
 * Web: opens a new window with the HTML and triggers print (user can choose Save as PDF).
 */
export async function shareGroupPdfFromHtml(
  htmlDocument: string,
  fileName: string,
): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const w = window.open("", "_blank");
    if (!w) throw new Error("Popup blocked — allow popups to export PDF.");
    w.document.write(htmlDocument);
    w.document.close();
    w.onload = () => {
      w.focus();
      w.print();
    };
    return;
  }
  const result = await Print.printToFileAsync({ html: htmlDocument });
  const uri = result.uri;
  await shareFileUri(uri, fileName, "application/pdf", "com.adobe.pdf");
}
