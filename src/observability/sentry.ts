import Constants from "expo-constants";
// eslint-disable-next-line import/no-unresolved -- resolves after `npm install @sentry/react-native`.
import * as Sentry from "@sentry/react-native";
import type { ErrorInfo } from "react";

/**
 * React Navigation routing-instrumentation singleton. Created once at
 * import time so we can both pass it to `Sentry.init` (via integrations)
 * and call `routingInstrumentation.registerNavigationContainer` from
 * `App.tsx` once the `NavigationContainer` ref is available.
 */
export const sentryRoutingInstrumentation =
  Sentry.reactNavigationIntegration({
    enableTimeToInitialDisplay: true,
  });

let initialized = false;

/**
 * Initialize Sentry for crash + error reporting. Safe to call multiple
 * times — the second invocation is a no-op. Reads the DSN from the
 * `EXPO_PUBLIC_SENTRY_DSN` env var; if unset (e.g. local dev without
 * the env file), Sentry is silently disabled so the app still runs.
 *
 * Source-map upload happens at build time via the
 * `@sentry/react-native/expo` config plugin (configured in
 * `app.config.js`) — we don't do anything here for that.
 */
export function initSentry(): void {
  if (initialized) return;
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (process.env["NODE_ENV"] !== "production") {
      console.warn(
        "[sentry] EXPO_PUBLIC_SENTRY_DSN is not set — error reporting is disabled.",
      );
    }
    return;
  }

  const release =
    Constants.expoConfig?.version ??
    Constants.manifest2?.extra?.expoClient?.version ??
    "unknown";
  const dist =
    process.env["EAS_BUILD_PROFILE"] ??
    process.env["NODE_ENV"] ??
    "development";

  Sentry.init({
    dsn,
    // Sample low for now to keep volume / cost down; bump after launch.
    tracesSampleRate: 0.1,
    // Keep PII off by default — Tally collects emails, names, expense
    // descriptions; opt the user in later if we ever want richer reports.
    sendDefaultPii: false,
    enableNative: true,
    release: `tally@${release}`,
    dist,
    integrations: [sentryRoutingInstrumentation],
    enableAutoPerformanceTracing: true,
  });

  initialized = true;

  // `@sentry/react-native` doesn't re-export `captureConsoleIntegration`
  // from the browser SDK, so wrap `console.warn` / `console.error`
  // manually. Forwarding them as Sentry events with the matching severity
  // means warnings and errors users hit show up alongside crashes.
  installConsoleForwarders();
}

let consoleForwardersInstalled = false;

function installConsoleForwarders(): void {
  if (consoleForwardersInstalled) return;
  consoleForwardersInstalled = true;

  const formatArgs = (args: unknown[]): string =>
    args
      .map((a) => {
        if (a instanceof Error) return a.message;
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      })
      .join(" ");

  const wrap = (level: "warning" | "error", original: typeof console.warn) =>
    function patched(...args: unknown[]) {
      original(...args);
      try {
        // Prefer captureException if the first arg is already an Error so
        // Sentry can group on its native stack instead of a synthesized one.
        const firstError = args.find((a): a is Error => a instanceof Error);
        if (firstError) {
          Sentry.captureException(firstError, (scope) => {
            scope.setLevel(level);
            return scope;
          });
          return;
        }
        // No real Error in the args list — synthesize one at the call site
        // so Sentry has a stack to point at. Without this `Sentry.captureMessage`
        // events show up without any source location and you can't tell where
        // a "Split mismatch" warn was logged from.
        const message = formatArgs(args);
        const synthetic = new Error(message);
        synthetic.name = level === "warning" ? "ConsoleWarning" : "ConsoleError";
        Sentry.captureException(synthetic, (scope) => {
          scope.setLevel(level);
          // Surface the original arguments as context so the report shows
          // what was logged separate from the synthetic error wrapping.
          scope.setContext("console", {
            level,
            args: args.map((a) =>
              a instanceof Error ? a.stack ?? a.message : a,
            ),
          });
          return scope;
        });
      } catch {
        /* swallow — never throw from a console wrapper */
      }
    };

  /* eslint-disable no-console */
  console.warn = wrap("warning", console.warn);
  console.error = wrap("error", console.error);
  /* eslint-enable no-console */
}

/**
 * Capture an exception with optional React component-tree info from an
 * ErrorBoundary. No-ops cleanly when Sentry isn't initialized.
 */
export function captureError(error: Error, info?: ErrorInfo): void {
  if (!initialized) return;
  Sentry.captureException(error, (scope) => {
    if (info?.componentStack) {
      scope.setContext("react", { componentStack: info.componentStack });
    }
    return scope;
  });
}

/**
 * Tag the current Sentry scope with the signed-in user's identity so
 * reports are filterable by user. Call after sign-in / sign-out.
 *
 * Sentry's `sendDefaultPii: false` only blocks IP / cookie / device-id
 * capture; values passed here are explicit, opt-in fields.
 */
export function setSentryUser(
  user: {
    id: string;
    email?: string | null;
    username?: string | null;
    /** Local SQLite profile id (separate from Supabase auth uid). */
    localUserId?: string | null;
  } | null,
): void {
  if (!initialized) return;
  if (!user) {
    Sentry.setUser(null);
    Sentry.setTag("local_user_id", undefined as unknown as string);
    return;
  }
  const payload: { id: string; email?: string; username?: string } = {
    id: user.id,
  };
  if (user.email) payload.email = user.email;
  if (user.username) payload.username = user.username;
  Sentry.setUser(payload);
  if (user.localUserId) {
    // Distinct from the auth uid — useful for correlating a crash to a
    // device-local row when the user was offline-only at the time.
    Sentry.setTag("local_user_id", user.localUserId);
  }
}

/**
 * Attach static app/device context once at startup. Sentry's React Native
 * SDK already auto-collects device hardware (model, OS, locale, free
 * RAM, network type) via the native side — this fills the gaps that
 * are JS-side: bundle release channel, EAS profile, locale at boot.
 */
export function setSentryAppContext(ctx: {
  appVersion?: string;
  releaseChannel?: string;
  locale?: string;
  isPremium?: boolean;
}): void {
  if (!initialized) return;
  Sentry.setContext("app", {
    version: ctx.appVersion ?? null,
    release_channel: ctx.releaseChannel ?? null,
    locale: ctx.locale ?? null,
    is_premium: ctx.isPremium ?? false,
  });
  if (ctx.releaseChannel) Sentry.setTag("release_channel", ctx.releaseChannel);
  if (ctx.locale) Sentry.setTag("locale", ctx.locale);
  if (typeof ctx.isPremium === "boolean") {
    Sentry.setTag("is_premium", ctx.isPremium ? "yes" : "no");
  }
}

/** Re-exported so callers can wrap the root component. */
export const wrapWithSentry = Sentry.wrap;
