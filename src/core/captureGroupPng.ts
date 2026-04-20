import type { RefObject } from "react";
import { Platform, type View } from "react-native";

/**
 * Renders a snapshot of the export preview `View` as PNG.
 * On web, `react-native-view-shot` cannot be used (`findNodeHandle` is unavailable); we use `html2canvas` on the DOM node from the `View` ref instead.
 */
export async function captureGroupExportPng(viewRef: RefObject<View | null>): Promise<string> {
  if (Platform.OS === "web") {
    const node = viewRef.current as unknown as HTMLElement | null;
    if (!node) throw new Error("Export view not ready");
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(node, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    return canvas.toDataURL("image/png", 0.92);
  }
  const { captureRef } = await import("react-native-view-shot");
  return captureRef(viewRef, {
    format: "png",
    quality: 0.92,
    result: "tmpfile",
    snapshotContentContainer: false,
    /** Older iOS (e.g. 15) is more reliable with renderInContext than drawViewHierarchyInRect for off-screen views. */
    ...(Platform.OS === "ios" ? { useRenderInContext: true } : {}),
  }) as Promise<string>;
}
