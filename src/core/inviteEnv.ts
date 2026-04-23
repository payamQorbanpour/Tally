/**
 * Configuration for group-invite share / QR.
 *
 * The Share screen renders a QR encoding the result of {@link buildInviteUrl}.
 * The Scan screen decodes a QR back into a URL and forwards it to
 * {@link extractInviteToken} (handled in `InviteDeepLinkHandler`).
 *
 * Env vars (set in `.env`, see `.env.example`):
 *   - `EXPO_PUBLIC_INVITE_BASE_URL`: web landing page that resolves invites.
 *     Final URL becomes `${EXPO_PUBLIC_INVITE_BASE_URL}/<token>`.
 *   - `EXPO_PUBLIC_INVITE_DEEP_LINK`: app deep-link prefix (defaults to
 *     `tally://group-invite`).
 */

const DEFAULT_DEEP_LINK = "tally://group-invite";

function trim(s: string | undefined | null): string {
  return (s ?? "").trim();
}

export function getInviteWebBaseUrl(): string | null {
  const u = trim(process.env.EXPO_PUBLIC_INVITE_BASE_URL);
  if (!u) return null;
  return u.replace(/\/+$/, "");
}

export function getInviteDeepLinkPrefix(): string {
  const u = trim(process.env.EXPO_PUBLIC_INVITE_DEEP_LINK);
  return u.length > 0 ? u : DEFAULT_DEEP_LINK;
}

/**
 * Build the URL embedded in the QR code for a *group invite*. Prefers the
 * configured web URL so users without the app installed land on a page that
 * can offer the App Store / Play Store / web-app choice. Falls back to the
 * raw deep link.
 */
export function buildInviteUrl(token: string): string {
  const safe = encodeURIComponent(token);
  const web = getInviteWebBaseUrl();
  if (web) return `${web}/${safe}`;
  return `${getInviteDeepLinkPrefix()}?token=${safe}`;
}

/**
 * Build the URL embedded in the QR code for an *expense invite*. Same web /
 * deep-link fallback story as group invites; the landing page is expected to
 * route `<base>/expense/<id>` to the expense screen in the app or web app.
 *
 * Tip for the landing page: keep the same host so a single
 * apple-app-site-association / assetlinks.json covers both.
 */
export function buildExpenseInviteUrl(expenseId: string): string {
  const safe = encodeURIComponent(expenseId);
  const web = getInviteWebBaseUrl();
  if (web) return `${web.replace(/\/join$/, "")}/expense/${safe}`;
  return `${getInviteDeepLinkPrefix().replace(
    /group-invite$/,
    "expense-invite",
  )}?id=${safe}`;
}

/**
 * Extract an invite token from a URL we built (or from a deep link delivered
 * to the app). Returns `null` if the URL doesn't look like one of ours.
 */
export function parseInviteTokenFromScannedUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // tally://group-invite?token=…  (or any custom scheme set via env)
  const queryMatch = /[?&]token=([^&]+)/i.exec(trimmed);
  if (queryMatch && queryMatch[1]) {
    try {
      return decodeURIComponent(queryMatch[1]);
    } catch {
      return queryMatch[1];
    }
  }
  // https://<host>/.../<token>   — token is the last non-empty path segment.
  const web = getInviteWebBaseUrl();
  if (web && trimmed.toLowerCase().startsWith(web.toLowerCase())) {
    const rest = trimmed.slice(web.length).split("?")[0] ?? "";
    const segs = rest.split("/").filter(Boolean);
    const last = segs[segs.length - 1];
    if (last) {
      try {
        return decodeURIComponent(last);
      } catch {
        return last;
      }
    }
  }
  return null;
}
