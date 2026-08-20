import { Alert, Platform, type AlertButton } from "react-native";
import { planWebAlert } from "../core/alertPlan";

/**
 * `Alert.alert` that also works in the browser.
 *
 * Drop-in for `Alert.alert`. On native it *is* `Alert.alert`; on web it uses
 * `window.alert` / `window.confirm`, because `react-native-web` implements
 * `Alert.alert` as an empty function — so every alert the app raises there is
 * silently swallowed, error paths included.
 *
 * See `src/core/alertPlan.ts` for how buttons map onto the browser's two
 * available shapes.
 */
export function showAlert(
  title: string,
  message?: string,
  buttons?: AlertButton[],
): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const plan = planWebAlert(title, message, buttons);
  const run = (i: number | null) => {
    if (i == null) return;
    buttons?.[i]?.onPress?.();
  };

  // No `window` at all (SSR / prerender): there is nobody to show this to, and
  // throwing here would take down whatever raised the alert.
  if (typeof window === "undefined") return;

  if (plan.kind === "confirm") {
    run(window.confirm(plan.text) ? plan.acceptIndex : plan.cancelIndex);
    return;
  }
  window.alert(plan.text);
  run(plan.acceptIndex);
}
