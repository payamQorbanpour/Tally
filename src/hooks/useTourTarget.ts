import { useCallback, useEffect, useRef } from "react";
import { InteractionManager, type View } from "react-native";
import { useTour, type TourStep } from "../providers/TourContext";

/**
 * Marks a `View` as the anchor for a given tour step. Returns:
 *
 *  - `ref`: attach to the target `<View>` (or any RN component that exposes
 *           `measureInWindow`).
 *  - `onLayout`: pass to the same component so we re-measure when its
 *           geometry changes (rotation, font scale, RTL flip).
 *
 * The hook only registers when the tour is currently *on* this step, and
 * unregisters on cleanup so stale rects can't be drawn against a different
 * screen later.
 */
export function useTourTarget(forStep: TourStep): {
  ref: React.RefObject<View | null>;
  onLayout: () => void;
} {
  const { step, registerTarget } = useTour();
  const ref = useRef<View>(null);
  const isActive = step === forStep;

  const measure = useCallback(() => {
    if (!ref.current) return;
    // Defer to after the current interaction so layout is settled (e.g., on
    // screen-transition completion the target's frame isn't valid yet).
    InteractionManager.runAfterInteractions(() => {
      ref.current?.measureInWindow((x, y, width, height) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (width <= 0 || height <= 0) return;
        registerTarget(forStep, { x, y, width, height });
      });
    });
  }, [forStep, registerTarget]);

  useEffect(() => {
    if (!isActive) return;
    measure();
    return () => {
      registerTarget(forStep, null);
    };
  }, [isActive, measure, forStep, registerTarget]);

  return { ref, onLayout: measure };
}
