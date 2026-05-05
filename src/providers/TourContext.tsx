import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { setSetting, SETTINGS_KEYS } from "../data/tallyRepo";
import { useTallyData } from "../db/DatabaseContext";

/**
 * Ordered list of tour steps. `null` means the tour is inactive (not started
 * or already finished). Adding a new step only requires extending this tuple
 * — the overlay and `useTourTarget` hook key off these strings.
 *
 * The first-run flow lands on the Add Expense screen, so the tour walks
 * through the surrounding affordances and `TourNavigationBridge` returns
 * the user to Add Expense once they finish or skip — the tour never needs
 * its own "this is the expense form" tooltip.
 */
export const TOUR_STEPS = ["fab", "ai", "qr"] as const;
export type TourStep = (typeof TOUR_STEPS)[number];

/** Window-coordinate rect produced by `View.measureInWindow`. */
export type TourTargetRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TourContextValue = {
  /** Currently visible step. `null` while the tour is hidden. */
  step: TourStep | null;
  /** Programmatically start at the first step. */
  start: () => void;
  /** Advance to the next step; if at the last step, finishes and persists. */
  next: () => void;
  /** Go back one step (no-op on the first step). */
  back: () => void;
  /** Skip the rest of the tour and persist `tour_done`. */
  skip: () => void;
  /** Anchor screens publish their target geometry through this. */
  registerTarget: (step: TourStep, rect: TourTargetRect | null) => void;
  /** Map of step → rect; consumed by the overlay to draw the cutout. */
  targets: Partial<Record<TourStep, TourTargetRect>>;
};

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const { db } = useTallyData();
  const [step, setStep] = useState<TourStep | null>(null);
  const [targets, setTargets] = useState<
    Partial<Record<TourStep, TourTargetRect>>
  >({});

  // Avoid persisting `tour_done` on every dismiss attempt — once the tour
  // has been marked done in this session, subsequent skip/done calls are
  // pure UI state changes.
  const persistedRef = useRef(false);

  const persistDone = useCallback(async () => {
    if (persistedRef.current) return;
    persistedRef.current = true;
    try {
      await setSetting(db, SETTINGS_KEYS.tourDone, "1");
    } catch {
      // Best-effort: if persistence fails the tour will replay next launch,
      // which is preferable to a hard crash on a non-critical UX flag.
    }
  }, [db]);

  const start = useCallback(() => {
    persistedRef.current = false;
    setStep(TOUR_STEPS[0]);
  }, []);

  const next = useCallback(() => {
    setStep((curr) => {
      if (curr === null) return null;
      const idx = TOUR_STEPS.indexOf(curr);
      const nextStep = TOUR_STEPS[idx + 1];
      if (!nextStep) {
        // Past the final step → tour finished.
        void persistDone();
        return null;
      }
      return nextStep;
    });
  }, [persistDone]);

  const back = useCallback(() => {
    setStep((curr) => {
      if (curr === null) return null;
      const idx = TOUR_STEPS.indexOf(curr);
      if (idx <= 0) return curr; // first step has no back
      return TOUR_STEPS[idx - 1] ?? curr;
    });
  }, []);

  const skip = useCallback(() => {
    void persistDone();
    setStep(null);
  }, [persistDone]);

  const registerTarget = useCallback(
    (forStep: TourStep, rect: TourTargetRect | null) => {
      setTargets((prev) => {
        if (rect === null) {
          if (!(forStep in prev)) return prev;
          const { [forStep]: _removed, ...rest } = prev;
          return rest;
        }
        const existing = prev[forStep];
        if (
          existing &&
          existing.x === rect.x &&
          existing.y === rect.y &&
          existing.width === rect.width &&
          existing.height === rect.height
        ) {
          return prev;
        }
        return { ...prev, [forStep]: rect };
      });
    },
    [],
  );

  const value = useMemo<TourContextValue>(
    () => ({ step, start, next, back, skip, registerTarget, targets }),
    [step, start, next, back, skip, registerTarget, targets],
  );

  return <TourContext.Provider value={value}>{children}</TourContext.Provider>;
}

export function useTour(): TourContextValue {
  const v = useContext(TourContext);
  if (!v) throw new Error("useTour requires <TourProvider>");
  return v;
}

/**
 * Bridge for screens that want the tour to auto-start on first focus.
 * Reads `tour_done` from SQLite once at mount; if unset, fires `start()`.
 * Only the host screen (Home) should call this — multiple callers would
 * race each other to start the tour.
 */
export function useAutoStartTour(opts: { enabled: boolean }): void {
  const { db } = useTallyData();
  const { start, step } = useTour();
  const triggeredRef = useRef(false);
  const enabled = opts.enabled;

  useEffect(() => {
    if (!enabled) return;
    if (triggeredRef.current) return;
    if (step !== null) return; // tour already running
    triggeredRef.current = true;
    void (async () => {
      try {
        const row = await db.getFirstAsync<{ value: string }>(
          `SELECT value FROM app_settings WHERE setting_key = ?`,
          SETTINGS_KEYS.tourDone,
        );
        if (row?.value === "1") return;
        start();
      } catch {
        // If the read fails (DB hiccup), don't auto-start — user can re-open
        // the tour manually from settings later if we add that affordance.
      }
    })();
  }, [enabled, db, start, step]);
}
