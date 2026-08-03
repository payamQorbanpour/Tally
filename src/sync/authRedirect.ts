import { Platform } from "react-native";
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
 * URL Supabase redirects to after an OAuth round-trip (Google / Apple browser flow).
 * On native this MUST be the app scheme (`tally://auth/callback`) so the system
 * browser hands control back to the app. Using a web URL here sends the user to
 * the website instead of returning to the app.
 *
 * Why: Supabase email links open in a browser and need an https landing page,
 * but OAuth is in-app — the two cases need different redirect targets even
 * though both go through `signInWithOAuth({ redirectTo })`.
 */
export function getAuthOAuthRedirectUrl(): string {
  if (Platform.OS !== "web") return Linking.createURL("auth/callback");
  const fromEnv = trim(process.env.EXPO_PUBLIC_AUTH_OAUTH_REDIRECT);
  if (fromEnv) return fromEnv;
  return Linking.createURL("auth/callback");
}

/** Lowercased, fragment- and query-free form of a URL, for comparing origins. */
function normalizeCallbackUrl(raw: string): string | null {
  const base = (raw.split("#")[0] ?? "").split("?")[0] ?? "";
  const trimmed = base.trim().replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
}

/**
 * Whether a deep link is one Supabase could legitimately have sent us back on
 * — i.e. it matches, exactly, a URL this app itself handed to `redirectTo`.
 *
 * Worth being strict: the callback handler turns a URL into a *session*, so
 * anything reaching it chooses who the user is signed in as. Previously any
 * link at all carrying `#access_token=…` was honoured, so a web page or a QR
 * code could silently swap the victim into an attacker-controlled account and
 * let the next sync push the victim's data there.
 *
 * Note this rejects the misconfigured `http://localhost:3000/#access_token=…`
 * shape that a dashboard with an unset Site URL produces. That link cannot
 * open the app on a device anyway — fix the Site URL rather than loosen this.
 */
export function isTrustedAuthCallbackUrl(rawUrl: string): boolean {
  const incoming = normalizeCallbackUrl(rawUrl);
  if (!incoming) return false;
  return [getAuthOAuthRedirectUrl(), getAuthEmailRedirectUrl()]
    .map(normalizeCallbackUrl)
    .some((trusted) => trusted !== null && trusted === incoming);
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

/**
 * Whether to render "Sign in with Apple". App Store **requires** Apple as a
 * peer to any third-party social login (the parity rule), so flip this on
 * whenever {@link isGoogleAuthEnabled} is on for an iOS build.
 *
 * Backend setup needed before flipping on: Supabase → Authentication →
 * Providers → Apple (Service ID + Apple Team ID + key ID + .p8 contents),
 * plus the iOS bundle id capability + app.json `ios.usesAppleSignIn: true`
 * for the native flow to work (the web/Android browser flow already works
 * once the Supabase side is configured).
 */
export function isAppleAuthEnabled(): boolean {
  return trim(process.env.EXPO_PUBLIC_AUTH_APPLE_ENABLED) === "1";
}
