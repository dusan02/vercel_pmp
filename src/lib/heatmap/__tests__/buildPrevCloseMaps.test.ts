import { buildPrevCloseMaps, TransformContext } from '../heatmapTransformer';
import { createETDate } from '@/lib/utils/dateET';

function makeCtx(overrides: Partial<TransformContext> = {}): TransformContext {
  return {
    session: 'closed',
    etNow: createETDate('2026-07-22'),
    isNonTradingClosedDay: false,
    lastTradingDayForQuery: createETDate('2026-07-21'),
    regularCloseReferenceDayStr: null,
    todayDateStr: '2026-07-22',
    todayDateObj: createETDate('2026-07-22'),
    ...overrides,
  };
}

function makeDailyRef(symbol: string, dateStr: string, previousClose: number | null, regularClose: number | null) {
  return {
    id: `${symbol}-${dateStr}`,
    symbol,
    date: createETDate(dateStr),
    previousClose,
    regularClose,
    todayOpen: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;
}

describe('buildPrevCloseMaps', () => {
  it('uses today\'s DailyRef.previousClose as highest priority', () => {
    const refs = [
      makeDailyRef('NVDA', '2026-07-22', 207.29, 207.29), // today: prevClose=207.29
      makeDailyRef('NVDA', '2026-07-17', 207.40, 202.81), // older: regularClose=202.81
    ];

    const { previousCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    expect(previousCloseMap.get('NVDA')).toBe(207.29);
  });

  it('falls back to older regularClose when today\'s DailyRef has no previousClose', () => {
    const refs = [
      makeDailyRef('NVDA', '2026-07-22', null, null),      // today: no prevClose, no regularClose
      makeDailyRef('NVDA', '2026-07-17', 207.40, 202.81),  // older: regularClose=202.81
    ];

    const { previousCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    expect(previousCloseMap.get('NVDA')).toBe(202.81);
  });

  it('does NOT use older regularClose when today\'s previousClose is available', () => {
    const refs = [
      makeDailyRef('AAPL', '2026-07-22', 327.74, 327.74),  // today: prevClose=327.74
      makeDailyRef('AAPL', '2026-07-17', 333.26, 333.74),  // older: regularClose=333.74
    ];

    const { previousCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    expect(previousCloseMap.get('AAPL')).toBe(327.74);
    expect(previousCloseMap.get('AAPL')).not.toBe(333.74);
  });

  it('handles missing regularClose on intermediate days (cron failure scenario)', () => {
    // Simulates the real bug: July 21 regularClose is null (cron failed)
    const refs = [
      makeDailyRef('NVDA', '2026-07-22', 207.29, 207.29), // today
      makeDailyRef('NVDA', '2026-07-21', 207.29, null),   // July 21: regularClose=null (cron failed)
      makeDailyRef('NVDA', '2026-07-20', 203.28, null),   // July 20: no regularClose
      makeDailyRef('NVDA', '2026-07-17', 207.40, 202.81), // July 17: regularClose=202.81
    ];

    const { previousCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    // Must use today's previousClose (207.29), NOT July 17's regularClose (202.81)
    expect(previousCloseMap.get('NVDA')).toBe(207.29);
  });

  it('sets regularCloseMap for session-aware percent change', () => {
    const refs = [
      makeDailyRef('NVDA', '2026-07-22', 207.29, 207.29),
    ];

    const { regularCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    expect(regularCloseMap.get('NVDA')).toBe(207.29);
  });

  it('uses regularCloseReferenceDayStr for regularCloseMap on non-trading days', () => {
    // Weekend: Saturday July 19. regularCloseReferenceDayStr = Friday July 17
    const refs = [
      makeDailyRef('NVDA', '2026-07-17', 207.40, 202.81), // Friday: regularClose=202.81
    ];

    const ctx = makeCtx({
      etNow: createETDate('2026-07-19'),
      todayDateStr: '2026-07-19',
      todayDateObj: createETDate('2026-07-19'),
      isNonTradingClosedDay: true,
      regularCloseReferenceDayStr: '2026-07-17',
    });

    const { regularCloseMap } = buildPrevCloseMaps(refs, ctx);
    expect(regularCloseMap.get('NVDA')).toBe(202.81);
  });

  it('falls back to older previousClose on non-trading closed days', () => {
    // Weekend: no today DailyRef. Should use older previousClose.
    const refs = [
      makeDailyRef('NVDA', '2026-07-17', 207.40, 202.81),
    ];

    const ctx = makeCtx({
      etNow: createETDate('2026-07-19'),
      todayDateStr: '2026-07-19',
      todayDateObj: createETDate('2026-07-19'),
      isNonTradingClosedDay: true,
      session: 'closed',
    });

    const { previousCloseMap } = buildPrevCloseMaps(refs, ctx);
    // Should use regularClose=202.81 from Friday
    expect(previousCloseMap.get('NVDA')).toBe(202.81);
  });

  it('handles empty dailyRefs', () => {
    const { previousCloseMap, regularCloseMap } = buildPrevCloseMaps([], makeCtx());
    expect(previousCloseMap.size).toBe(0);
    expect(regularCloseMap.size).toBe(0);
  });

  it('handles ticker with no DailyRef at all', () => {
    const refs = [makeDailyRef('NVDA', '2026-07-22', 207.29, 207.29)];
    const { previousCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    expect(previousCloseMap.has('AAPL')).toBe(false);
  });

  it('uses most recent regularClose for fallback (date desc order)', () => {
    const refs = [
      makeDailyRef('NVDA', '2026-07-22', null, null),      // today: nothing
      makeDailyRef('NVDA', '2026-07-17', 207.40, 202.81),  // July 17: regularClose=202.81
      makeDailyRef('NVDA', '2026-07-15', 212.50, 211.80),  // July 15: regularClose=211.80
    ];

    const { previousCloseMap } = buildPrevCloseMaps(refs, makeCtx());
    // Should use July 17's regularClose (202.81), not July 15's (211.80)
    expect(previousCloseMap.get('NVDA')).toBe(202.81);
  });
});
