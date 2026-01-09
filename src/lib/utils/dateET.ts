/**
 * DST-safe Eastern Time date utilities
 * 
 * CRITICAL: Never use fixed -05:00 offset (DST breaks it)
 * Always use timezone-aware date construction via Intl.DateTimeFormat
 */

/**
 * Get current time in ET (Date object, DST-safe)
 */
export function nowET(): Date {
  // IMPORTANT:
  // Return a real instant (UTC timestamp) and never "fake" a Date by parsing a localized string.
  // All ET-specific logic must be computed via `toET()` (Intl) from this instant.
  return new Date();
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
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    // Force 00-23 hour cycle. Some Node/ICU builds can emit "24" at midnight for h24,
    // which breaks offset calculations and day boundaries.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(date);
  const getPart = (type: string) => {
    const part = parts.find(p => p.type === type);
    return part ? parseInt(part.value, 10) : 0;
  };

  // IMPORTANT:
  // Do NOT depend on localized weekday strings from Intl.
  // Some Node/ICU builds can return unexpected values (or omit the part),
  // which would break weekend/holiday logic and trading-day calculations.
  // Compute weekday from the parsed ET calendar date instead.
  const year = getPart('year');
  const month = getPart('month');
  const day = getPart('day');
  const weekday = new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay(); // 0=Sun..6=Sat

  return {
    year,
    month,
    day,
    hour: getPart('hour'),
    minute: getPart('minute'),
    second: getPart('second'),
    weekday
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
 * DST-safe - uses timezone conversion, not fixed offset
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

  const timeZone = 'America/New_York';
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // Force 00-23; avoid 24:00 at midnight which can shift day math.
    hourCycle: 'h23',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  const getOffsetMs = (date: Date) => {
    const tzParts = dtf.formatToParts(date);
    const getPart = (type: string) => {
      const p = tzParts.find(x => x.type === type)?.value;
      return p ? Number(p) : 0;
    };

    const asUTC = Date.UTC(
      getPart('year'),
      getPart('month') - 1,
      getPart('day'),
      getPart('hour'),
      getPart('minute'),
      getPart('second')
    );

    // Offset between the timezone and UTC at this instant
    return asUTC - date.getTime();
  };

  // Convert "YYYY-MM-DD 00:00:00 ET" -> UTC, DST-safe.
  // Start with UTC midnight guess, then correct using timezone offset (iterate once for DST boundaries).
  const utcGuess = Date.UTC(year, month - 1, day, 0, 0, 0);
  const offset1 = getOffsetMs(new Date(utcGuess));
  let utcMs = utcGuess - offset1;
  const offset2 = getOffsetMs(new Date(utcMs));
  if (offset2 !== offset1) {
    utcMs = utcGuess - offset2;
  }

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
