/**
 * Eastern Time date utilities (deterministic, server-safe)
 *
 * Why not Intl(timeZone=America/New_York)?
 * - Some server Node/ICU builds mis-handle timezone data or midnight formatting,
 *   which can corrupt trading-day calculations (we saw production drift to 2026-01-05).
 *
 * Approach:
 * - Implement America/New_York offset using US DST rules (since 2007).
 * - Keep computations purely in UTC math + offset conversion.
 */

/**
 * Get current time in ET (Date object, DST-safe)
 */
export function nowET(): Date {
  // IMPORTANT:
  // Return a real instant (UTC timestamp) and never "fake" a Date by parsing a localized string.
  // All ET-specific logic must be computed via `toET()` (offset conversion) from this instant.
  return new Date();
}

function nthWeekdayOfMonthUTCNoon(year: number, month1: number, weekday: number, nth: number): number {
  // month1: 1-12, weekday: 0=Sun..6=Sat
  const first = new Date(Date.UTC(year, month1 - 1, 1, 12, 0, 0));
  const firstDow = first.getUTCDay();
  const delta = (weekday - firstDow + 7) % 7;
  return 1 + delta + 7 * (nth - 1);
}

function getNyDstTransitionUtcMs(year: number): { dstStartUtcMs: number; dstEndUtcMs: number } {
  // US DST (since 2007):
  // - Starts: 2nd Sunday in March at 02:00 local (EST) => 07:00 UTC
  // - Ends:   1st Sunday in November at 02:00 local (EDT) => 06:00 UTC
  const dstStartDay = nthWeekdayOfMonthUTCNoon(year, 3, 0, 2); // 2nd Sunday March
  const dstEndDay = nthWeekdayOfMonthUTCNoon(year, 11, 0, 1);  // 1st Sunday Nov
  const dstStartUtcMs = Date.UTC(year, 2, dstStartDay, 7, 0, 0);
  const dstEndUtcMs = Date.UTC(year, 10, dstEndDay, 6, 0, 0);
  return { dstStartUtcMs, dstEndUtcMs };
}

function isNyDstAtUtcMs(utcMs: number): boolean {
  const y = new Date(utcMs).getUTCFullYear();
  const { dstStartUtcMs, dstEndUtcMs } = getNyDstTransitionUtcMs(y);
  return utcMs >= dstStartUtcMs && utcMs < dstEndUtcMs;
}

function getNyOffsetMinutesAtUtcMs(utcMs: number): number {
  return isNyDstAtUtcMs(utcMs) ? -4 * 60 : -5 * 60; // EDT : EST
}

function getNyOffsetMinutesForLocalMidnight(year: number, month1: number, day: number): number {
  // Determine offset at 00:00 local time for the given local calendar date.
  const dstStartDay = nthWeekdayOfMonthUTCNoon(year, 3, 0, 2);
  const dstEndDay = nthWeekdayOfMonthUTCNoon(year, 11, 0, 1);

  if (month1 < 3 || month1 > 11) return -5 * 60;
  if (month1 > 3 && month1 < 11) return -4 * 60;

  if (month1 === 3) {
    if (day < dstStartDay) return -5 * 60;
    if (day > dstStartDay) return -4 * 60;
    return -5 * 60; // DST starts at 02:00, so midnight is still standard time
  }

  // month1 === 11
  if (day < dstEndDay) return -4 * 60;
  if (day > dstEndDay) return -5 * 60;
  return -4 * 60; // DST ends at 02:00, so midnight is still daylight time
}

/**
 * Get date string in ET (YYYY-MM-DD)
 * DST-safe
 */
export function getDateET(d?: Date): string {
  const base = d || nowET();
  const parts = toET(base);
  const year = String(parts.year);
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Convert Date to ET timezone components (DST-safe)
 */
export function toET(date: Date): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun..6=Sat (ET)
} {
  const utcMs = date.getTime();
  const offsetMin = getNyOffsetMinutesAtUtcMs(utcMs);
  const localMs = utcMs + offsetMin * 60_000;
  const d = new Date(localMs);

  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    weekday: d.getUTCDay()
  };
}

/**
 * Minutes since midnight in ET
 */
export function minutesSinceMidnightET(d?: Date): number {
  const p = toET(d || nowET());
  return p.hour * 60 + p.minute;
}

/**
 * Is weekend in ET (Sat/Sun)
 */
export function isWeekendET(d?: Date): boolean {
  const p = toET(d || nowET());
  return p.weekday === 0 || p.weekday === 6;
}

/**
 * Check if two dates are on the same ET day
 */
export function isSameETDay(a: Date, b: Date): boolean {
  const aET = toET(a);
  const bET = toET(b);
  return (
    aET.year === bET.year &&
    aET.month === bET.month &&
    aET.day === bET.day
  );
}

/**
 * Check if timestamp (ms) is within session window in ET
 */
export function isInSessionET(
  tsMs: number,
  session: 'pre' | 'live' | 'after',
  etNow?: Date
): boolean {
  const now = etNow || nowET();
  const tsDate = new Date(tsMs);
  
  // Must be same ET day
  if (!isSameETDay(tsDate, now)) {
    return false;
  }

  const tsET = toET(tsDate);
  const timeInMinutes = tsET.hour * 60 + tsET.minute;

  switch (session) {
    case 'pre':
      return timeInMinutes >= 4 * 60 && timeInMinutes < 9 * 60 + 30; // 04:00-09:30 ET
    case 'live':
      return timeInMinutes >= 9 * 60 + 30 && timeInMinutes < 16 * 60; // 09:30-16:00 ET
    case 'after':
      return timeInMinutes >= 16 * 60 && timeInMinutes < 20 * 60; // 16:00-20:00 ET
    default:
      return false;
  }
}

/**
 * Create Date object for ET midnight (00:00:00 ET) from YYYY-MM-DD string
 * DST-safe and deterministic
 */
export function createETDate(dateString: string): Date {
  // Parse YYYY-MM-DD
  const parts = dateString.split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid date string (expected YYYY-MM-DD): ${dateString}`);
  }
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`Invalid date string (non-numeric parts): ${dateString}`);
  }

  const offsetMin = getNyOffsetMinutesForLocalMidnight(year, month, day);
  const utcMs = Date.UTC(year, month - 1, day, 0, 0, 0) - offsetMin * 60_000;
  return new Date(utcMs);
}

/**
 * Convert nanoseconds to milliseconds
 * Polygon API sometimes returns timestamps in nanoseconds
 */
export function nsToMs(ns: number): number {
  // ms epoch ~ 1.7e12, ns epoch ~ 1.7e18
  // Anything above ~1e14 is safely nanoseconds (or higher precision)
  if (ns > 1e14) return Math.floor(ns / 1e6);
  return ns;
}
