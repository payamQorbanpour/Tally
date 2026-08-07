import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Value = {
  isRecording: boolean;
  /**
   * Publish the current recording state. `stop` is the teardown the FAB calls
   * when the user taps the stop square; it's held in a ref so a recorder whose
   * handler identity churns (duration ticks) doesn't re-render every consumer.
   */
  publish: (active: boolean, stop?: () => void) => void;
  requestStop: () => void;
};

const VoiceRecordingContext = createContext<Value | null>(null);

/**
 * App-wide "a voice note is being recorded right now" signal.
 *
 * Recording itself lives in `AiReceiptScreen`, but the control the user reaches
 * for is the FAB pill rendered above it by the navigator (`MainTabs.GlobalFab`)
 * or by a screen (`ui/FabPill`). This context is the thin bridge that lets the
 * pill swap its mic for a red stop square and drive the recorder's teardown,
 * without either side importing the other.
 */
export function VoiceRecordingProvider({ children }: { children: ReactNode }) {
  const [isRecording, setIsRecording] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);

  const publish = useCallback((active: boolean, stop?: () => void) => {
    stopRef.current = active ? (stop ?? null) : null;
    setIsRecording(active);
  }, []);

  const requestStop = useCallback(() => {
    stopRef.current?.();
  }, []);

  const value = useMemo(
    () => ({ isRecording, publish, requestStop }),
    [isRecording, publish, requestStop],
  );

  return (
    <VoiceRecordingContext.Provider value={value}>
      {children}
    </VoiceRecordingContext.Provider>
  );
}

/**
 * Read side for FAB pills. Safe outside the provider — reports "not recording"
 * with a no-op stop, so a pill rendered in isolation keeps its plain mic
 * behaviour instead of crashing.
 */
export function useVoiceRecordingIndicator(): {
  isRecording: boolean;
  requestStop: () => void;
} {
  const v = useContext(VoiceRecordingContext);
  const noopStop = useCallback(() => {}, []);
  return v
    ? { isRecording: v.isRecording, requestStop: v.requestStop }
    : { isRecording: false, requestStop: noopStop };
}

/** Write side for the screen that owns the recorder. No-op outside the provider. */
export function useVoiceRecordingPublisher(): Value["publish"] {
  const v = useContext(VoiceRecordingContext);
  const noop = useCallback(() => {}, []);
  return v?.publish ?? noop;
}
