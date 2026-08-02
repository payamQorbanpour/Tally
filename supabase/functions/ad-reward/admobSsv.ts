/**
 * AdMob server-side verification (SSV) signature checking.
 *
 * AdMob calls our reward endpoint over plain HTTP GET with no credentials —
 * the ECDSA signature is the only thing distinguishing a real callback from
 * anyone who guessed the URL. Getting this wrong means anyone can mint
 * credits, so every failure path here returns false rather than throwing past
 * the caller.
 *
 * Google signs with ECDSA on P-256 / SHA-256 and sends the signature
 * base64url-encoded in DER. Web Crypto's `verify` wants the raw `r||s` pair,
 * hence `derToRawEcdsaSignature`.
 *
 * Deliberately dependency-free (no `Deno.*`, no `npm:` imports) so Vitest can
 * run it under Node. Keep it that way.
 */

/**
 * The bytes Google signed: the query string up to, but excluding, the
 * `signature` parameter. Google documents `signature` and `key_id` as always
 * being the final two parameters, in that order.
 *
 * Returns null when the query is malformed — no signature, or nothing before
 * it — so the caller rejects rather than verifying an empty string.
 */
export function extractSignedContent(rawQuery: string): string | null {
  const query = rawQuery.startsWith("?") ? rawQuery.slice(1) : rawQuery;
  const marker = "&signature=";
  const idx = query.indexOf(marker);
  if (idx <= 0) return null;
  return query.slice(0, idx);
}

export function base64UrlToBytes(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * DER `SEQUENCE { INTEGER r, INTEGER s }` → raw 64-byte `r||s`.
 *
 * DER integers are signed and minimally encoded, so `r` may carry a leading
 * 0x00 pad (when its high bit is set) or be shorter than 32 bytes (when it
 * has leading zero bytes). Both are normalized to a fixed 32-byte field.
 */
export function derToRawEcdsaSignature(der: Uint8Array): Uint8Array {
  let offset = 0;
  if (der[offset++] !== 0x30) throw new Error("der_not_sequence");

  // Sequence length: short form only. A P-256 signature is ~70 bytes, well
  // under the 128-byte threshold where DER switches to long form.
  const seqLen = der[offset++]!;
  if (seqLen + 2 !== der.length) throw new Error("der_bad_length");

  const readInt = (): Uint8Array => {
    if (der[offset++] !== 0x02) throw new Error("der_not_integer");
    const len = der[offset++]!;
    const bytes = der.slice(offset, offset + len);
    offset += len;

    const field = new Uint8Array(32);
    if (bytes.length > 32) {
      // Leading 0x00 sign pad — drop it.
      field.set(bytes.slice(bytes.length - 32));
    } else {
      // Shorter than the field — right-align it.
      field.set(bytes, 32 - bytes.length);
    }
    return field;
  };

  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

/** Strip PEM armour and decode the SubjectPublicKeyInfo DER. */
export function pemToSpki(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN [^-]+-----/, "")
    .replace(/-----END [^-]+-----/, "")
    .replace(/\s+/g, "");
  return base64UrlToBytes(body);
}

export async function verifyAdMobSignature(opts: {
  rawQuery: string;
  signatureB64Url: string;
  publicKeyPem: string;
}): Promise<boolean> {
  try {
    const content = extractSignedContent(opts.rawQuery);
    if (!content) return false;

    const key = await crypto.subtle.importKey(
      "spki",
      pemToSpki(opts.publicKeyPem),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );

    const raw = derToRawEcdsaSignature(base64UrlToBytes(opts.signatureB64Url));

    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      raw,
      new TextEncoder().encode(content),
    );
  } catch {
    // Malformed input is an unverified callback, not a server error.
    return false;
  }
}
