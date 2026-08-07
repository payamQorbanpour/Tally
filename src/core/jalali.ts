import {
  jalaaliMonthLength,
  jalaaliToDateObject,
  toJalaali,
} from "jalaali-js";

/** A Jalaali (Persian/Shamsi) calendar date, month 1-12 (1 = Farvardin). */
export type JalaaliTriple = { year: number; month: number; day: number };

/** Farsi month names, index 0 = Farvardin (Jalaali month 1). */
export const JALALI_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

/** Farsi weekday abbreviations for a week starting Saturday. */
export const JALALI_WEEKDAY_LABELS = [
  "ش",
  "ی",
  "د",
  "س",
  "چ",
  "پ",
  "ج",
] as const;

/** Full Farsi weekday names for a week starting Saturday. */
export const JALALI_WEEKDAY_NAMES = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
] as const;

/** Converts a JS `Date` (read in local time) to its Jalaali calendar triple. */
export function dateToJalali(date: Date): JalaaliTriple {
  const { jy, jm, jd } = toJalaali(date);
  return { year: jy, month: jm, day: jd };
}

/**
 * Converts a Jalaali triple to a JS `Date`, preserving the time-of-day from
 * `base` (defaults to midnight local time).
 */
export function jalaliToDate(triple: JalaaliTriple, base?: Date): Date {
  return jalaaliToDateObject(
    triple.year,
    triple.month,
    triple.day,
    base?.getHours() ?? 0,
    base?.getMinutes() ?? 0,
    base?.getSeconds() ?? 0,
    base?.getMilliseconds() ?? 0,
  );
}

/** Number of days in the given Jalaali year/month (handles leap years). */
export function jalaliMonthLength(year: number, month: number): number {
  return jalaaliMonthLength(year, month);
}

/**
 * JS `Date.getDay()` (0 = Sunday) mapped to a Saturday-first index (0 = شنبه
 * … 6 = جمعه), matching the Persian-calendar week order used across this
 * module's exports.
 */
export function saturdayFirstWeekday(date: Date): number {
  return (date.getDay() + 1) % 7;
}

/**
 * `YYYY-MM` month-bucket key in the Jalaali calendar (Latin digits, padded),
 * so list sections group by Persian months rather than Gregorian ones. Sorts
 * correctly with a plain string compare.
 */
export function jalaliMonthKey(date: Date): string {
  const { year, month } = dateToJalali(date);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * `مرداد ۱۴۰۵`-style month heading, built from a Jalaali year/month.
 *
 * All formatters here emit Latin digits — callers apply `localizeDigits` so
 * digit shaping stays a single, consistently-applied presentation concern.
 * Returns `null` for an out-of-range month so callers can fall back.
 */
export function formatJalaliMonthYear(
  year: number,
  month: number,
): string | null {
  const name = JALALI_MONTH_NAMES[month - 1];
  return name ? `${name} ${year}` : null;
}

/**
 * `۱۶ مرداد`, optionally with the year and/or the weekday name, e.g.
 * `پنجشنبه ۱۶ مرداد ۱۴۰۵`. Latin digits — see `formatJalaliMonthYear`.
 */
export function formatJalaliDayMonth(
  date: Date,
  opts?: { year?: boolean; weekday?: boolean },
): string {
  const { year, month, day } = dateToJalali(date);
  const monthName = JALALI_MONTH_NAMES[month - 1] ?? String(month);
  const head = opts?.weekday
    ? `${JALALI_WEEKDAY_NAMES[saturdayFirstWeekday(date)]} `
    : "";
  const tail = opts?.year ? ` ${year}` : "";
  return `${head}${day} ${monthName}${tail}`;
}
