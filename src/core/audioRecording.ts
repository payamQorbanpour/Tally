/**
 * Lazy, defensive wrapper around `expo-audio`.
 *
 * `expo-audio` ships native code and is NOT included in Expo Go; it requires a
 * dev-client / prebuild to be bundled into the iOS/Android binary. If the
 * native module is missing, a top-level `import` of `expo-audio` throws during
 * module initialization, which cascades into RN's "App entry point named
 * 'main' was not registered" — the whole app fails to boot.
 *
 * To keep the rest of the app usable (and so we can show a friendly error
 * inside the voice flow instead of a blank crash), we `require` the module
 * inside a try/catch. When it loads, we re-export the real hooks. When it
 * doesn't, we export inert stubs with the same shapes; callers guard on
 * `isAudioRecordingAvailable` before starting a recording.
 */

type ExpoAudioModule = typeof import("expo-audio");

type AudioRecorder = ReturnType<ExpoAudioModule["useAudioRecorder"]>;
type AudioRecorderState = ReturnType<ExpoAudioModule["useAudioRecorderState"]>;

type Preset = Parameters<ExpoAudioModule["useAudioRecorder"]>[0];

let mod: ExpoAudioModule | null = null;
let loadError: Error | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  mod = require("expo-audio") as ExpoAudioModule;
} catch (e) {
  mod = null;
  loadError = e instanceof Error ? e : new Error(String(e));
}

export const isAudioRecordingAvailable = mod !== null;

export function getAudioLoadError(): Error | null {
  return loadError;
}

/**
 * Default preset — falls back to an empty object when the module is missing so
 * the stubbed hook still has something to accept.
 */
export const RecordingPresets: ExpoAudioModule["RecordingPresets"] =
  mod?.RecordingPresets ??
  ({} as unknown as ExpoAudioModule["RecordingPresets"]);

export function useAudioRecorder(preset: Preset): AudioRecorder {
  if (mod) return mod.useAudioRecorder(preset);
  // Inert recorder — methods no-op; `uri` stays null; `record/stop` resolve.
  return {
    prepareToRecordAsync: async () => {},
    record: () => {},
    stop: async () => {},
    uri: null,
  } as unknown as AudioRecorder;
}

export function useAudioRecorderState(
  recorder: AudioRecorder,
  ms?: number,
): AudioRecorderState {
  if (mod) return mod.useAudioRecorderState(recorder, ms);
  return {
    isRecording: false,
    durationMillis: 0,
    metering: null,
    url: null,
    canRecord: false,
    mediaServicesDidReset: false,
  } as unknown as AudioRecorderState;
}

export async function requestRecordingPermissionsAsync(): Promise<{
  granted: boolean;
  status: string;
}> {
  if (mod) {
    const res = await mod.requestRecordingPermissionsAsync();
    return { granted: res.granted, status: res.status };
  }
  return { granted: false, status: "unavailable" };
}

export async function setAudioModeAsync(
  opts: Parameters<ExpoAudioModule["setAudioModeAsync"]>[0],
): Promise<void> {
  if (mod) await mod.setAudioModeAsync(opts);
}
