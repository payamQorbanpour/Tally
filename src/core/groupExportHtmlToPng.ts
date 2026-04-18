/**
 * Renders the same full HTML document used for PDF export inside an off-screen iframe,
 * then rasterizes it with html2canvas so the PNG matches the PDF layout (web only).
 */
export async function captureReportHtmlAsPng(fullHtml: string): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("PNG from HTML is only available on web");
  }
  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", "export-preview");
  iframe.style.cssText =
    "position:fixed;left:-10000px;top:0;width:920px;min-height:200px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    document.body.removeChild(iframe);
    throw new Error("Could not access iframe document");
  }
  doc.open();
  doc.write(fullHtml);
  doc.close();

  await new Promise<void>((resolve) => {
    if (iframe.contentWindow?.document?.readyState === "complete") {
      resolve();
    } else {
      iframe.onload = () => resolve();
    }
  });
  await new Promise((r) => setTimeout(r, 250));

  try {
    const html2canvas = (await import("html2canvas")).default;
    const body = doc.body;
    const canvas = await html2canvas(body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
      windowWidth: Math.max(body.scrollWidth, 880),
      windowHeight: body.scrollHeight,
    });
    return canvas.toDataURL("image/png", 0.92);
  } finally {
    document.body.removeChild(iframe);
  }
}
