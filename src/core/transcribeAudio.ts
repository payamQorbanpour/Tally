import { Platform } from "react-native";
import { callAiProxy } from "./aiProxy";

async function readFileAsBase64(fileUri: string): Promise<string> {
  if (Platform.OS === "web") {
    const src = await fetch(fileUri);
    const blob = await src.blob();
    const buf = await blob.arrayBuffer();
    let bin = "";
    const view = new Uint8Array(buf);
    for (let i = 0; i < view.length; i++) bin += String.fromCharCode(view[i]!);
    // btoa can choke on long strings; chunk-encode if needed.
    return typeof btoa === "function" ? btoa(bin) : "";
  }
  const FS = await import("expo-file-system/legacy");
  return await FS.readAsStringAsync(fileUri, {
    encoding: FS.EncodingType.Base64,
  });
}

export async function transcribeAudioFile(input: {
  fileUri: string;
  mimeType: string;
  /** Defaults to "recording.m4a" — used by the STT backend to infer the format. */
  filename?: string;
}): Promise<string> {
  const filename = input.filename ?? "recording.m4a";
  const base64 = await readFileAsBase64(input.fileUri);
  if (!base64) throw new Error("AUDIO_READ_FAILED");
  const res = await callAiProxy("transcribe", {
    audioBase64: base64,
    mimeType: input.mimeType,
    filename,
  });
  const body = (await res.json().catch(() => null)) as { text?: string } | null;
  const text = (body?.text ?? "").trim();
  if (!text) throw new Error("Transcription returned no text");
  return text;
}
