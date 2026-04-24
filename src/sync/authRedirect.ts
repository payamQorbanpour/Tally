import * as Linking from "expo-linking";

const trim = (v: string | undefined) => (v ? v.trim() : undefined);

/**
 * URL Supabase appends to confirmation / recovery links (`redirect_to`).
 * Set `EXPO_PUBLIC_AUTH_EMAIL_REDIRECT` for production (https://… or your app scheme).
 * Otherwise uses Expo’s linking helper so it matches `scheme` in `app.json` (e.g. `tally://…`),
 * not the dashboard default Site URL (often `http://localhost:3000`).
 */
export function getAuthEmailRedirectUrl(): string {
  const fromEnv = trim(process.env.EXPO_PUBLIC_AUTH_EMAIL_REDIRECT);
  if (fromEnv) return fromEnv;
  return Linking.createURL("auth/callback");
}

/**
 * Whether to render the "Continue with Google" button on the auth screen.
 * Off by default — flip on with `EXPO_PUBLIC_AUTH_GOOGLE_ENABLED=1` once the
 * Google provider is configured in the Supabase dashboard (Authentication →
 * Providers → Google) and the OAuth client ID/secret are pasted in. Without
 * that backend setup the button would just open a Supabase error page.
 */
export function isGoogleAuthEnabled(): boolean {
  return trim(process.env.EXPO_PUBLIC_AUTH_GOOGLE_ENABLED) === "1";
}
