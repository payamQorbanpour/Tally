import * as Linking from "expo-linking";
import { useEffect } from "react";
import { createTallySupabaseClient } from "../auth/supabaseClient";
import { useSupabaseSession } from "../auth/SupabaseSessionContext";
import { useOnboarding } from "../providers/OnboardingContext";
import { isTrustedAuthCallbackUrl } from "../sync/authRedirect";
import { navigationRef } from "./navigationRef";

type AuthTokens = {
  access_token: string;
  refresh_token: string;
};

/**
 * Extract the PKCE authorization code from a callback URL — `?code=…` in the
 * query string. This is what the client now receives (see `flowType: "pkce"`
 * in `supabaseClient.ts`); it is single-use and can only be redeemed with the
 * verifier held in this app's own storage, so intercepting the redirect gains
 * an attacker nothing.
 */
export function parseAuthCallbackCode(rawUrl: string): string | null {
  const beforeFragment = rawUrl.split("#")[0] ?? "";
  const qIdx = beforeFragment.indexOf("?");
  if (qIdx < 0) return null;
  const code = new URLSearchParams(beforeFragment.slice(qIdx + 1)).get("code");
  return code && code.length > 0 ? code : null;
}

/**
 * Extract Supabase auth tokens from a callback URL. Supabase returns the
 * tokens in the URL *fragment* (after `#`), not the query string — e.g.
 * `tally://auth/callback#access_token=…&refresh_token=…&type=signup`.
 *
 * Retained for links minted before the switch to PKCE, and for email
 * templates still using the token shape. Callers must gate this on
 * {@link isTrustedAuthCallbackUrl} — a fragment full of tokens is a whole
 * session, so honouring one from an arbitrary URL lets any web page or QR
 * code decide who the user is signed in as.
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
 * credential to Supabase — `exchangeCodeForSession` for a PKCE `?code=`, or
 * `setSession` for the older token fragment — and nudges the session provider
 * to reflect the now-verified user. Without this the credential lands in the
 * URL but the local session never learns the email was confirmed, so the
 * Account screen keeps rendering "Not verified".
 *
 * Only URLs matching a redirect this app registered are honoured; see
 * {@link isTrustedAuthCallbackUrl}.
 */
export function AuthCallbackDeepLinkHandler() {
  const { refreshUser } = useSupabaseSession();
  const { markOnboardingDone } = useOnboarding();

  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      // Only URLs we ourselves registered as `redirectTo` may establish a
      // session. Everything else — including an invite QR smuggling a
      // `#access_token=…` fragment — is ignored.
      if (!isTrustedAuthCallbackUrl(url)) return;
      const code = parseAuthCallbackCode(url);
      const tokens = code ? null : parseAuthCallbackTokens(url);
      if (!code && !tokens) return;
      const client = createTallySupabaseClient();
      if (!client) return;
      void (async () => {
        try {
          const { error } = code
            ? await client.auth.exchangeCodeForSession(code)
            : await client.auth.setSession(tokens!);
          // A failed exchange must not fall through to "signed in": otherwise
          // we would mark onboarding done and reset to Main with no session.
          if (error) return;
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
