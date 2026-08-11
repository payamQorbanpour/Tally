import { describe, expect, it } from "vitest";
import {
  stopAndResolveRecordingUri,
  type RecorderLike,
  type RecordingStatusLike,
} from "./stopAndResolveRecordingUri";

/**
 * Fake recorder standing in for expo-audio's `AudioRecorder`. `emit` lets a
 * test fire `recordingStatusUpdate` at a chosen moment, which is the whole
 * point: the bug this module exists for is about WHEN the finished URL
 * becomes available.
 */
function fakeRecorder(opts: {
  uri?: string | null;
  onStop?: (emit: (status: RecordingStatusLike) => void) => void;
}): RecorderLike & { removed: () => number } {
  let removeCount = 0;
  const listeners: ((status: RecordingStatusLike) => void)[] = [];
  const emit = (status: RecordingStatusLike) => {
    for (const l of [...listeners]) l(status);
  };
  return {
    uri: opts.uri ?? null,
    stop: async () => {
      opts.onStop?.(emit);
    },
    addListener: (_event, cb) => {
      listeners.push(cb);
      return {
        remove: () => {
          removeCount += 1;
          const i = listeners.indexOf(cb);
          if (i >= 0) listeners.splice(i, 1);
        },
      };
    },
    removed: () => removeCount,
  };
}

describe("stopAndResolveRecordingUri", () => {
  it("returns the finished recording's url, not the pre-stop uri", async () => {
    const recorder = fakeRecorder({
      uri: "file:///will-be-saved.m4a",
      onStop: (emit) => emit({ isFinished: true, url: "file:///completed.m4a" }),
    });
    await expect(stopAndResolveRecordingUri(recorder, 50)).resolves.toBe("file:///completed.m4a");
  });

  it("waits for a status that arrives after stop() resolves", async () => {
    // The failure this guards: native stop() resolving before the encoder has
    // flushed, so the file is read while still being written.
    const recorder = fakeRecorder({
      uri: "file:///will-be-saved.m4a",
      onStop: (emit) => {
        setTimeout(() => emit({ isFinished: true, url: "file:///completed.m4a" }), 10);
      },
    });
    await expect(stopAndResolveRecordingUri(recorder, 200)).resolves.toBe("file:///completed.m4a");
  });

  it("ignores non-final status updates", async () => {
    const recorder = fakeRecorder({
      uri: "file:///will-be-saved.m4a",
      onStop: (emit) => {
        emit({ isFinished: false, url: null });
        setTimeout(() => emit({ isFinished: true, url: "file:///completed.m4a" }), 10);
      },
    });
    await expect(stopAndResolveRecordingUri(recorder, 200)).resolves.toBe("file:///completed.m4a");
  });

  it("falls back to recorder.uri when no finished status ever arrives", async () => {
    // A platform that finalizes synchronously may never emit after we
    // subscribe. Degrading to today's behaviour beats losing the recording.
    const recorder = fakeRecorder({ uri: "file:///will-be-saved.m4a" });
    await expect(stopAndResolveRecordingUri(recorder, 20)).resolves.toBe(
      "file:///will-be-saved.m4a",
    );
  });

  it("falls back to recorder.uri when the finished status carries no url", async () => {
    const recorder = fakeRecorder({
      uri: "file:///will-be-saved.m4a",
      onStop: (emit) => emit({ isFinished: true, url: null }),
    });
    await expect(stopAndResolveRecordingUri(recorder, 50)).resolves.toBe(
      "file:///will-be-saved.m4a",
    );
  });

  it("returns null when there is no url anywhere", async () => {
    const recorder = fakeRecorder({ uri: null });
    await expect(stopAndResolveRecordingUri(recorder, 20)).resolves.toBeNull();
  });

  it("removes its listener on every path", async () => {
    const resolved = fakeRecorder({
      uri: null,
      onStop: (emit) => emit({ isFinished: true, url: "file:///completed.m4a" }),
    });
    await stopAndResolveRecordingUri(resolved, 50);
    expect(resolved.removed(), "listener leaked on the resolved path").toBe(1);

    const timedOut = fakeRecorder({ uri: "file:///will-be-saved.m4a" });
    await stopAndResolveRecordingUri(timedOut, 20);
    expect(timedOut.removed(), "listener leaked on the timeout path").toBe(1);
  });

  it("propagates a stop() failure instead of masking it", async () => {
    const recorder: RecorderLike = {
      uri: "file:///will-be-saved.m4a",
      stop: async () => {
        throw new Error("native stop failed");
      },
      addListener: () => ({ remove: () => {} }),
    };
    await expect(stopAndResolveRecordingUri(recorder, 20)).rejects.toThrow("native stop failed");
  });

  it("does not wait for the full timeout once the status arrives", async () => {
    const recorder = fakeRecorder({
      uri: null,
      onStop: (emit) => emit({ isFinished: true, url: "file:///completed.m4a" }),
    });
    const started = Date.now();
    await stopAndResolveRecordingUri(recorder, 5_000);
    expect(Date.now() - started).toBeLessThan(1_000);
  });
});
