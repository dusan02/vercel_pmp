import { describe, it, expect } from '@jest/globals';
import { getPrevCloseContext, getPrevCloseRefDay } from '@/lib/utils/prevCloseDates';
import { getDateET } from '@/lib/utils/dateET';

// Sep 2026: EDT = UTC-4. 10:00 ET = 14:00 UTC.
const et = (y: number, m: number, d: number, h = 10, min = 0) =>
  new Date(Date.UTC(y, m - 1, d, h + 4, min));

describe('getPrevCloseContext', () => {
  it('weekday → previous weekday', () => {
    const ctx = getPrevCloseContext(et(2026, 9, 16)); // Wed
    expect(ctx.sessionDateStr).toBe('2026-09-16');
    expect(ctx.closeRefDateStr).toBe('2026-09-15'); // Tue
  });

  it('Monday → Friday (skips weekend)', () => {
    const ctx = getPrevCloseContext(et(2026, 9, 14)); // Mon
    expect(ctx.sessionDateStr).toBe('2026-09-14');
    expect(ctx.closeRefDateStr).toBe('2026-09-11'); // Fri
  });

  it('Saturday → Friday, session date stays Saturday', () => {
    const ctx = getPrevCloseContext(et(2026, 9, 12)); // Sat
    expect(ctx.sessionDateStr).toBe('2026-09-12');
    expect(ctx.closeRefDateStr).toBe('2026-09-11'); // Fri
  });

  it('market holiday (Labor Day Mon Sep 7 2026) → Friday', () => {
    const ctx = getPrevCloseContext(et(2026, 9, 7));
    expect(ctx.sessionDateStr).toBe('2026-09-07');
    expect(ctx.closeRefDateStr).toBe('2026-09-04'); // Fri
  });

  it('sessionDate is an ET-midnight Date round-tripping to sessionDateStr', () => {
    const ctx = getPrevCloseContext(et(2026, 9, 16, 22, 30));
    expect(getDateET(ctx.sessionDate)).toBe('2026-09-16');
  });

  it('accepts an ET date string directly', () => {
    const ctx = getPrevCloseContext('2026-09-15');
    expect(ctx.sessionDateStr).toBe('2026-09-15');
    expect(ctx.closeRefDateStr).toBe('2026-09-14');
  });

  it('getPrevCloseRefDay matches context closeRefDay', () => {
    const ctx = getPrevCloseContext('2026-09-14');
    expect(getDateET(getPrevCloseRefDay('2026-09-14'))).toBe(ctx.closeRefDateStr);
  });
});
