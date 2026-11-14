import { readFileSync } from 'fs';
import { join } from 'path';
import {
  computePerformance,
  computeRisk,
  adjustDividendsForSplits,
  buildDividendProfile,
  attachSessionVwap,
  exchangeLabel,
  securityTypeLabel,
  edgarUrl,
  formatListedLabel,
  formatDivAmount,
  type DailyClose,
  type IntradayBar,
} from '@/lib/analysis/marketProfileMath';
import { formatOrdinal } from '@/lib/utils/format';
import { chunkQuery } from '@/lib/db/chunkQuery';

function makeDailySeries(
  startDate: string,
  days: number,
  priceFn: (idx: number, dateStr: string) => number,
): DailyClose[] {
  const out: DailyClose[] = [];
  const startMs = Date.parse(`${startDate}T05:00:00Z`);
  for (let i = 0; i < days; i++) {
    const t = startMs + i * 86_400_000;
    const d = new Date(t);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    const ds = d.toISOString().slice(0, 10);
    out.push({ t, c: priceFn(i, ds) });
  }
  return out;
}

describe('computePerformance', () => {
  it('computes 1W through 5Y and YTD returns and excess diff vs SPY', () => {
    // 5.2 years of calendar days so 5Y window is populated
    const stock = makeDailySeries('2021-01-01', 1900, (i) => 100 * Math.pow(1.0005, i));
    const spy = makeDailySeries('2021-01-01', 1900, (i) => 100 * Math.pow(1.0002, i));

    const { asOf, rows } = computePerformance(stock, spy);
    expect(asOf).not.toBeNull();
    expect(rows.map((r) => r.key)).toEqual(['1W', '1M', '3M', '6M', 'YTD', '1Y', '3Y', '5Y']);

    const oneY = rows.find((r) => r.key === '1Y')!;
    expect(oneY.stock).toBeGreaterThan(15);
    expect(oneY.spx).toBeGreaterThan(5);
    expect(oneY.diff).toBeCloseTo(oneY.stock! - oneY.spx!, 1);
  });

  it('drops trailing horizons beyond stock listing history', () => {
    const stock = makeDailySeries('2025-11-01', 120, (i) => 50 + i * 0.1);
    const spy = makeDailySeries('2021-01-01', 1900, (i) => 100 + i * 0.05);

    const { rows } = computePerformance(stock, spy);
    const keys = rows.map((r) => r.key);
    expect(keys).toContain('1W');
    expect(keys).toContain('1M');
    expect(keys).toContain('3M');
    expect(keys).not.toContain('1Y');
    expect(keys).not.toContain('5Y');
  });

  it('returns empty for insufficient bars', () => {
    expect(computePerformance([], [])).toEqual({ asOf: null, rows: [] });
  });
});

describe('computeRisk', () => {
  it('computes beta, annualized volatility, and max drawdown on aligned 1Y series', () => {
    // Alternating +1% / -0.5% on SPY and exact 2x (+2% / -1%) on stock, plus a drawdown segment
    const spy: DailyClose[] = [];
    const stock: DailyClose[] = [];
    let pSpy = 100;
    let pStock = 100;
    const startMs = Date.parse('2025-01-02T05:00:00Z');
    for (let i = 0; i < 365; i++) {
      const t = startMs + i * 86_400_000;
      const wd = new Date(t).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      if (i > 0) {
        const rm = i % 2 === 0 ? 0.01 : -0.006;
        pSpy *= 1 + rm;
        pStock *= 1 + 2 * rm;
      }
      spy.push({ t, c: pSpy });
      stock.push({ t, c: pStock });
    }

    const risk = computeRisk(stock, spy);
    expect(risk).not.toBeNull();
    expect(risk!.n).toBeGreaterThan(200);
    expect(risk!.beta).toBeCloseTo(2.0, 1);
    expect(risk!.vol!).toBeGreaterThan(risk!.spxVol!);
    expect(risk!.maxDrawdown!).toBeLessThan(0);
    expect(risk!.spxMaxDrawdown!).toBeLessThan(0);
  });

  it('returns null when fewer than 120 aligned returns exist', () => {
    const short = makeDailySeries('2026-06-01', 60, (i) => 100 + i);
    expect(computeRisk(short, short)).toBeNull();
  });
});

