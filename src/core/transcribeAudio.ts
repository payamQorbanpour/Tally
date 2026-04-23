import { Platform } from "react-native";
import { guardNetworkCall } from "./networkGuard";
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
 * Append a local file to a FormData instance in a runtime-appropriate way.
 *
 * On native (Hermes / React Native), `new Blob([arrayBuffer])` is unsupported,
 * so we pass the RN-specific `{ uri, name, type }` shape that the platform's
 * FormData polyfill knows how to stream.
 *
 * On web, that shape gets stringified to "[object Object]", so we fetch the
 * file into a real Blob (browsers support `new Blob([ArrayBuffer])` just fine).
 */
async function appendFileToForm(
  form: FormData,
  field: string,
  fileUri: string,
  mimeType: string,
  filename: string,
): Promise<void> {
  if (Platform.OS === "web") {
    const src = await fetch(fileUri);
    const blob = await src.blob();
    form.append(field, blob, filename);
    return;
  }
  form.append(
    field,
    { uri: fileUri, name: filename, type: mimeType } as unknown as Blob,
    filename,
  );
}

async function callWhisper(opts: {
  apiKey: string;
  fileUri: string;
  mimeType: string;
  filename: string;
}): Promise<string> {
  const form = new FormData();
  await appendFileToForm(form, "file", opts.fileUri, opts.mimeType, opts.filename);
  form.append("model", getWhisperModel());
  form.append("response_format", "json");

  const res = await guardNetworkCall(() =>
    fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: form as unknown as BodyInit,
    }),
  );
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
  const form = new FormData();
  await appendFileToForm(form, "file", opts.fileUri, opts.mimeType, opts.filename);
  form.append("model_id", getSttModel());

  const res = await guardNetworkCall(() =>
    fetch(getSttEndpointUrl(), {
      method: "POST",
      headers: {
        "xi-api-key": opts.apiKey,
      },
      body: form as unknown as BodyInit,
    }),
  );
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
  const res = await guardNetworkCall(() =>
    fetch(opts.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "audio-transcription",
        audioBase64: base64,
        mimeType: opts.mimeType,
      }),
    }),
  );
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
