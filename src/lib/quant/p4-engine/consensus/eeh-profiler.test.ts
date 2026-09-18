/**
 * Vendor Extract Profiler — Tests (Task 9)
 * ==========================================
 *
 * Runs the profiler over an explicitly SYNTHETIC CSV extract shaped
 * like the vendor-confirmed EEH columns. This fixture is TEST DATA —
 * it proves the profiler works, NOT that any vendor file is suitable.
 */

import { describe, it, expect } from 'vitest';
import { profileEehRecords, detectColumns, formatProfileSummary } from './eeh-profiler';
import { parseCsv } from './eeh-profiler-cli';
import { UniverseManifest } from './universe-manifest';
import { FROZEN_OOS_WINDOW } from './oos-coverage';

// ─── Synthetic EEH-shaped fixture (NOT vendor data) ─────────────────────────

const HEADER =
  'm_ticker,per_end_date,per_type,per_fisc_year,per_fisc_qtr,obs_date,' +
  'eps_mean_est,eps_med_est,eps_high_est,eps_low_est,eps_std_dev_est,' +
  'eps_cnt_est,eps_cnt_est_rev_up,eps_cnt_est_rev_down,sal_mean_est,extra_col';

const SYNTHETIC_CSV = [
  HEADER,
  // AAPL FY24 Q1 — 3 revisions (monotonic)
  'AAPL,2024-03-31,Q,2024,1,2024-01-05,2.10,2.11,2.18,2.02,0.05,12,1,0,90000,foo',
  'AAPL,2024-03-31,Q,2024,1,2024-02-05,2.15,2.14,2.20,2.05,0.05,13,2,0,90500,foo',
  'AAPL,2024-03-31,Q,2024,1,2024-03-05,2.18,2.17,2.25,2.10,0.06,13,1,1,91000,foo',
  // AAPL FY24 Q2 — null-mean row (zero coverage)
  'AAPL,2024-06-30,Q,2024,2,2024-04-10,,,,,,0,0,,foo',
  'AAPL,2024-06-30,Q,2024,2,2024-05-10,2.40,2.40,2.50,2.30,0.07,10,0,0,95000,foo',
  // MSFT FY24 Q4 annual-type + OOS-window row (monotonic file order)
  'MSFT,2024-06-30,A,2024,4,2023-07-10,10.5,10.4,11.0,10.0,0.4,19,0,1,,foo',
  'MSFT,2024-06-30,A,2024,4,2024-01-15,11.0,11.0,11.5,10.5,0.3,20,1,0,,foo',
  'MSFT,2024-06-30,A,2024,4,2024-03-15,11.2,11.2,11.6,10.8,0.3,21,2,0,,foo',
  // DEADC delisted ticker (terminated 2020) — history row only
  'DEADC,2020-06-30,Q,2020,2,2020-06-15,0.45,0.45,0.50,0.40,0.04,4,0,0,,foo',
  // PK duplicate with conflicting mean
  'AAPL,2024-03-31,Q,2024,1,2024-03-05,9.99,9.99,9.99,9.99,0.01,13,1,1,91000,foo',
  // Non-monotonic partition (obs_date out of order in file)
  'TSLA,2024-09-30,Q,2024,3,2024-08-20,0.60,0.60,0.65,0.55,0.03,8,0,0,,foo',
  'TSLA,2024-09-30,Q,2024,3,2024-08-01,0.55,0.55,0.60,0.50,0.03,7,1,0,,foo',
].join('\n');

const SYNTHETIC_UNIVERSE: UniverseManifest = {
  name: 'synthetic-universe',
  generatedAt: '2026-09-07T00:00:00.000Z',
  source: 'test',
  reproduces: 'test',
  oosWindow: { start: FROZEN_OOS_WINDOW.start, end: FROZEN_OOS_WINDOW.end },
  counts: { securities: 4, distinctTickers: 4, delistedOrEndedTickers: 1 },
  securities: [
    { securityId: 'sec-aapl', ticker: 'AAPL', startDate: '1980-12-12', endDate: null, exchange: 'NASDAQ', delisted: false },
    { securityId: 'sec-msft', ticker: 'MSFT', startDate: '1986-03-13', endDate: null, exchange: 'NASDAQ', delisted: false },
    { securityId: 'sec-tsla', ticker: 'TSLA', startDate: '2010-06-29', endDate: null, exchange: 'NASDAQ', delisted: false },
    { securityId: 'sec-dead', ticker: 'DEADC', startDate: '1990-01-01', endDate: '2020-12-31', exchange: 'NYSE', delisted: true },
  ],
};

