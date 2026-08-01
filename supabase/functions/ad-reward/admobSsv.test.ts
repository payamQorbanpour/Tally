import { describe, expect, it } from "vitest";
import {
  base64UrlToBytes,
  derToRawEcdsaSignature,
  extractSignedContent,
  verifyAdMobSignature,
} from "./admobSsv";

/** DER-encode a raw 64-byte (r||s) ECDSA signature, the way Google sends it. */
function rawToDer(raw: Uint8Array): Uint8Array {
  const encodeInt = (bytes: Uint8Array): number[] => {
    let i = 0;
    while (i < bytes.length - 1 && bytes[i] === 0) i++;
    const trimmed = [...bytes.slice(i)];
    // DER integers are signed: a leading bit of 1 needs a 0x00 pad.
    if (trimmed[0]! & 0x80) trimmed.unshift(0x00);
    return [0x02, trimmed.length, ...trimmed];
  };
  const r = encodeInt(raw.slice(0, 32));
  const s = encodeInt(raw.slice(32));
  const body = [...r, ...s];
  return new Uint8Array([0x30, body.length, ...body]);
}

function spkiToPem(spki: ArrayBuffer): string {
  const b64 = btoa(String.fromCharCode(...new Uint8Array(spki)));
  const lines = b64.match(/.{1,64}/g)?.join("\n") ?? b64;
  return `-----BEGIN PUBLIC KEY-----\n${lines}\n-----END PUBLIC KEY-----\n`;
}

describe("extractSignedContent", () => {
  it("returns everything before &signature=", () => {
    // Google signs the query string up to (but excluding) the signature and
    // key_id parameters, which are always last and in that order.
    const q =
      "ad_network=5450213213286189855&ad_unit=1234&reward_amount=3" +
      "&reward_item=credits&timestamp=1700000000000&transaction_id=abc" +
      "&user_id=u-1&signature=SIG&key_id=3335741209";
    expect(extractSignedContent(q)).toBe(
      "ad_network=5450213213286189855&ad_unit=1234&reward_amount=3" +
        "&reward_item=credits&timestamp=1700000000000&transaction_id=abc&user_id=u-1",
    );
  });

  it("tolerates a leading question mark", () => {
    expect(extractSignedContent("?a=1&signature=x&key_id=y")).toBe("a=1");
  });

  it("returns null when there is no signature parameter", () => {
    expect(extractSignedContent("a=1&b=2")).toBeNull();
  });

  it("returns null when signature is the first parameter", () => {
    // Nothing was signed — treat as malformed rather than verifying "".
    expect(extractSignedContent("signature=x&key_id=y")).toBeNull();
  });
});

describe("base64UrlToBytes", () => {
  it("decodes base64url with - and _ and no padding", () => {
    // 0xFB 0xFF 0xBE => "-_--" in base64url, "+/++" in standard base64.
    expect([...base64UrlToBytes("-_--")]).toEqual([0xfb, 0xff, 0xbe]);
  });

  it("decodes a value needing padding", () => {
    expect([...base64UrlToBytes("QQ")]).toEqual([0x41]);
  });
});

describe("derToRawEcdsaSignature", () => {
  it("unwraps a plain 32-byte r and s", () => {
    const r = new Uint8Array(32).fill(0x11);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([0x30, 0x44, 0x02, 0x20, ...r, 0x02, 0x20, ...s]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw.length).toBe(64);
    expect([...raw.slice(0, 32)]).toEqual([...r]);
    expect([...raw.slice(32)]).toEqual([...s]);
  });

  it("strips the 0x00 pad DER adds to a high-bit integer", () => {
    const r = new Uint8Array(32).fill(0x80); // high bit set → DER pads it
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([
      0x30, 0x45, 0x02, 0x21, 0x00, ...r, 0x02, 0x20, ...s,
    ]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw.length).toBe(64);
    expect([...raw.slice(0, 32)]).toEqual([...r]);
  });

  it("left-pads an integer shorter than 32 bytes", () => {
    const rShort = new Uint8Array(30).fill(0x33);
    const s = new Uint8Array(32).fill(0x22);
    const der = new Uint8Array([
      0x30, 0x42, 0x02, 0x1e, ...rShort, 0x02, 0x20, ...s,
    ]);
    const raw = derToRawEcdsaSignature(der);
    expect(raw.length).toBe(64);
    expect([...raw.slice(0, 2)]).toEqual([0, 0]);
    expect([...raw.slice(2, 32)]).toEqual([...rShort]);
  });

  it("rejects a non-sequence", () => {
    expect(() => derToRawEcdsaSignature(new Uint8Array([0x31, 0x00]))).toThrow();
  });
});

describe("verifyAdMobSignature", () => {
  it("accepts a signature over the signed content and rejects a tampered one", async () => {
    // Generate our own P-256 key, sign the way Google does (ECDSA/SHA-256,
    // DER-wrapped), and push it through the real verification path. This
    // exercises every step end-to-end without needing a live Google key.
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pem = spkiToPem(await crypto.subtle.exportKey("spki", pair.publicKey));

    const signed = "reward_amount=3&transaction_id=abc&user_id=u-1";
    const rawQuery = `${signed}&signature=PLACEHOLDER&key_id=1`;

    const rawSig = new Uint8Array(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(signed),
      ),
    );
    const der = rawToDer(rawSig);
    const sigB64Url = btoa(String.fromCharCode(...der))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await expect(
      verifyAdMobSignature({ rawQuery, signatureB64Url: sigB64Url, publicKeyPem: pem }),
    ).resolves.toBe(true);

    // Same signature, different content — a forged reward amount.
    const tampered = rawQuery.replace("reward_amount=3", "reward_amount=300");
    await expect(
      verifyAdMobSignature({
        rawQuery: tampered,
        signatureB64Url: sigB64Url,
        publicKeyPem: pem,
      }),
    ).resolves.toBe(false);
  });

  it("returns false rather than throwing on a malformed signature", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    );
    const pem = spkiToPem(await crypto.subtle.exportKey("spki", pair.publicKey));
    await expect(
      verifyAdMobSignature({
        rawQuery: "a=1&signature=notbase64!!&key_id=1",
        signatureB64Url: "notbase64!!",
        publicKeyPem: pem,
      }),
    ).resolves.toBe(false);
  });
});
