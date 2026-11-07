/**
 * PMP Point-in-Time Timezone Engine
 * 
 * Deterministic conversion of SEC EDGAR / Finnhub Eastern Time timestamps
 * to unambiguous UTC instants (ISO 8601).
 * 
 * Uses standard IANA timezone database ("America/New_York") via native Intl API.
 * Strictly avoids naive fixed offsets (-04:00 / -05:00) to guarantee 100% precision
 * across Daylight Saving Time (DST) transitions.
 */

export interface ParsedTimestampResult {
  utcDate: Date;
  isoUtc: string;
  rawString: string;
  rawTimezone: string;
  isDst: boolean;
  offsetMinutes: number; // e.g. -240 for EDT (UTC-4) or -300 for EST (UTC-5)
}

/**
 * Parses a date-time string in America/New_York (Eastern Time) into a UTC Date.
 * 
 * Expected formats:
 * - "YYYY-MM-DD HH:mm:ss" (e.g. Finnhub acceptedDate "2024-10-31 18:01:29")
 * - "YYYY-MM-DD HH:mm"
 * - "YYYY-MM-DD" (defaults to midnight 00:00:00 Eastern)
 * - "YYYYMMDDHHmmss" (SEC EDGAR raw header format e.g. "20241031180129")
 */
export function parseEasternToUtc(
  rawInput: string,
  timeZone: string = 'America/New_York'
): ParsedTimestampResult {
  if (!rawInput || typeof rawInput !== 'string') {
    throw new Error(`[PIT Timezone] Invalid raw timestamp: "${rawInput}"`);
  }

  const trimmed = rawInput.trim();
  let year: number;
  let month: number;
  let day: number;
  let hour = 0;
  let minute = 0;
  let second = 0;

  // 1. Check for SEC EDGAR compact format: YYYYMMDDHHmmss (14 digits)
  if (/^\d{14}$/.test(trimmed)) {
    year = parseInt(trimmed.substring(0, 4), 10);
    month = parseInt(trimmed.substring(4, 6), 10);
    day = parseInt(trimmed.substring(6, 8), 10);
    hour = parseInt(trimmed.substring(8, 10), 10);
    minute = parseInt(trimmed.substring(10, 12), 10);
    second = parseInt(trimmed.substring(12, 14), 10);
  } else {
    // 2. Standard ISO / SQL format: YYYY-MM-DD [T ]HH:mm[:ss]
    const match = trimmed.match(
      /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/
    );
    if (!match) {
      throw new Error(
        `[PIT Timezone] Unrecognized timestamp format: "${rawInput}". Expected YYYY-MM-DD HH:mm:ss or YYYYMMDDHHmmss`
      );
    }
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    day = parseInt(match[3], 10);
    if (match[4] !== undefined) hour = parseInt(match[4], 10);
    if (match[5] !== undefined) minute = parseInt(match[5], 10);
    if (match[6] !== undefined) second = parseInt(match[6], 10);
  }

  // Validate calendar bounds
  if (month < 1 || month > 12) throw new Error(`[PIT Timezone] Month out of range: ${month}`);
  if (day < 1 || day > 31) throw new Error(`[PIT Timezone] Day out of range: ${day}`);
  if (hour < 0 || hour > 23) throw new Error(`[PIT Timezone] Hour out of range: ${hour}`);
  if (minute < 0 || minute > 59) throw new Error(`[PIT Timezone] Minute out of range: ${minute}`);
  if (second < 0 || second > 59) throw new Error(`[PIT Timezone] Second out of range: ${second}`);

  // Inversion algorithm to find UTC timestamp for wall-clock time in specified IANA timezone
  const targetUtcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const getTzParts = (d: Date): Record<string, number> => {
    const parts = dtf.formatToParts(d);
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') {
        map[p.type] = parseInt(p.value, 10);
      }
    }
    return map;
  };

  // Iteratively converge on exact UTC instant (at most 3 iterations needed for DST resolution)
  let currentUtcMs = targetUtcGuess.getTime();
  for (let iter = 0; iter < 3; iter++) {
    const local = getTzParts(new Date(currentUtcMs));
    const localEquivalentMs = Date.UTC(
      local.year,
      local.month - 1,
      local.day,
      local.hour,
      local.minute,
      local.second
    );
    const diff = targetUtcGuess.getTime() - localEquivalentMs;
    if (diff === 0) break;
    currentUtcMs += diff;
  }

  const finalUtcDate = new Date(currentUtcMs);

  // Compute offset in minutes (local - UTC)
  const offsetMs = targetUtcGuess.getTime() - currentUtcMs;
  const offsetMinutes = Math.round(offsetMs / (60 * 1000));
  // In America/New_York, -240 min = UTC-4 (EDT / Daylight), -300 min = UTC-5 (EST / Standard)
  const isDst = offsetMinutes === -240;

  return {
    utcDate: finalUtcDate,
    isoUtc: finalUtcDate.toISOString(),
    rawString: rawInput,
    rawTimezone: timeZone,
    isDst,
    offsetMinutes,
  };
}

/**
 * Formats a UTC Date back to Eastern Time string "YYYY-MM-DD HH:mm:ss" for verification.
 */
export function formatUtcToEastern(utcDate: Date, timeZone: string = 'America/New_York'): string {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(utcDate);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== 'literal') map[p.type] = p.value;
  }
  return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}
