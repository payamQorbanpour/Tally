import { Platform } from "react-native";

/**
 * Cap the longest edge at this many pixels before sending a receipt image
 * to the AI proxy. Modern phone cameras shoot 12 MP+ which can blow past
 * the Supabase Edge Function 10MB body limit once base64-encoded — and the
 * vision model gains very little from anything beyond ~1600px on a receipt.
 */
const MAX_LONG_EDGE = 1600;
const JPEG_QUALITY = 0.7;

export type ReceiptImage = {
  uri: string;
  base64: string;
  mimeType: string;
};

/**
 * Best-effort downscale + recompress of a picked receipt image so the
 * encoded payload stays comfortably under the proxy's body cap. Falls back
 * to the original image if `expo-image-manipulator` is not installed or if
 * any step throws — there's no value in failing the user's flow over a
 * resize miss.
 *
 * The dynamic import is deliberate: the module is a native dep that has to
 * be installed (`npx expo install expo-image-manipulator`) and rebuilt
 * (`npx expo prebuild` + native rebuild). When it isn't present yet we
 * pretend we never tried — the original payload still goes through, just
 * possibly large enough to be rejected.
 */
export async function downscaleReceiptImage(
  input: ReceiptImage,
): Promise<ReceiptImage> {
  // Tiny payloads aren't worth touching. Roughly: base64 grows the byte
  // count by 4/3, so 4 MB of base64 ≈ 3 MB on disk. Anything below that
  // already fits comfortably under the 10 MB Edge Function ceiling.
  if (input.base64.length < 4_000_000) return input;

  // Dynamic import so the build doesn't break if the native module hasn't
  // been added to the dev client / EAS build yet. The module is listed in
  // package.json but may not be installed locally — the `eslint-disable`
  // keeps `import/no-unresolved` from failing when the user hasn't run
  // `npm install` yet for this dep.
  let manipulator: typeof import("expo-image-manipulator") | null = null;
  try {
    // eslint-disable-next-line import/no-unresolved
    manipulator = await import("expo-image-manipulator");
  } catch {
    return input;
  }
  if (!manipulator) return input;

  try {
    const out = await manipulator.manipulateAsync(
      input.uri,
      [{ resize: { width: MAX_LONG_EDGE } }],
      {
        compress: JPEG_QUALITY,
        format: manipulator.SaveFormat.JPEG,
        base64: true,
      },
    );
    if (!out.base64) return input;
    return {
      uri: out.uri,
      base64: out.base64,
      // The output is JPEG (we forced SaveFormat.JPEG) regardless of the
      // input's mime type — flatten it so the proxy uses the right
      // `data:` prefix when forwarding to the model. Web returns blob URIs
      // and the same MIME applies.
      mimeType: Platform.OS === "web" ? "image/jpeg" : "image/jpeg",
    };
  } catch {
    return input;
  }
}
