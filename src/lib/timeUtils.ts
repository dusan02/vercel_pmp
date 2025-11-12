/**
 * Eastern Time utilities and NYSE calendar
 */

/**
 * Get current time in Eastern Timezone
 */
export function nowET(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/New_York" }));
}

/**
 * Detect current market session based on ET time
 */
export function detectSession(etNow?: Date): 'pre' | 'live' | 'after' | 'closed' {
  const now = etNow || nowET();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTimeInMinutes = hours * 60 + minutes;
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

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
  const month = date.getMonth() + 1; // getMonth() is 0-indexed
  const day = date.getDate();
  const dayOfWeek = date.getDay();
  const year = date.getFullYear();

  // Fixed date holidays
  if (month === 1 && day === 1) return true; // New Year's Day
  if (month === 7 && day === 4) return true; // Independence Day
  if (month === 12 && day === 25) return true; // Christmas Day

  // MLK Day - 3rd Monday in January
  if (month === 1 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;

  // Presidents' Day - 3rd Monday in February
  if (month === 2 && dayOfWeek === 1 && day >= 15 && day <= 21) return true;

  // Good Friday - Friday before Easter (simplified: check if Friday in late March/early April)
  // For exact calculation, use Easter algorithm
  const easter = calculateEaster(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  if (date.getTime() === goodFriday.getTime()) return true;

  // Memorial Day - Last Monday in May
  if (month === 5 && dayOfWeek === 1 && day >= 25) return true;

  // Juneteenth - June 19 (since 2021)
  if (month === 6 && day === 19 && year >= 2021) return true;

  // Labor Day - 1st Monday in September
  if (month === 9 && dayOfWeek === 1 && day <= 7) return true;

  // Thanksgiving - 4th Thursday in November
  if (month === 11 && dayOfWeek === 4 && day >= 22 && day <= 28) return true;

  return false;
}

/**
 * Calculate Easter date (simplified algorithm)
 */
function calculateEaster(year: number): Date {
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
  
  return new Date(year, month - 1, day);
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

/**
 * Get next market open time
 */
export function getNextMarketOpen(etNow?: Date): Date {
  const now = etNow || nowET();
  const next = new Date(now);
  
  // If it's weekend or holiday, find next weekday
  while (next.getDay() === 0 || next.getDay() === 6 || isMarketHoliday(next)) {
    next.setDate(next.getDate() + 1);
    next.setHours(9, 30, 0, 0); // Market opens at 9:30 AM ET
  }
  
  // If it's before 9:30 AM today and market is open today
  if (now.getHours() < 9 || (now.getHours() === 9 && now.getMinutes() < 30)) {
    if (!isMarketHoliday(now) && now.getDay() !== 0 && now.getDay() !== 6) {
      next.setHours(9, 30, 0, 0);
      return next;
    }
  }
  
  // Otherwise, next day at 9:30 AM
  next.setDate(next.getDate() + 1);
  next.setHours(9, 30, 0, 0);
  
  // Skip weekends and holidays
  while (next.getDay() === 0 || next.getDay() === 6 || isMarketHoliday(next)) {
    next.setDate(next.getDate() + 1);
  }
  
  return next;
}

