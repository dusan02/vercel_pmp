/**
 * Eastern Time utilities and NYSE calendar
 * 
 * NOTE: For DST-safe date operations, use dateET.ts helpers
 */

import { createETDate, getDateET, minutesSinceMidnightET, nowET as nowInstant, toET } from './dateET';

/**
 * Get current time in Eastern Timezone
 * @deprecated Prefer using a real Date instant + `toET()` for components.
 */
export function nowET(): Date {
  // Return a real instant. ET interpretation must be derived via Intl (`toET`).
  return nowInstant();
}

/**
 * Detect current market session based on ET time
 */
export function detectSession(etNow?: Date): 'pre' | 'live' | 'after' | 'closed' {
  const now = etNow || nowET();
  const currentTimeInMinutes = minutesSinceMidnightET(now);
  const dayOfWeek = toET(now).weekday; // 0 = Sunday, 6 = Saturday (ET)

  // Check if weekend
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return 'closed';
  }

  // Check if market holiday
  if (isMarketHoliday(now)) {
    return 'closed';
  }

  // Market sessions (in minutes from 00:00 ET)
  const preMarketStart = 4 * 60; // 4:00 AM
  const marketStart = 9 * 60 + 30; // 9:30 AM
  const marketEnd = 16 * 60; // 4:00 PM
  const afterHoursEnd = 20 * 60; // 8:00 PM

  if (currentTimeInMinutes >= preMarketStart && currentTimeInMinutes < marketStart) {
    return 'pre';
  } else if (currentTimeInMinutes >= marketStart && currentTimeInMinutes < marketEnd) {
    return 'live';
  } else if (currentTimeInMinutes >= marketEnd && currentTimeInMinutes < afterHoursEnd) {
    return 'after';
  } else {
    return 'closed';
  }
}

/**
 * Check if date is a NYSE market holiday
 */
