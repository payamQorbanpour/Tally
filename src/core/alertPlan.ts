/**
 * How a native `Alert.alert(...)` should be rendered by the browser.
 *
 * `react-native-web` ships `Alert` as `class Alert { static alert() {} }` — an
 * outright no-op. Every one of the app's alerts is therefore invisible on the
 * web build, which is how a failing group-invite link came to look like
 * "nothing happened". This module decides what the browser equivalent is; the
 * `window.*` calls live in `src/ui/appAlert.ts`.
 */

export type AlertButtonLike = {
  text?: string;
  style?: "default" | "cancel" | "destructive";
};

export type WebAlertPlan =
  /** One acknowledgement. `window.alert`, then run button `index` (if any). */
  | { kind: "alert"; text: string; acceptIndex: number | null }
  /** A yes/no. `window.confirm`, then run `acceptIndex` or `cancelIndex`. */
  | { kind: "confirm"; text: string; acceptIndex: number; cancelIndex: number };

function joinText(title: string, message?: string): string {
  const t = (title ?? "").trim();
  const m = (message ?? "").trim();
  if (t && m) return `${t}\n\n${m}`;
  return t || m;
}

/**
 * `window.confirm` offers exactly two answers, so it is only usable when the
 * buttons are a clean accept/cancel pair. Anything else degrades to
 * `window.alert` running the action the user is most likely to have meant —
 * which for a 3-button prompt is nothing, so we pick no button at all rather
 * than firing a destructive one the user never chose.
 */
export function planWebAlert(
  title: string,
  message?: string,
  buttons?: readonly AlertButtonLike[],
): WebAlertPlan {
  const text = joinText(title, message);
  const list = buttons ?? [];

  if (list.length <= 1) {
    return { kind: "alert", text, acceptIndex: list.length === 1 ? 0 : null };
  }

  if (list.length === 2) {
    const cancelIndex = list.findIndex((b) => b.style === "cancel");
    if (cancelIndex >= 0) {
      return {
        kind: "confirm",
        text,
        acceptIndex: cancelIndex === 0 ? 1 : 0,
        cancelIndex,
      };
    }
    // Two buttons and neither is marked cancel: RN renders the *first* as the
    // dismissive one on iOS, so mirror that rather than guessing by label.
    return { kind: "confirm", text, acceptIndex: 1, cancelIndex: 0 };
  }

  return { kind: "alert", text, acceptIndex: null };
}