describe('adjustDividendsForSplits', () => {
  it('adjusts pre-split dividends (e.g. AAPL 4:1 split) and keeps post-split intact', () => {
    const raw = [
      { ex_dividend_date: '2020-11-06', pay_date: '2020-11-12', cash_amount: 0.205, dividend_type: 'CD', frequency: 4 },
      { ex_dividend_date: '2020-08-07', pay_date: '2020-08-13', cash_amount: 0.82, dividend_type: 'CD', frequency: 4 },
      { ex_dividend_date: '2020-05-08', pay_date: '2020-05-14', cash_amount: 0.82, dividend_type: 'CD', frequency: 4 },
      { ex_dividend_date: '2020-05-08', pay_date: '2020-05-14', cash_amount: 0.1, dividend_type: 'LT', frequency: 1 },
    ];
    const splits = [
      { execution_date: '2020-08-31', split_from: 1, split_to: 4 },
    ];

    const events = adjustDividendsForSplits(raw, splits);
    expect(events).toHaveLength(3);
    expect(events[0]!.exDate).toBe('2020-11-06');
    expect(events[0]!.amount).toBeCloseTo(0.205, 4);
    expect(events[1]!.exDate).toBe('2020-08-07');
    expect(events[1]!.amount).toBeCloseTo(0.205, 4);
    expect(events[2]!.exDate).toBe('2020-05-08');
    expect(events[2]!.amount).toBeCloseTo(0.205, 4);
  });

  it('marks SC dividends as special and deduplicates identical records', () => {
    const raw = [
      { ex_dividend_date: '2025-12-01', cash_amount: 1.5, dividend_type: 'SC', frequency: 0 },
      { ex_dividend_date: '2025-12-01', cash_amount: 1.5, dividend_type: 'SC', frequency: 0 },
    ];
    const events = adjustDividendsForSplits(raw, []);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe('special');
    expect(events[0]!.amount).toBe(1.5);
  });
});

describe('buildDividendProfile', () => {
  it('computes forward annual rate, TTM total, 5Y CAGR, streak, and upcoming event', () => {
    // Quarterly payments growing each year from 2020 (0.20) to 2026 (0.32)
    const raw = [];
    const years = [2020, 2021, 2022, 2023, 2024, 2025, 2026];
    for (let yi = 0; yi < years.length; yi++) {
      const y = years[yi]!;
      const amt = Number((0.20 + yi * 0.02).toFixed(2));
      for (const m of ['02', '05', '08', '11']) {
        raw.push({
          ex_dividend_date: `${y}-${m}-10`,
          pay_date: `${y}-${m}-20`,
          cash_amount: amt,
          dividend_type: 'CD',
          frequency: 4,
        });
      }
    }
    const events = adjustDividendsForSplits(raw, []);
    const profile = buildDividendProfile(events, '2026-10-01', 'USD');
    expect(profile).not.toBeNull();
    expect(profile!.active).toBe(true);
    expect(profile!.frequencyLabel).toBe('Quarterly');
    // Last regular exDate <= 2026-10-01 is 2026-08-10 at 0.32 -> 0.32 * 4 = 1.28
    expect(profile!.forwardAnnual).toBeCloseTo(1.28, 3);
    // Upcoming is 2026-11-10
    expect(profile!.upcoming?.exDate).toBe('2026-11-10');
    expect(profile!.last?.exDate).toBe('2026-08-10');
    // TTM includes 2025-11 (0.30) + 2026-02,05,08 (0.32 * 3) = 1.26
    expect(profile!.ttmTotal).toBeCloseTo(1.26, 3);
    // 5Y earlier TTM (ending 2021-10-01): 2020-11 (0.20) + 2021-02,05,08 (0.22 * 3) = 0.86
    // CAGR = (1.26/0.86)^(1/5) - 1 ≈ 7.94%
    expect(profile!.cagr5y).toBeCloseTo(7.94, 1);
    // Years completed: 2025 > 2024 > 2023 > 2022 > 2021 > 2020 = 5 consecutive increases
    expect(profile!.growthStreak).toBe(5);
    expect(profile!.streakCapped).toBe(true);
  });
});