export function isMarketHoliday(date: Date): boolean {
  const et = toET(date);
  const month = et.month; // 1-12 (ET calendar)
  const day = et.day;
  const dayOfWeek = et.weekday;
  const year = et.year;

  // Fixed date holidays
  // Include observed days when holiday falls on weekend.
  const isObservedFixedHoliday = (m: number, d: number) => {
    // Actual holiday
    if (month === m && day === d) return true;
    // Observed Friday if holiday on Saturday
    if (dayOfWeek === 5) {
      // Friday observed -> actual holiday is next day (Saturday)
      if (m === month && d === day + 1) return true;
    }
    // Observed Monday if holiday on Sunday
    if (dayOfWeek === 1) {
      // Monday observed -> actual holiday is previous day (Sunday)
      if (m === month && d === day - 1) return true;
    }
    return false;
  };

  if (isObservedFixedHoliday(1, 1)) return true;   // New Year's Day
  if (year >= 2021 && isObservedFixedHoliday(6, 19)) return true; // Juneteenth (since 2021)
  if (isObservedFixedHoliday(7, 4)) return true;   // Independence Day
  if (isObservedFixedHoliday(12, 25)) return true; // Christmas Day

  // MLK Day - 3rd Monday in January
  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;

  // Presidents' Day - 3rd Monday in February
  if (month === 2 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;

  // Good Friday - 2 days before Easter (calendar date, independent of timezone)
  const easter = calculateEasterMonthDay(year);
  const easterUTCNoon = new Date(Date.UTC(year, easter.month - 1, easter.day, 12, 0, 0));
  const goodFridayUTCNoon = new Date(easterUTCNoon.getTime() - 2 * 24 * 60 * 60 * 1000);
  const gfMonth = goodFridayUTCNoon.getUTCMonth() + 1;
  const gfDay = goodFridayUTCNoon.getUTCDate();
  if (month === gfMonth && day === gfDay) return true;

  // Memorial Day - Last Monday in May
  if (month === 5 && dayOfWeek === 1 && day >= 25) return true;

  // Labor Day - 1st Monday in September
  if (month === 9 && dayOfWeek === 1 && day <= 7) return true;

  // Thanksgiving - 4th Thursday in November
  if (month === 11 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;

  return false;
}

/**
 * Calculate Easter date (simplified algorithm)
 */
function calculateEasterMonthDay(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/**
 * Check if market is open (not weekend, not holiday, within trading hours)
 */
export function isMarketOpen(etNow?: Date): boolean {
  const session = detectSession(etNow);
  return session !== 'closed';
}

/**
 * Map session to valid Redis session (closed -> after)
 */
export function mapToRedisSession(session: 'pre' | 'live' | 'after' | 'closed'): 'pre' | 'live' | 'after' {
  return session === 'closed' ? 'after' : session;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function addETCalendarDays(base: Date, days: number): string {
  const p = toET(base);
  // Use UTC noon to avoid DST edges; we only need the calendar date.
  const utcNoon = new Date(Date.UTC(p.year, p.month - 1, p.day, 12, 0, 0));
  utcNoon.setUTCDate(utcNoon.getUTCDate() + days);
  const y = utcNoon.getUTCFullYear();
  const m = utcNoon.getUTCMonth() + 1;
  const d = utcNoon.getUTCDate();
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function atETTime(date: Date, hour: number, minute: number): Date {
  const ymd = getDateET(date);
  const etMidnight = createETDate(ymd);
  return new Date(etMidnight.getTime() + (hour * 60 + minute) * 60_000);
}

/**
 * Get next market open time
 */
export function getNextMarketOpen(etNow?: Date): Date {
  const now = etNow || nowET();
  const nowParts = toET(now);
  const isWeekend = nowParts.weekday === 0 || nowParts.weekday === 6;

  // If today is a trading day and we're before 09:30 ET, return today 09:30 ET
  const beforeOpen = nowParts.hour < 9 || (nowParts.hour === 9 && nowParts.minute < 30);
  if (!isWeekend && !isMarketHoliday(now) && beforeOpen) {
    return atETTime(now, 9, 30);
  }

  // Otherwise find next trading day (calendar days in ET)
  let cursor = now;
  while (true) {
    const nextYMD = addETCalendarDays(cursor, 1);
    const nextDay = createETDate(nextYMD);
    if (!isMarketHoliday(nextDay)) {
      const w = toET(nextDay).weekday;
      if (w !== 0 && w !== 6) {
        return new Date(nextDay.getTime() + (9 * 60 + 30) * 60_000);
      }
    }
    cursor = nextDay;
  }
}

/**
 * Get the last trading day (business day) before the given date
 * Excludes weekends and market holidays
 */
export function getLastTradingDay(beforeDate?: Date): Date {
  const base = beforeDate || nowET();
  // Start from ET date of base (calendar), then step back until trading day.
  let cursorYMD = addETCalendarDays(base, 0);

  while (true) {
    cursorYMD = addETCalendarDays(createETDate(cursorYMD), -1);
    const candidate = createETDate(cursorYMD);
    const w = toET(candidate).weekday;
    if (w !== 0 && w !== 6 && !isMarketHoliday(candidate)) {
      return candidate; // ET midnight
    }
  }
}

/**
 * Get the trading day for a given calendar date (ET).
 * - If the given date is a trading day, returns THAT same ET calendar date at ET midnight.
 * - If weekend/holiday, returns the most recent prior trading day.
 *
 * This differs from `getLastTradingDay()`, which returns the previous trading day strictly before the given date.
 */
export function getTradingDay(date?: Date): Date {
  const base = date || nowET();
  const w = toET(base).weekday;
  const isWeekend = w === 0 || w === 6;
  if (!isWeekend && !isMarketHoliday(base)) {
    return createETDate(getDateET(base)); // same calendar date in ET
  }
  return getLastTradingDay(base);
}

/**
 * Get the last trading day's date as string (YYYY-MM-DD)
 */
export function getLastTradingDayString(beforeDate?: Date): string {
  const date = getLastTradingDay(beforeDate);
  return getDateET(date);
}

