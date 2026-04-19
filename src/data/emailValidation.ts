/**
 * Pragmatic check for typical user-entered emails (ASCII-oriented).
 * Not a full RFC 5322 parser; empty string is not considered here — use
 * {@link isValidOptionalEmail} for optional fields.
 */
export function isValidEmail(trimmed: string): boolean {
  if (trimmed.length === 0) return false;
  // Local @ domain with at least one dot in the host (e.g. user@host.tld)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/** Empty is allowed; non-empty must pass {@link isValidEmail}. */
export function isValidOptionalEmail(trimmed: string): boolean {
  if (trimmed.length === 0) return true;
  return isValidEmail(trimmed);
}

/** Lowercase trim for comparing invite addresses to auth email. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
