import type { Session, User } from "@supabase/supabase-js";
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
import { AppState, Linking, Platform, type AppStateStatus } from "react-native";
import { getAuthEmailRedirectUrl, getAuthOAuthRedirectUrl } from "../sync/authRedirect";
import { guardNetworkCall } from "../core/networkGuard";
import { createTallySupabaseClient } from "./supabaseClient";

/** Milliseconds; sign-in and sign-up fail with {@link TALLY_AUTH_REQUEST_TIMED_OUT} if not finished in this time. */
export const AUTH_PASSWORD_REQUEST_TIMEOUT_MS = 25_000;
/** `error.message` from sign-in / sign-up when the request does not complete in time. */
export const TALLY_AUTH_REQUEST_TIMED_OUT = "TALLY_AUTH_REQUEST_TIMED_OUT";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      reject(new Error(TALLY_AUTH_REQUEST_TIMED_OUT));
    }, ms);
    void promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

export type SupabaseSessionContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; emailConfirmed: boolean }>;
  /**
   * `newAccount` is `false` when Supabase's email enumeration protection
   * hid the fact that this email already has an account (`data.user.identities`
   * is empty). Callers should treat that as "account exists" (likely wrong
   * password on the preceding sign-in) rather than "welcome new user".
   *
   * `emailConfirmed` reflects `auth.users.email_confirmed_at` on the returned
   * row — `false` when Supabase auto-creates a session but still requires the
   * user to click the verification link before the email is trusted.
   */
  signUpWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null; newAccount: boolean; emailConfirmed: boolean }>;
  resetPasswordForEmail: (email: string) => Promise<{ error: Error | null }>;
  /** Re-send the sign-up confirmation email for a given address. */
  resendEmailConfirmation: (
    email: string,
  ) => Promise<{ error: Error | null }>;
  /**
   * Start Google OAuth. Web: Supabase navigates the page to Google and back
   * to `redirectTo` (we let `detectSessionInUrl` finish the dance). Native:
   * Supabase returns the OAuth URL, we hand it to the system browser via
   * `Linking.openURL`, and the resulting `tally://auth/callback#…` redirect
   * is picked up by `AuthCallbackDeepLinkHandler`.
   */
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  /**
   * Start Apple Sign In. iOS native: hand the credential's `identityToken`
   * straight to `signInWithIdToken` (the native flow stays inside the app —
   * no system browser, no deep link round-trip). Web/Android: fall back to
   * `signInWithOAuth` and the browser-based flow used for Google.
   *
   * Caller must check {@link isAppleAuthEnabled} before showing the button:
   * the Supabase Apple provider has to be configured in the dashboard, AND
   * for native we need `expo-apple-authentication` installed + `ios.usesAppleSignIn`
   * enabled in app.json. We dynamic-import the native module so a misconfigured
   * dev build returns a clean error instead of failing to load.
   */
  signInWithApple: () => Promise<{ error: Error | null }>;
  /**
   * Force-refresh the cached `user` (and `session`) from Supabase. Call this
   * after the user clicks the email confirmation link in their browser so the
   * "Not verified" badge in Account settings flips to "Verified" without
   * requiring a sign-out / sign-in cycle.
   */
  refreshUser: () => Promise<void>;
  signOut: () => Promise<void>;
};