describe('CSV parser', () => {
  it('parses headers and rows', () => {
    const recs = parseCsv('a,b\n1,2\n3,4\n');
    expect(recs).toHaveLength(2);
    expect(recs[0]).toEqual({ a: '1', b: '2' });
  });
  it('handles quoted fields with embedded commas', () => {
    const recs = parseCsv('a,b\n"x,y",2\n');
    expect(recs[0]!['a']).toBe('x,y');
  });
});

describe('detectColumns', () => {
  it('maps confirmed EEH aliases, tolerates case/underscore variants', () => {
    const det = detectColumns(['M_TICKER', 'Per_End_Date', 'OBS_DATE', 'eps_mean_est', 'weird_col']);
    expect(det.mapped.ticker).toBe('M_TICKER');
    expect(det.mapped.perEndDate).toBe('Per_End_Date');
    expect(det.mapped.obsDate).toBe('OBS_DATE');
    expect(det.mapped.epsMeanEst).toBe('eps_mean_est');
    expect(det.unrecognized).toContain('weird_col');
  });
  it('detects sales/revenue fields by prefix', () => {
    const det = detectColumns(['m_ticker', 'sal_mean_est', 'sal_cnt_est']);
    expect(det.salesFields).toEqual(['sal_mean_est', 'sal_cnt_est']);
    expect(det.salesFields.length).toBeGreaterThan(0);
  });

  it('STOPS on ambiguous mapping — never picks silently', () => {
    // Two headers both normalize to obs_date aliases
    const det = detectColumns(['m_ticker', 'obs_date', 'observation_date', 'per_end_date', 'per_type', 'eps_mean_est']);
    expect(det.usable).toBe(false);
    expect(det.ambiguities.some(a => a.startsWith('obsDate'))).toBe(true);
    expect(det.mapped.obsDate).toBeNull(); // not silently chosen
  });

  it('STOPS when a required field has no candidate', () => {
    const det = detectColumns(['m_ticker', 'per_end_date', 'per_type', 'obs_date']); // no eps_mean_est
    expect(det.usable).toBe(false);
    expect(det.missingRequired).toContain('epsMeanEst');
  });

  it('STOPS when one header is claimed by two fields', () => {
    // 'ticker' claims ticker field; duplicate raw headers normalize identically
    const det = detectColumns(['m_ticker', 'm_ticker', 'per_end_date', 'per_type', 'obs_date', 'eps_mean_est']);
    expect(det.usable).toBe(false);
    expect(det.ambiguities.some(a => a.includes('ticker'))).toBe(true);
  });
});

