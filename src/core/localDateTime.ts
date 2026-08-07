/**
 * Formats a `Date` as the app's canonical "local wall-clock, no timezone"
 * expense-date string: `YYYY-MM-DDTHH:mm`, using the device's own calendar
 * fields (`getFullYear`/`getMonth`/... ), never UTC.
 *
 * This is the format every expense writer is expected to persist into
 * `expenses.expense_date` — deliberately timezone-free so the same string
 * means the same wall-clock moment on any device, and so
 * `AddExpenseScreen`'s edit-load path (`parseStoredExpenseToDate`) can
 * reconstruct it without knowing which timezone wrote it.
 *
 * Do NOT use `Date#toISOString()` for this field: it renders the instant in
 * UTC, and `parseStoredExpenseToDate`'s regex reads the `HH:mm` portion of
 * whatever string it's given as local wall-clock time (by design, to stay
 * timezone-free) — so a UTC ISO string is silently reinterpreted as if its
 * UTC clock reading were the device's local time. On any device not in UTC,
 * re-opening that expense for edit shows (and, if saved without touching
 * the date, permanently persists) a shifted date/time.
 */
export function formatLocalDateTimeForInput(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${day}T${h}:${min}`;
}