const SupabaseSessionContext = createContext<SupabaseSessionContextValue | null>(
  null,
);

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const client = createTallySupabaseClient();
    if (!client) {
      setSession(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    void client.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s ?? null);
        setLoading(false);
      }
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const refreshUser = useCallback(async () => {
    const client = createTallySupabaseClient();
    if (!client) return;
    try {
      // `getUser()` round-trips to GoTrue and updates the cached user. The
      // session row in storage carries `user.email_confirmed_at`, so after
      // the round-trip we re-read the local session and push it through
      // `setSession` — `onAuthStateChange` does not fire for getUser alone.
      const { data: userData, error: userErr } = await client.auth.getUser();
      if (userErr || !userData?.user) return;
      const { data: sessionData } = await client.auth.getSession();
      const next = sessionData?.session ?? null;
      if (next) {
        setSession({ ...next, user: userData.user });
      }
    } catch {
      /* best-effort: stale verified badge will simply persist until next refresh */
    }
  }, []);

  // Refresh the user when the app returns to foreground — the typical path is
  // the user tapping the email confirmation link in their browser, switching
  // back to Tally, and expecting the "Not verified" badge to flip to
  // "Verified". Skip if there is no active session to refresh.
  const lastRefreshAtRef = useRef(0);
  useEffect(() => {
    const FOREGROUND_REFRESH_MIN_GAP_MS = 5_000;
    const onChange = (next: AppStateStatus) => {
      if (next !== "active") return;
      if (!session) return;
      const now = Date.now();
      if (now - lastRefreshAtRef.current < FOREGROUND_REFRESH_MIN_GAP_MS) return;
      lastRefreshAtRef.current = now;
      void refreshUser();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => sub.remove();
  }, [session, refreshUser]);

  const signInWithPassword = useCallback(
    async (email: string, password: string) => {
      const client = createTallySupabaseClient();
      if (!client) {
        return {
          error: new Error("Supabase is not configured"),
          emailConfirmed: false,
        };
      }
      try {
        const { data, error } = await guardNetworkCall(() =>
          withTimeout(
            client.auth.signInWithPassword({
              email: email.trim(),
              password,
            }),
            AUTH_PASSWORD_REQUEST_TIMEOUT_MS,
          ),
        );
        const emailConfirmed = Boolean(
          (data?.user as { email_confirmed_at?: string | null } | null)
            ?.email_confirmed_at,
        );
        return {
          error: error ? new Error(error.message) : null,
          emailConfirmed,
        };
      } catch (e) {
        return {
          error: e instanceof Error ? e : new Error(String(e)),
          emailConfirmed: false,
        };
      }
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      const client = createTallySupabaseClient();
      if (!client) {
        return {
          error: new Error("Supabase is not configured"),
          newAccount: false,
          emailConfirmed: false,
        };
      }
      try {
        const { data, error } = await guardNetworkCall(() =>
          withTimeout(
            client.auth.signUp({
              email: email.trim(),
              password,
              options: {
                emailRedirectTo: getAuthEmailRedirectUrl(),
              },
            }),
            AUTH_PASSWORD_REQUEST_TIMEOUT_MS,
          ),
        );
        // When email enumeration protection is on, Supabase returns a fake user
        // with no identities for already-registered emails. An actual new signup
        // always comes back with at least one identity.
        const identities = (data?.user as { identities?: unknown[] } | null)
          ?.identities;
        const newAccount = Array.isArray(identities) && identities.length > 0;
        const emailConfirmed = Boolean(
          (data?.user as { email_confirmed_at?: string | null } | null)
            ?.email_confirmed_at,
        );
        return {
          error: error ? new Error(error.message) : null,
          newAccount,
          emailConfirmed,
        };
      } catch (e) {
        return {
          error: e instanceof Error ? e : new Error(String(e)),
          newAccount: false,
          emailConfirmed: false,
        };
      }
    },
    [],
  );

  const resetPasswordForEmail = useCallback(
    async (email: string) => {
      const client = createTallySupabaseClient();
      if (!client) return { error: new Error("Supabase is not configured") };
      try {
        const { error } = await guardNetworkCall(() =>
          withTimeout(
            client.auth.resetPasswordForEmail(email.trim(), {
              redirectTo: getAuthEmailRedirectUrl(),
            }),
            AUTH_PASSWORD_REQUEST_TIMEOUT_MS,
          ),
        );
        return { error: error ? new Error(error.message) : null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(async () => {
    const client = createTallySupabaseClient();
    if (!client) return { error: new Error("Supabase is not configured") };
    try {
      const isNative = Platform.OS !== "web";
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: getAuthOAuthRedirectUrl(),
          // On native, hold the redirect — we open the URL ourselves so
          // the system browser is in charge and the resulting
          // `tally://auth/callback#access_token=…` round-trips through
          // `AuthCallbackDeepLinkHandler`. On web, let Supabase navigate
          // the page directly.
          skipBrowserRedirect: isNative,
        },
      });
      if (error) return { error: new Error(error.message) };
      if (isNative) {
        const url = data?.url;
        if (!url) return { error: new Error("No OAuth URL returned") };
        try {
          await Linking.openURL(url);
        } catch (e) {
          return { error: e instanceof Error ? e : new Error(String(e)) };
        }
      }
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, []);

  const signInWithApple = useCallback(async () => {
    const client = createTallySupabaseClient();
    if (!client) return { error: new Error("Supabase is not configured") };

    // iOS: native sheet via expo-apple-authentication. The dynamic import
    // means an Android / web / dev-without-the-module build still compiles
    // and falls through to the browser flow below.
    if (Platform.OS === "ios") {
      try {
        // eslint-disable-next-line import/no-unresolved
        const Apple = await import("expo-apple-authentication");
        if (await Apple.isAvailableAsync()) {
          const credential = await Apple.signInAsync({
            requestedScopes: [
              Apple.AppleAuthenticationScope.FULL_NAME,
              Apple.AppleAuthenticationScope.EMAIL,
            ],
          });
          const idToken = credential.identityToken;
          if (!idToken) {
            return { error: new Error("Apple did not return an identity token") };
          }
          const { error } = await client.auth.signInWithIdToken({
            provider: "apple",
            token: idToken,
          });
          return { error: error ? new Error(error.message) : null };
        }
      } catch (e) {
        // ERR_REQUEST_CANCELED: user dismissed the sheet — not an error to surface.
        const code =
          (e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : undefined) ?? "";
        if (code === "ERR_REQUEST_CANCELED") return { error: null };
        // Any other failure (module missing, capability disabled, etc.) →
        // fall through to the OAuth browser flow.
      }
    }

    // Non-iOS or native sheet unavailable: standard OAuth round-trip.
    try {
      const isNative = Platform.OS !== "web";
      const { data, error } = await client.auth.signInWithOAuth({
        provider: "apple",
        options: {
          redirectTo: getAuthOAuthRedirectUrl(),
          skipBrowserRedirect: isNative,
        },
      });
      if (error) return { error: new Error(error.message) };
      if (isNative) {
        const url = data?.url;
        if (!url) return { error: new Error("No OAuth URL returned") };
        try {
          await Linking.openURL(url);
        } catch (e) {
          return { error: e instanceof Error ? e : new Error(String(e)) };
        }
      }
      return { error: null };
    } catch (e) {
      return { error: e instanceof Error ? e : new Error(String(e)) };
    }
  }, []);

  const resendEmailConfirmation = useCallback(
    async (email: string) => {
      const client = createTallySupabaseClient();
      if (!client) return { error: new Error("Supabase is not configured") };
      try {
        const { error } = await guardNetworkCall(() =>
          withTimeout(
            client.auth.resend({
              type: "signup",
              email: email.trim(),
              options: { emailRedirectTo: getAuthEmailRedirectUrl() },
            }),
            AUTH_PASSWORD_REQUEST_TIMEOUT_MS,
          ),
        );
        return { error: error ? new Error(error.message) : null };
      } catch (e) {
        return { error: e instanceof Error ? e : new Error(String(e)) };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    const client = createTallySupabaseClient();
    if (!client) return;
    await client.auth.signOut();
  }, []);

  const value = useMemo<SupabaseSessionContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      resendEmailConfirmation,
      signInWithGoogle,
      signInWithApple,
      refreshUser,
      signOut,
    }),
    [
      session,
      loading,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      resendEmailConfirmation,
      signInWithGoogle,
      signInWithApple,
      refreshUser,
      signOut,
    ],
  );

  return (
    <SupabaseSessionContext.Provider value={value}>
      {children}
    </SupabaseSessionContext.Provider>
  );
}

export function useSupabaseSession(): SupabaseSessionContextValue {
  const v = useContext(SupabaseSessionContext);
  if (!v) {
    throw new Error("useSupabaseSession requires SupabaseSessionProvider");
  }
  return v;
}