describe('profileEehRecords', () => {
  const records = parseCsv(SYNTHETIC_CSV);
  const profile = profileEehRecords(records, { universe: SYNTHETIC_UNIVERSE });

  it('row and ticker counts', () => {
    expect(profile.rows.total).toBe(12);
    expect(profile.tickers.unique).toBe(4); // AAPL MSFT DEADC TSLA
  });

  it('forecast partitions = distinct (ticker|per_end|per_type)', () => {
    // AAPL|2024-03-31|Q, AAPL|2024-06-30|Q, MSFT|2024-06-30|A, DEADC|2020-06-30|Q, TSLA|2024-09-30|Q
    expect(profile.partitions.count).toBe(5);
    expect(profile.partitions.perTypeDistribution['Q']).toBe(9);
    expect(profile.partitions.perTypeDistribution['A']).toBe(3);
  });

  it('obs_date min/max and per-year distribution', () => {
    expect(profile.obsDate.min).toBe('2020-06-15T00:00:00.000Z');
    expect(profile.obsDate.max).toBe('2024-08-20T00:00:00.000Z');
    expect(profile.obsDate.perYear['2024']).toBe(10);
  });

  it('revisions-per-partition stats', () => {
    // partitions: AAPL-Q1 4 (3 + dup), AAPL-Q2 2, MSFT-A 3, DEADC 1, TSLA 2
    const r = profile.obsDate.revisionsPerPartition;
    expect(r.min).toBe(1);
    expect(r.max).toBe(4);
    expect(r.median).toBe(2);
  });

  it('null rates per estimate field (not just mean)', () => {
    // eps_mean_est: 1 null of 12 (the zero-coverage row)
    expect(profile.nullRates['epsMeanEst']?.nulls).toBe(1);
    expect(profile.nullRates['epsMeanEst']?.pct).toBeCloseTo(8.33, 1);
    // sal_mean_est: 5 nulls
    expect(profile.nullRates).not.toHaveProperty('salMeanEst'); // not a mapped canonical field
    expect(profile.fields.salesFieldsFound).toContain('sal_mean_est');
  });

  it('PK duplicate detection with conflicting values', () => {
    expect(profile.obsDate.pkConflicts).toBe(1); // the 9.99 dup on AAPL 2024-03-05
  });

  it('non-monotonic partition detection', () => {
    expect(profile.obsDate.nonMonotonicPartitions).toBe(1); // TSLA
  });

  it('sanity checks: negative counts, extreme estimates', () => {
    expect(profile.sanity.negativeAnalystCounts).toBe(0);
    expect(profile.sanity.extremeEpsEstimates).toBe(0); // 9.99 < 1000
  });

  it('universe overlap incl. delisted', () => {
    expect(profile.universe).toBeDefined();
    expect(profile.universe!.matchedTickers).toBe(4); // all universe tickers present
    expect(profile.universe!.missingTickers).toEqual([]);
    expect(profile.universe!.terminatedTickersMatched).toBe(1); // DEADC
    expect(profile.universe!.terminatedTickersMissing).toEqual([]);
  });

  it('OOS coverage uses the frozen window by default', () => {
    const c = profile.oosCoverage!;
    expect(c.window).toEqual({ start: '2023-06-18', end: '2025-09-30' });
    // In-window rows: 2023-07 (MSFT) + 2024-01,02,03,04,05,08 → 7 months;
    // securities in-window: AAPL, MSFT, TSLA = 3
    expect(c.monthsCovered).toBe(7);
    expect(c.securitiesCovered).toBe(3);
    expect(c.monthsTotal).toBe(28);
    expect(c.monthsMissing).toHaveLength(21);
    expect(c.securitiesMissing).toEqual(['sec-dead']);
  });

  it('unparseable rows are counted, not crashed on', () => {
    const bad = parseCsv(
      'm_ticker,per_end_date,per_type,obs_date,eps_mean_est\n' +
      ',2024-03-31,Q,2024-01-05,2.10\n' +
      'AAPL,not-a-date,Q,2024-01-05,2.10\n' +
      'AAPL,2024-03-31,Q,garbage,2.10\n',
    );
    const p = profileEehRecords(bad);
    expect(p.rows.unparseableTicker).toBe(1);
    expect(p.rows.unparseablePerEndDate).toBe(1);
    expect(p.rows.unparseableObsDate).toBe(1);
  });

  it('missing columns degrade to null sections, not exceptions', () => {
    const p = profileEehRecords(parseCsv('foo,bar\n1,2\n'));
    expect(p.tickers.unique).toBe(0);
    expect(p.obsDate.min).toBeNull();
    expect(p.columns.mapped.ticker).toBeNull();
  });

  it('summary is human-readable and ends with STOP', () => {
    const summary = formatProfileSummary(profile);
    expect(summary).toContain('Unique tickers: 4');
    expect(summary).toContain('OOS window 2023-06-18 → 2025-09-30');
    expect(summary).toContain('STOP');
  });

  it('is deterministic — same input, same profile', () => {
    const a = profileEehRecords(records, { universe: SYNTHETIC_UNIVERSE });
    const b = profileEehRecords(records, { universe: SYNTHETIC_UNIVERSE });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
