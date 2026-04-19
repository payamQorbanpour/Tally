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
import { createTallySupabaseClient } from "./supabaseClient";

export type SupabaseSessionContextValue = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signInWithPassword: (
    email: string,
    password: string,
  ) => Promise<{ error: Error | null }>;
  signUpWithPassword: (
    email: string,
    password: string,
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
      if (!client) return { error: new Error("Supabase is not configured") };
      const { error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return { error: error ? new Error(error.message) : null };
    },
    [],
  );

  const signUpWithPassword = useCallback(
    async (email: string, password: string) => {
      const client = createTallySupabaseClient();
      if (!client) return { error: new Error("Supabase is not configured") };
      const { error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: getAuthEmailRedirectUrl(),
        },
      });
      return { error: error ? new Error(error.message) : null };
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
      signOut,
    }),
    [session, loading, signInWithPassword, signUpWithPassword, signOut],
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
