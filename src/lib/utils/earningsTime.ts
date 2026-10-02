/**
 * Earnings time-of-day classification.
 *
 * The `time`/`hour` field uses two overlapping vocabularies across sources:
 * Finnhub/DB store 'bmo'|'amc'|'dmh'|'tbd', while some paths produce
 * 'before'|'after'. Bucketing by only one variant silently drops rows
 * (e.g. 'before' used to land in timeTbd), so classify through this helper.
 */

export type EarningsTimeBucket = 'preMarket' | 'afterMarket' | 'timeTbd';

export function classifyEarningsTime(time: string | null | undefined): EarningsTimeBucket {
  switch (time) {
    case 'bmo':
    case 'before':
      return 'preMarket';
    case 'amc':
    case 'after':
      return 'afterMarket';
    default:
      // 'dmh' (during market hours), 'tbd', 'unknown', null, undefined
      return 'timeTbd';
  }
}
