import {
  getOpenAiApiKeyForReceipts,
  getReceiptParseProxyUrl,
  getSttApiKey,
  getSttEndpointUrl,
  getSttModel,
} from "./receiptAiEnv";

function getWhisperModel(): string {
  const m = (process.env.EXPO_PUBLIC_OPENAI_WHISPER_MODEL ?? "").trim();
  return m.length > 0 ? m : "whisper-1";
}

/**
 * Read a local file URI into a typed Blob. Fetching file:// URIs works on both
 * React Native (iOS/Android) and web; we wrap the bytes in a Blob ourselves so
 * the MIME type is always set — some RN FormData polyfills otherwise stringify
 * the `{uri, name, type}` shape to "[object Object]" on the wire.
 */
async function readFileAsBlob(fileUri: string, mimeType: string): Promise<Blob> {
  const src = await fetch(fileUri);
  const buf = await src.arrayBuffer();
  return new Blob([buf], { type: mimeType });
}

async function callWhisper(opts: {
  apiKey: string;
  fileUri: string;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const blob = await readFileAsBlob(opts.fileUri, opts.mimeType);
  const form = new FormData();
  form.append("file", blob, opts.filename);
  form.append("model", getWhisperModel());
  form.append("response_format", "json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: form as unknown as BodyInit,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`OpenAI HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const body = (await res.json()) as { text?: string };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    throw new Error("OpenAI returned no transcription text");
  }
  return text;
}

async function callStt(opts: {
  apiKey: string;
  fileUri: string;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const blob = await readFileAsBlob(opts.fileUri, opts.mimeType);
  const form = new FormData();
  form.append("file", blob, opts.filename);
  form.append("model_id", getSttModel());

  const res = await fetch(getSttEndpointUrl(), {
    method: "POST",
    headers: {
      "xi-api-key": opts.apiKey,
    },
    body: form as unknown as BodyInit,
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`STT HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const body = (await res.json()) as { text?: string };
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    throw new Error("STT returned no transcription text");
  }
  return text;
}

async function callProxy(opts: {
  url: string;
  fileUri: string;
  mimeType: string;
}): Promise<string> {
  const FS = await import("expo-file-system/legacy");
  const base64 = await FS.readAsStringAsync(opts.fileUri, {
    encoding: FS.EncodingType.Base64,
  });
  const res = await fetch(opts.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind: "audio-transcription",
      audioBase64: base64,
      mimeType: opts.mimeType,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    throw new Error(`Transcribe proxy HTTP ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const body = (await res.json().catch(() => null)) as { text?: string } | null;
  const text = (body?.text ?? "").trim();
  if (!text) {
    throw new Error("Transcribe proxy returned no text");
  }
  return text;
}

export async function transcribeAudioFile(input: {
  fileUri: string;
  mimeType: string;
  /** Defaults to "recording.m4a" — used by the STT backend to infer the format. */
  filename?: string;
}): Promise<string> {
  const filename = input.filename ?? "recording.m4a";
  const proxy = getReceiptParseProxyUrl();
  if (proxy) {
    return callProxy({ url: proxy, fileUri: input.fileUri, mimeType: input.mimeType });
  }
  const sttKey = getSttApiKey();
  if (sttKey) {
    return callStt({
      apiKey: sttKey,
      fileUri: input.fileUri,
      mimeType: input.mimeType,
      filename,
    });
  }
  const apiKey = getOpenAiApiKeyForReceipts();
  if (!apiKey) {
    throw new Error("MISSING_OPENAI_KEY");
  }
  return callWhisper({
    apiKey,
    fileUri: input.fileUri,
    mimeType: input.mimeType,
    filename,
  });
}
