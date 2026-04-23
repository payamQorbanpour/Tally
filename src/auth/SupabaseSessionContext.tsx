import type { Session, User } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getAuthEmailRedirectUrl } from "../sync/authRedirect";
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
      signOut,
    }),
    [
      session,
      loading,
      signInWithPassword,
      signUpWithPassword,
      resetPasswordForEmail,
      resendEmailConfirmation,
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
