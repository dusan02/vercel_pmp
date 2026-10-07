import { findForeignBoundary, foreignCutoffMs, spliceContinuous, TICKER_RENAMES } from '../lib/tickerRenames';

const DAY = 86400000;
const mk = (closes: number[]) => closes.map((c, i) => ({ t: 1700000000000 + i * DAY, c }));

describe('findForeignBoundary', () => {
  it('detects META-style contamination: METV ETF ~$15 → real Meta ~$175 (14×)', () => {
    const aggs = mk([14.3, 14.8, 14.9, 15.3, 15.7, 12.31, 175.57, 180.1, 179.2, 178.0]);
    expect(findForeignBoundary(aggs)).toBe(6);
  });

  it('detects downward contamination: foreign $266 → Coherent $44 (0.17×)', () => {
    const aggs = mk([252, 260, 266, 44.2, 45.0, 44.8, 46.1]);
    expect(findForeignBoundary(aggs)).toBe(3);
  });

  it('returns -1 for a clean series', () => {
    const aggs = mk([100, 102, 99, 103, 105, 104, 108, 110]);
    expect(findForeignBoundary(aggs)).toBe(-1);
  });

  it('ignores real extreme moves below the threshold (GME squeeze ~2.4×/day)', () => {
    const aggs = mk([20, 40, 90, 147, 347, 300, 200, 220]);
    expect(findForeignBoundary(aggs)).toBe(-1);
  });

  it('ignores a real crash above the crash threshold (UPST −56% = 0.44)', () => {
    const aggs = mk([100, 99, 44, 45, 46, 44.5, 47]);
    expect(findForeignBoundary(aggs)).toBe(-1);
  });

  it('ignores a one-bar bad print that reverts next bar', () => {
    const aggs = mk([100, 101, 0.001, 102, 103, 104, 105]);
    expect(findForeignBoundary(aggs)).toBe(-1);
  });

  it('does not truncate the whole history for a jump in the last 3 bars', () => {
    const aggs = mk([100, 102, 99, 101, 6]);
    expect(findForeignBoundary(aggs)).toBe(-1);
  });

  it('skips non-positive closes', () => {
    const aggs = mk([100, 0, 100, 101, 102]);
    expect(findForeignBoundary(aggs)).toBe(-1);
  });
});

describe('foreignCutoffMs', () => {
  it('returns null for a clean untracked series', () => {
    expect(foreignCutoffMs('AAPL', mk([100, 101, 102, 103, 104, 105]))).toBeNull();
  });

  it('META: detected boundary wins (equals the rename date)', () => {
    const aggs = mk([15, 15.5, 16, 14, 175, 178, 180, 179]);
    const cutoff = foreignCutoffMs('META', aggs);
    expect(cutoff).toBe(aggs[4]!.t);
  });

  it('BNY: late Polygon switch — detected boundary (2026-05) beats declared rename (2025-06)', () => {
    const t0 = Date.parse('2026-05-11T00:00:00Z');
    const aggs = [15.2, 14.9, 15.1, 10.2, 139.15, 140.2, 141.0, 142.5].map((c, i) => ({ t: t0 + i * DAY, c }));
    const cutoff = foreignCutoffMs('BNY', aggs);
    expect(cutoff).toBe(aggs[4]!.t);
    expect(cutoff).toBeGreaterThan(Date.parse('2025-06-24T00:00:00Z'));
  });

  it('multi-jump foreign prefix: the LAST boundary marks the real instrument', () => {
    // foreign segment jumps internally, then the instrument flips — only the
    // second jump is the true boundary.
    const aggs = mk([3, 3.1, 40, 41, 28, 150, 152, 151, 149]);
    expect(findForeignBoundary(aggs)).toBe(5);
  });

  it('SAIL: silent 0.38× IPO transition — validFrom drives the cutoff', () => {
    // Detector cannot fire (0.38 > 0.35), the declared IPO date still drops the prefix.
    const t = Date.parse('2025-02-10T00:00:00Z');
    const aggs = [60, 62, 65, 24.5, 25.1, 24.8, 26.0].map((c, i) => ({ t: t + i * DAY, c }));
    expect(findForeignBoundary(aggs)).toBe(-1); // too smooth to detect
    expect(foreignCutoffMs('SAIL', aggs)).toBe(Date.parse('2025-02-13T00:00:00Z'));
  });

  it('B: silent ~0.5× Barnes→Barrick swap — validFrom drives the cutoff', () => {
    const t = Date.parse('2025-05-05T00:00:00Z');
    const aggs = [43, 44, 42.5, 20.1, 19.8, 20.4, 21.0].map((c, i) => ({ t: t + i * DAY, c }));
    expect(findForeignBoundary(aggs)).toBe(-1);
    expect(foreignCutoffMs('B', aggs)).toBe(Date.parse('2025-05-09T00:00:00Z'));
  });

  it('SPCX: detector-only entry still truncates on an extreme jump', () => {
    const aggs = mk([22, 21.5, 21.9, 161, 162, 160, 163, 165]);
    const cutoff = foreignCutoffMs('SPCX', aggs);
    expect(cutoff).toBe(aggs[3]!.t);
  });

  it('detector protects even untracked tickers from absurd contamination', () => {
    const aggs = mk([3, 3.1, 3.05, 90, 91, 89, 92, 93]);
    expect(foreignCutoffMs('ZZZZ', aggs)).toBe(aggs[3]!.t);
  });
});

describe('spliceContinuous', () => {
  it('accepts same-company joins (FB 196.64 → META 175.57)', () => {
    expect(spliceContinuous(196.64, 175.57)).toBe(true);
  });
  it('accepts IIVI 41.95 → COHR 44.23', () => {
    expect(spliceContinuous(41.95, 44.23)).toBe(true);
  });
  it('accepts BK 137.16 → BNY 139.15 across the year-long Polygon lag', () => {
    expect(spliceContinuous(137.16, 139.15)).toBe(true);
  });
  it('rejects a >2× gap — would draw a fake cliff', () => {
    expect(spliceContinuous(50, 120)).toBe(false);
    expect(spliceContinuous(120, 50)).toBe(false);
  });
  it('rejects non-positive closes', () => {
    expect(spliceContinuous(0, 100)).toBe(false);
  });
});

describe('TICKER_RENAMES table', () => {
  it('has no source pointing at a renamed ticker itself (no chains)', () => {
    for (const r of Object.values(TICKER_RENAMES)) {
      expect(r.source === null || !(r.source in TICKER_RENAMES)).toBe(true);
    }
  });
});
