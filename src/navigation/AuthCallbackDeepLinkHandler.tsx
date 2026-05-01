import * as Linking from "expo-linking";
import { useEffect } from "react";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { useOnboarding } from "../providers/OnboardingContext";
import { navigationRef } from "./navigationRef";

type AuthTokens = {
  access_token: string;
  refresh_token: string;
};

/**
 * Extract Supabase auth tokens from a callback URL. Supabase returns the
 * tokens in the URL *fragment* (after `#`), not the query string — e.g.
 * `tally://auth/callback#access_token=…&refresh_token=…&type=signup`. If
 * the dashboard Site URL hasn't been updated to the app scheme, the link
 * can also arrive as `http://localhost:3000/#access_token=…`; we still
 * extract tokens by fragment-matching rather than by path.
 */
export function parseAuthCallbackTokens(rawUrl: string): AuthTokens | null {
  const hashIdx = rawUrl.indexOf("#");
  if (hashIdx < 0) return null;
  const fragment = rawUrl.slice(hashIdx + 1).replace(/^\/+/, "");
  // `URLSearchParams` handles `&`-separated `k=v` pairs and URL-decoding.
  const params = new URLSearchParams(fragment);
  const access = params.get("access_token");
  const refresh = params.get("refresh_token");
  if (!access || !refresh) return null;
  return { access_token: access, refresh_token: refresh };
}

/**
 * Listens for auth callback deep links (`tally://auth/callback#…`) arriving
 * from the email confirmation / password-reset flow, hands the embedded
 * tokens to Supabase via `setSession`, and nudges the session provider to
 * reflect the now-verified user. Without this, tokens land in the URL but
 * the local session never learns the email was confirmed, so the Account
 * screen keeps rendering "Not verified".
 */
export function AuthCallbackDeepLinkHandler() {
  const { refreshUser } = useSupabaseSession();
  const { markOnboardingDone } = useOnboarding();

  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      const tokens = parseAuthCallbackTokens(url);
      if (!tokens) return;
      const client = createTallySupabaseClient();
      if (!client) return;
      void (async () => {
        try {
          await client.auth.setSession(tokens);
          await refreshUser();
          // The user just completed sign-in via Safari. If the deep link
          // returned us into the Onboarding stack (e.g. cold start from the
          // OAuth redirect), commit the onboarding flag and reset to Main —
          // otherwise `RootNavigator` keeps showing the "Let's get started"
          // slide because `onboardingDone` is still false.
          await markOnboardingDone();
          if (navigationRef.isReady()) {
            navigationRef.reset({ index: 0, routes: [{ name: "Main" }] });
          }
        } catch {
          /* best-effort: a stale link will simply no-op */
        }
      })();
    };
    void Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => sub.remove();
  }, [refreshUser, markOnboardingDone]);

  return null;
}
