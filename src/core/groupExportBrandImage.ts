import { Image, Platform } from "react-native";
import { Asset } from "expo-asset";

/** Original splash / marketing logo with slogan — use for exports and balances UI. */
export const TALLY_SLOGAN_LOGO_SOURCE = require("../../assets/Tally-Slogan.png") as number;

/** Sibling of `assets/Tally-Slogan.png` — served at site root in Expo web dev/export when present. */
export const TALLY_SLOGAN_PUBLIC_WEB_PATH = "/tally-slogan.png" as const;

/**
 * `Image.resolveAssetSource` on web often returns a same-origin *relative* path. Fetching it from a
 * worker or without proper resolution can 404 — resolve against `document.baseURI` (Expo / Metro).
 */
export function toFetchableUrlOnWeb(uri: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return uri;
  }
  if (/^https?:\/\//i.test(uri) || uri.startsWith("data:") || uri.startsWith("blob:")) {
    return uri;
  }
  if (uri.startsWith("//")) {
    return window.location.protocol + uri;
  }
  try {
    if (uri.startsWith("/")) {
      return new URL(uri, window.location.origin).href;
    }
    return new URL(uri, document.baseURI || window.location.href).href;
  } catch {
    return uri;
  }
}

/**
 * Web: load PNG bytes, embed as data URL for `html2canvas` (iframe cannot rely on `src` to packager).
 */
function assetUriToDataUriWeb(assetUri: string): Promise<string | null> {
  return (async () => {
    const tryFetch = async (u: string): Promise<string | null> => {
      try {
        const res = await fetch(u, { mode: "cors" });
        if (!res.ok) return null;
        const blob = await res.blob();
        return await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const s = reader.result;
            resolve(typeof s === "string" ? s : null);
          };
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };
    const absolute = toFetchableUrlOnWeb(assetUri);
    return (await tryFetch(absolute)) ?? (await tryFetch(assetUri));
  })();
}

/** `expo-asset` is the most reliable way to get a real fetchable URL for a bundled `require` on web. */
async function dataUriFromExpoAssetSlogan(): Promise<string | null> {
  try {
    const a = await Asset.fromModule(TALLY_SLOGAN_LOGO_SOURCE).downloadAsync();
    const u = a.localUri ?? a.uri;
    if (!u) return null;
    return (
      (await assetUriToDataUriWeb(u)) || (await dataUriFromCanvasOnWeb(toFetchableUrlOnWeb(u)))
    );
  } catch {
    return null;
  }
}

/**
 * For web `buildSuggestedSettlementsExportHtml`: same-origin <img> `src` when a data: URL is not
 * inlining. Uses `expo-asset` first, then a static `public/tally-slogan.png` URL.
 * Safe to call only in the browser; returns a Promise.
 */
export async function getTallySloganImageUrlOnWeb(): Promise<string | null> {
  if (Platform.OS !== "web" || typeof window === "undefined" || typeof document === "undefined") {
    return null;
  }
  const staticUrl = new URL(TALLY_SLOGAN_PUBLIC_WEB_PATH, window.location.origin).href;
  try {
    const a = await Asset.fromModule(TALLY_SLOGAN_LOGO_SOURCE).downloadAsync();
    const u = a.localUri ?? a.uri;
    if (u) {
      return toFetchableUrlOnWeb(u);
    }
  } catch {
    /* fall back */
  }
  const mod = TALLY_SLOGAN_LOGO_SOURCE as unknown;
  if (typeof mod === "string" && mod.length > 0) {
    return toFetchableUrlOnWeb(mod);
  }
  if (typeof mod === "number") {
    const { uri: r } = Image.resolveAssetSource(mod);
    if (r && r.length > 0) {
      if (r.startsWith("data:")) {
        return r;
      }
      return toFetchableUrlOnWeb(r);
    }
  }
  return staticUrl;
}

/** Same-origin: decode via `<img>` + `canvas` when `fetch` fails (CORS, Safari, etc.). */
function dataUriFromCanvasOnWeb(absoluteUrl: string): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const load = (useCors: boolean) => {
      const img = new window.Image();
      if (useCors) {
        img.crossOrigin = "anonymous";
      }
      img.onload = () => {
        try {
          const w = Math.max(1, img.naturalWidth);
          const h = Math.max(1, img.naturalHeight);
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          if (!ctx) {
            if (useCors) {
              load(false);
            } else {
              resolve(null);
            }
            return;
          }
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png", 0.95));
        } catch {
          if (useCors) {
            load(false);
          } else {
            resolve(null);
          }
        }
      };
      img.onerror = () => {
        if (useCors) {
          load(false);
        } else {
          resolve(null);
        }
      };
      img.src = absoluteUrl;
    };
    load(true);
  });
}

/**
 * PNG as a data URL for embedding in HTML (web PNG/PDF). Falls back to `null` on failure.
 * On web, uses `expo-asset` and `public/tally-slogan.png` so `html2canvas` can embed a real image.
 */
export async function getTallySloganImageDataUri(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      const fromA = await dataUriFromExpoAssetSlogan();
      if (fromA) {
        return fromA;
      }
      if (typeof window !== "undefined") {
        const fromPublic = await assetUriToDataUriWeb(
          new URL(TALLY_SLOGAN_PUBLIC_WEB_PATH, window.location.origin).href,
        );
        if (fromPublic) {
          return fromPublic;
        }
      }
    }

    const { uri } = Image.resolveAssetSource(TALLY_SLOGAN_LOGO_SOURCE);
    if (!uri) {
      return null;
    }
    if (uri.startsWith("data:")) {
      return uri;
    }

    if (Platform.OS === "web") {
      if (uri.startsWith("file://")) {
        const FS = await import("expo-file-system/legacy");
        try {
          const b64 = await FS.readAsStringAsync(uri, { encoding: "base64" });
          return `data:image/png;base64,${b64}`;
        } catch {
          return null;
        }
      }
      const fromFetch = await assetUriToDataUriWeb(uri);
      if (fromFetch) {
        return fromFetch;
      }
      const forCanvas = toFetchableUrlOnWeb(uri);
      return await dataUriFromCanvasOnWeb(forCanvas);
    }

    const FS = await import("expo-file-system/legacy");
    const base = FS.cacheDirectory ?? FS.documentDirectory;
    if (!base) {
      return null;
    }

    if (uri.startsWith("file://")) {
      const b64 = await FS.readAsStringAsync(uri, {
        encoding: "base64",
      });
      return `data:image/png;base64,${b64}`;
    }

    const dest = `${base}tally-slogan-export-${Date.now()}.png`;
    const { uri: localUri } = await FS.downloadAsync(uri, dest);
    const b64 = await FS.readAsStringAsync(localUri, {
      encoding: "base64",
    });
    try {
      await FS.deleteAsync(localUri, { idempotent: true });
    } catch {
      /* ok */
    }
    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}