describe('attachSessionVwap', () => {
  it('anchors VWAP at 9:30 ET open and returns null outside regular hours when regular bars exist', () => {
    // 2026-11-13 is EST (UTC-5): 09:00 ET = 14:00Z, 09:30 ET = 14:30Z, 09:35 ET = 14:35Z, 16:05 ET = 21:05Z
    const bars: IntradayBar[] = [
      { t: Date.parse('2026-11-13T14:00:00Z'), c: 100, v: 5000, vw: 100 }, // 09:00 pre-market -> null
      { t: Date.parse('2026-11-13T14:30:00Z'), c: 102, v: 1000, vw: 102 }, // 09:30 open -> 102
      { t: Date.parse('2026-11-13T14:35:00Z'), c: 106, v: 3000, vw: 106 }, // 09:35 -> (102*1000 + 106*3000)/4000 = 105
      { t: Date.parse('2026-11-13T21:05:00Z'), c: 110, v: 1000, vw: 110 }, // 16:05 after-hours -> null
    ];
    const vwaps = attachSessionVwap(bars);
    expect(vwaps[0]).toBeNull();
    expect(vwaps[1]).toBeCloseTo(102, 4);
    expect(vwaps[2]).toBeCloseTo(105, 4);
    expect(vwaps[3]).toBeNull();
  });

  it('anchors at first bar during pre-market when no regular-session bars exist yet', () => {
    const bars: IntradayBar[] = [
      { t: Date.parse('2026-11-13T12:00:00Z'), c: 200, v: 100, vw: 200 },
      { t: Date.parse('2026-11-13T12:05:00Z'), c: 204, v: 100, vw: 204 },
    ];
    const vwaps = attachSessionVwap(bars);
    expect(vwaps[0]).toBeCloseTo(200, 4);
    expect(vwaps[1]).toBeCloseTo(202, 4);
  });
});

describe('fact formatters', () => {
  it('maps exchange MICs, security types, and builds safe SEC EDGAR links', () => {
    expect(exchangeLabel('XNAS')).toBe('NASDAQ');
    expect(exchangeLabel('XNYS')).toBe('NYSE');
    expect(securityTypeLabel('CS')).toBe('Common stock');
    expect(securityTypeLabel('ADRC')).toBe('ADR');
    expect(edgarUrl('0000320193')).toBe('https://www.sec.gov/edgar/browse/?CIK=320193');
    expect(edgarUrl('bad')).toBeNull();
    expect(edgarUrl(null)).toBeNull();
  });

  it('formats listing labels and dividend currency amounts', () => {
    expect(formatListedLabel('1980-12-12', 2026)).toBe('Listed Dec 1980 · 46y');
    expect(formatListedLabel('2026-03-01', 2026)).toBe('Listed Mar 2026');
    expect(formatDivAmount(0.25)).toBe('$0.25');
    expect(formatDivAmount(0.0825)).toBe('$0.0825');
    expect(formatDivAmount(1.5, 'EUR')).toBe('EUR 1.50');
  });

  it('formats ordinal numbers accurately across edge cases', () => {
    expect(formatOrdinal(1)).toBe('1st');
    expect(formatOrdinal(2)).toBe('2nd');
    expect(formatOrdinal(3)).toBe('3rd');
    expect(formatOrdinal(4)).toBe('4th');
    expect(formatOrdinal(11)).toBe('11th');
    expect(formatOrdinal(12)).toBe('12th');
    expect(formatOrdinal(13)).toBe('13th');
    expect(formatOrdinal(21)).toBe('21st');
    expect(formatOrdinal(72.4)).toBe('72nd');
  });
});

describe('chunkQuery', () => {
  it('returns empty for empty input, runs single batch when under limit, and chunks larger inputs', async () => {
    const emptyFn = jest.fn(async () => []);
    expect(await chunkQuery([], emptyFn)).toEqual([]);
    expect(emptyFn).not.toHaveBeenCalled();

    const batches: string[][] = [];
    const res = await chunkQuery(['A', 'B', 'C', 'D', 'E'], async (chunk) => {
      batches.push(chunk);
      return chunk.map((s) => `${s}!`);
    }, 2);
    expect(batches).toEqual([['A', 'B'], ['C', 'D'], ['E']]);
    expect(res).toEqual(['A!', 'B!', 'C!', 'D!', 'E!']);
  });
});

describe('ISR safety invariants', () => {
  it('marketProfile.ts never uses cache: no-store fetch (runs inside ISR /analysis/[ticker])', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/analysis/marketProfile.ts'), 'utf8');
    expect(src).not.toMatch(/cache\s*:\s*['"]no-store['"]/);
    expect(src).not.toMatch(/['"]no-store['"]/);
  });
});
