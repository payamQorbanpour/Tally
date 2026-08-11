/**
 * Stop a recording and resolve the URI of the FINISHED file.
 *
 * `expo-audio` exposes two different URLs, and the difference is the whole
 * reason this module exists. Its own types spell it out:
 *
 *   RecorderState.url    "File URL where the recording *will be* saved"
 *   RecordingStatus.url  "File URL of the *completed* recording"
 *
 * `recorder.uri` is the former. Reading it the instant `stop()` resolves means
 * reading a path the encoder may still be writing to — and an `.m4a` stores its
 * `moov` atom at the END of the file, so a copy taken before finalization can
 * be partly or entirely undecodable. A speech-to-text provider handed such a
 * file returns whatever prefix it could decode, which presents as a transcript
 * truncated to its first words.
 *
 * So instead of trusting `stop()`'s resolution, wait for the
 * `recordingStatusUpdate` event carrying `isFinished: true` and use the URL it
 * reports.
 *
 * Fails soft. If no finished status arrives inside `timeoutMs` — a platform
 * that finalizes synchronously may emit before we could subscribe — this falls
 * back to `recorder.uri`, i.e. exactly the old behaviour. A missing event
 * should degrade to "possibly truncated", never to "recording lost".
 */

/** The subset of `expo-audio`'s `RecordingStatus` this needs. */
export type RecordingStatusLike = {
  isFinished: boolean;
  url: string | null;
};

/** The subset of `expo-audio`'s `AudioRecorder` this needs. */
export type RecorderLike = {
  uri: string | null;
  stop: () => Promise<void>;
  addListener: (
    event: "recordingStatusUpdate",
    listener: (status: RecordingStatusLike) => void,
  ) => { remove: () => void };
};

/**
 * How long to wait for the finished-status event before falling back.
 *
 * Generous enough to cover an encoder flushing a long recording, short enough
 * that a platform which never emits does not leave the user watching a spinner.
 */
export const FINISHED_RECORDING_TIMEOUT_MS = 2_000;

export async function stopAndResolveRecordingUri(
  recorder: RecorderLike,
  timeoutMs: number = FINISHED_RECORDING_TIMEOUT_MS,
): Promise<string | null> {
  let settle: ((url: string | null) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  // Subscribe BEFORE stopping: on a fast platform the event can land during
  // the stop() call itself, and a listener attached afterwards would miss it
  // and always pay the timeout.
  const subscription = recorder.addListener("recordingStatusUpdate", (status) => {
    if (!status.isFinished) return;
    settle?.(status.url);
  });

  const finished = new Promise<string | null>((resolve) => {
    settle = (url) => {
      settle = null;
      if (timer) clearTimeout(timer);
      resolve(url);
    };
    timer = setTimeout(() => settle?.(null), timeoutMs);
  });

  try {
    await recorder.stop();
    // `stop()` rejecting is a real failure the caller must see, so it is not
    // caught here — but the listener and timer still have to be released,
    // which is what the finally block is for.
    const finishedUrl = await finished;
    return finishedUrl ?? recorder.uri;
  } finally {
    if (timer) clearTimeout(timer);
    subscription.remove();
  }
}
