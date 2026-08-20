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

/**
 * Where invite links point.
 *
 * On the web build the page's own origin wins over the configured value. The
 * env var is baked in at build time, so it goes stale the moment the app is
 * served from a different host (renamed project, preview deployment, custom
 * domain) — and a link on a host the user is not actually using is a dead
 * link. The origin they loaded the app from is, by definition, reachable.
 * Only the host is taken from the origin; the path (`/join`) still comes from
 * the configured value.
 */
export function getInviteWebBaseUrl(): string | null {
  const configured = trim(process.env.EXPO_PUBLIC_INVITE_BASE_URL).replace(
    /\/+$/,
    "",
  );

  const origin =
    typeof window !== "undefined" && typeof window.location?.origin === "string"
      ? window.location.origin.replace(/\/+$/, "")
      : "";
  // `about:`/`blob:`/`null` origins are not somewhere a link can point.
  const usableOrigin = /^https?:\/\//i.test(origin) ? origin : "";

  if (!usableOrigin) return configured || null;

  const path = configured ? pathOf(configured) : "/join";
  return `${usableOrigin}${path}`;
}

/** The path portion of an absolute URL, defaulting to `/join`. */
function pathOf(url: string): string {
  const afterScheme = url.slice(url.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  const path = slash < 0 ? "" : afterScheme.slice(slash);
  return path || "/join";
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
 * Split an `http(s)` URL into its path segments, or return `null` when the
 * string is not an absolute web URL. Query and fragment are dropped.
 */
function webPathSegments(raw: string): string[] | null {
  if (!/^https?:\/\//i.test(raw)) return null;
  const afterScheme = raw.slice(raw.indexOf("://") + 3);
  const slash = afterScheme.indexOf("/");
  if (slash < 0) return [];
  const path = afterScheme.slice(slash).split("?")[0] ?? "";
  return path.split("/").filter(Boolean);
}

/**
 * Extract an invite target from a URL we built (or from a deep link delivered
 * to the app). Returns `null` if the URL doesn't look like one of ours.
 *
 * Recognised shapes:
 *   - Group deep link:   `tally://group-invite?token=…`
 *   - Expense deep link: `tally://expense-invite?id=…`
 *   - Group web link:    `https://<any-host>/join/<token>`
 *   - Expense web link:  `https://<any-host>/expense/<id>`
 *
 * Web links are matched on their **path**, not on the host. Matching the host
 * against `EXPO_PUBLIC_INVITE_BASE_URL` looks tighter but is a trap: the value
 * is baked into each build, so a build whose env var drifted from the domain
 * people actually share (a renamed project, a preview deployment, a custom
 * domain) silently stopped recognising its own invite links — the app just
 * booted to the home screen with no error. The host was never the security
 * boundary anyway: the token is only ever spent against our own Supabase,
 * which rejects one it does not know.
 */
export function parseInviteTokenFromScannedUrl(
  raw: string,
): ScannedInvite | null {
  // Drop any `#fragment` first. The token patterns below match anywhere in the
  // string, so without this a QR encoding `tally://group-invite?token=x#…`
  // would pass as a valid invite and carry the fragment along to whoever
  // re-dispatches the URL.
  const trimmed = (raw.split("#")[0] ?? "").trim();
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

  // Web links, by path: /join/<token> or /expense/<id>.
  const segs = webPathSegments(trimmed);
  if (!segs || segs.length < 2) return null;
  const head = segs[0]!.toLowerCase();
  const tail = segs[segs.length - 1]!;
  if (!tail) return null;
  if (head === "expense") return { kind: "expense", expenseId: decode(tail) };
  if (head === "join") return { kind: "group", token: decode(tail) };

  return null;
}
