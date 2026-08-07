import { describe, expect, it } from "vitest";
import {
  dateToJalali,
  formatJalaliDayMonth,
  formatJalaliMonthYear,
  jalaliMonthKey,
  jalaliMonthLength,
  jalaliToDate,
  saturdayFirstWeekday,
} from "./jalali";

describe("dateToJalali", () => {
  it("converts a known Gregorian date to its Jalaali triple", () => {
    expect(dateToJalali(new Date(2016, 3, 11))).toEqual({
      year: 1395,
      month: 1,
      day: 23,
    });
  });

  it("converts 2026-08-05 to 14 Mordad 1405", () => {
    expect(dateToJalali(new Date(2026, 7, 5))).toEqual({
      year: 1405,
      month: 5,
      day: 14,
    });
  });
});

describe("jalaliToDate", () => {
  it("round-trips a Jalaali triple back to the matching Gregorian date", () => {
    const d = jalaliToDate({ year: 1395, month: 1, day: 23 });
    expect(d.getFullYear()).toBe(2016);
    expect(d.getMonth()).toBe(3);
    expect(d.getDate()).toBe(11);
  });

  it("preserves the time-of-day from the base date", () => {
    const base = new Date(2024, 0, 1, 14, 30, 0);
    const d = jalaliToDate({ year: 1402, month: 10, day: 11 }, base);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });
});

describe("jalaliMonthLength", () => {
  it("returns 29 for a common year's Esfand and 30 for a leap year's", () => {
    expect(jalaliMonthLength(1394, 12)).toBe(29);
    expect(jalaliMonthLength(1395, 12)).toBe(30);
  });
});

describe("jalaliMonthKey", () => {
  it("pads the month so keys sort chronologically as strings", () => {
    expect(jalaliMonthKey(new Date(2026, 7, 7))).toBe("1405-05");
    expect(jalaliMonthKey(new Date(2026, 2, 25))).toBe("1405-01");
  });

  it("buckets dates from two Gregorian months into one Jalaali month", () => {
    // Mordad 1405 runs 2026-07-23 .. 2026-08-22, straddling Jul/Aug.
    expect(jalaliMonthKey(new Date(2026, 6, 23))).toBe("1405-05");
    expect(jalaliMonthKey(new Date(2026, 7, 20))).toBe("1405-05");
  });
});

describe("formatJalaliMonthYear", () => {
  it("names the Jalaali month", () => {
    expect(formatJalaliMonthYear(1405, 5)).toBe("مرداد 1405");
  });

  it("returns null for an out-of-range month", () => {
    expect(formatJalaliMonthYear(1405, 13)).toBeNull();
  });
});

describe("formatJalaliDayMonth", () => {
  it("formats day and month, omitting the year by default", () => {
    expect(formatJalaliDayMonth(new Date(2026, 7, 7))).toBe("16 مرداد");
  });

  it("appends the year and prefixes the weekday when asked", () => {
    expect(
      formatJalaliDayMonth(new Date(2026, 7, 7), { year: true, weekday: true }),
    ).toBe("جمعه 16 مرداد 1405");
  });
});

describe("saturdayFirstWeekday", () => {
  it("maps Saturday to 0 and Friday to 6", () => {
    // 2024-01-06 is a Saturday.
    expect(saturdayFirstWeekday(new Date(2024, 0, 6))).toBe(0);
    // 2024-01-12 is a Friday.
    expect(saturdayFirstWeekday(new Date(2024, 0, 12))).toBe(6);
  });
});
