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
 * Discriminated result describing what a scanned invite URL refers to. Lets
 * callers branch between group-join and expense-join flows without re-parsing.
 */
export type ScannedInvite =
  | { kind: "group"; token: string }
  | { kind: "expense"; expenseId: string };

function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Extract an invite target from a URL we built (or from a deep link delivered
 * to the app). Returns `null` if the URL doesn't look like one of ours.
 *
 * Recognised shapes:
 *   - Group deep link:   `tally://group-invite?token=…`
 *   - Expense deep link: `tally://expense-invite?id=…`
 *   - Group web link:    `<base>/<token>`
 *   - Expense web link:  `<base>/expense/<id>`
 */
export function parseInviteTokenFromScannedUrl(
  raw: string,
): ScannedInvite | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Expense deep link: tally://expense-invite?id=<id>
  const expenseQuery = /[?&]id=([^&]+)/i.exec(trimmed);
  if (expenseQuery && /expense-invite/i.test(trimmed)) {
    return { kind: "expense", expenseId: decode(expenseQuery[1]!) };
  }

  // Group deep link: tally://group-invite?token=<t>
  const groupQuery = /[?&]token=([^&]+)/i.exec(trimmed);
  if (groupQuery && groupQuery[1]) {
    return { kind: "group", token: decode(groupQuery[1]) };
  }

  // Web links: <base>/expense/<id> or <base>/<token>
  const web = getInviteWebBaseUrl();
  if (web && trimmed.toLowerCase().startsWith(web.toLowerCase())) {
    const rest = trimmed.slice(web.length).split("?")[0] ?? "";
    const segs = rest.split("/").filter(Boolean);
    if (segs.length >= 2 && segs[0]!.toLowerCase() === "expense") {
      const id = segs[segs.length - 1];
      if (id) return { kind: "expense", expenseId: decode(id) };
    }
    const last = segs[segs.length - 1];
    if (last) return { kind: "group", token: decode(last) };
  }

  return null;
}
