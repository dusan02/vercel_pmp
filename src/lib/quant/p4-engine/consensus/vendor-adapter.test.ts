/**
 * EstimizeConsensusAdapter — Unit Tests
 * ======================================
 *
 * Verifies CSV and API parsing produce canonical snapshots with correct
 * PIT timestamps (knownAt), and that revisions map created_at → revisionDate.
 *
 * Fixture: __fixtures__/estimize-consensus-sample.csv
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { EstimizeConsensusAdapter } from './vendor-adapter';

const FIXTURES = path.join(__dirname, '__fixtures__');

function num(v: string | undefined): number | null {
  if (v === undefined || v === '' ) return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function int(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function loadConsensusCsv(name: string): Record<string, unknown>[] {
  const text = fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
  const raw: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });
  return raw.map(r => ({
    Date: r['Date'],
    Ticker: r['Ticker'],
    Cusip: r['Cusip'],
    Instrument_id: r['Instrument_id'],
    Instrument_name: r['Instrument_name'],
    Fiscal_year: int(r['Fiscal_year']),
    Fiscal_quarter: int(r['Fiscal_quarter']),
    Reports_at: r['Reports_at'],
    'Estimize.eps.weighted': num(r['Estimize.eps.weighted']),
    'Estimize.eps.high': num(r['Estimize.eps.high']),
    'Estimize.eps.low': num(r['Estimize.eps.low']),
    'Estimize.eps.sd': num(r['Estimize.eps.sd']),
    'Estimize.eps.count': int(r['Estimize.eps.count']),
    'Estimize.revenue.weighted': num(r['Estimize.revenue.weighted']),
    'Estimize.revenue.high': num(r['Estimize.revenue.high']),
    'Estimize.revenue.low': num(r['Estimize.revenue.low']),
    'Estimize.revenue.sd': num(r['Estimize.revenue.sd']),
    'Estimize.revenue.count': int(r['Estimize.revenue.count']),
    'Reported.eps': num(r['Reported.eps']),
    'Reported.revenue': num(r['Reported.revenue']),
  }));
}

function loadEstimatesCsv(name: string): Record<string, unknown>[] {
  const text = fs.readFileSync(path.join(FIXTURES, name), 'utf-8');
  const raw: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });
  return raw.map(r => ({
    Estimate_id: r['Estimate_id'],
    Eps: num(r['Eps']),
    Revenue: num(r['Revenue']),
    Created_at: r['Created_at'],
    Flagged: r['Flagged'] === 'true',
    Release_id: r['Release_id'],
    Fiscal_quarter: int(r['Fiscal_quarter']),
    Fiscal_year: int(r['Fiscal_year']),
    Reported_eps: num(r['Reported.eps']),
    Reported_revenue: num(r['Reported.revenue']),
    Reports_at: r['Reports_at'],
    Point_in_time_ticker: r['Point_in_time_ticker'],
    Point_in_time_cusip: r['Point_in_time_cusip'],
    Analyst_id: r['Analyst_id'],
    Username: r['Username'],
  }));
}

describe('EstimizeConsensusAdapter — CSV parsing', () => {
  const adapter = new EstimizeConsensusAdapter();

  it('parses consensus CSV into canonical snapshots', () => {
    const rows = loadConsensusCsv('estimize-consensus-sample.csv');
    const snapshots = adapter.parseSnapshots(rows);

    expect(snapshots).not.toBeNull();
    expect(snapshots!.length).toBeGreaterThan(0);

    // Each CSV row with both EPS + revenue → 2 snapshots
    // 13 rows total; all have both metrics → 26 snapshots
    expect(snapshots!.length).toBe(26);
  });

  it('maps Date → knownAt (PIT timestamp)', () => {
    const rows = loadConsensusCsv('estimize-consensus-sample.csv');
    const snapshots = adapter.parseSnapshots(rows)!;

    const first = snapshots.find(s => s.ticker === 'AAPL' && s.metricType === 'EPS')!;
    expect(first.knownAt.toISOString()).toBe(new Date('2024-01-05').toISOString());
    // knownAt is NOT the period end / report date
    expect(first.knownAt.toISOString()).not.toBe(new Date('2024-02-01').toISOString());
  });

  it('maps consensus values correctly', () => {
    const rows = loadConsensusCsv('estimize-consensus-sample.csv');
    const snapshots = adapter.parseSnapshots(rows)!;

    const aaplQ1 = snapshots.filter(s => s.ticker === 'AAPL' && s.fiscalYear === 2024 && s.fiscalPeriod === 'Q1' && s.metricType === 'EPS');
    expect(aaplQ1.length).toBe(4); // 4 daily snapshots (incl. post-earnings)

    const last = aaplQ1[aaplQ1.length - 1];
    expect(last.consensusMean).toBe(2.40);
    expect(last.consensusHigh).toBe(2.48);
    expect(last.consensusLow).toBe(2.32);
    expect(last.consensusStdDev).toBe(0.03);
    expect(last.analystCount).toBe(15);
  });

  it('captures actuals on the post-earnings snapshot', () => {
    const rows = loadConsensusCsv('estimize-consensus-sample.csv');
    const snapshots = adapter.parseSnapshots(rows)!;

    // AAPL Q1: reported on 2024-02-01, actual appears in the 2024-02-05 row
    const withActual = snapshots.filter(s => s.ticker === 'AAPL' && s.fiscalPeriod === 'Q1' && s.metricType === 'EPS' && s.actualValue !== null);
    expect(withActual.length).toBe(1);
    expect(withActual[0].actualValue).toBe(2.18);
    expect(withActual[0].actualReportDate).toEqual(new Date('2024-02-01T21:30:00.000Z'));
  });

  it('produces stable sourceRecordHash for identical rows', () => {
    const rows = loadConsensusCsv('estimize-consensus-sample.csv');
    const s1 = adapter.parseSnapshots(rows)!;
    const s2 = adapter.parseSnapshots(rows)!;

    expect(s1.map(s => s.sourceRecordHash)).toEqual(s2.map(s => s.sourceRecordHash));
  });

  it('returns null for invalid input', () => {
    expect(adapter.parseSnapshots(null)).toBeNull();
    expect(adapter.parseSnapshots('not-an-object')).toBeNull();
  });

  it('parses estimates CSV into revision events (created_at → revisionDate)', () => {
    const rows = loadEstimatesCsv('estimize-estimates-sample.csv');
    const revisions = adapter.parseRevisions(rows)!;

    // 6 estimates; est-1004 is flagged (skipped); EPS + revenue split
    // est-1001..1003 have only Eps → 3 EPS revisions
    // est-2001, est-2002 have only Eps → 2 EPS revisions
    // Total: 5 EPS revisions (no revenue values in fixture)
    expect(revisions.length).toBe(5);

    const first = revisions[0];
    expect(first.revisionDate.toISOString()).toBe(new Date('2024-01-05T14:30:00.000Z').toISOString());
    expect(first.newEstimate).toBe(2.30);
    expect(first.analystId).toBe('an-77');
    expect(first.metricType).toBe('EPS');
  });

  it('skips flagged estimates', () => {
    const rows = loadEstimatesCsv('estimize-estimates-sample.csv');
    const revisions = adapter.parseRevisions(rows)!;

    // est-1004 (2.50, flagged) must not appear
    expect(revisions.find(r => r.newEstimate === 2.50)).toBeUndefined();
  });
});

describe('EstimizeConsensusAdapter — API JSON', () => {
  const adapter = new EstimizeConsensusAdapter();

  const apiResponse = {
    estimize: {
      eps: {
        revisions: [
          { mean: 2.30, high: 2.40, low: 2.20, standard_deviation: 0.05, count: 10, updated_at: '2024-01-05T14:30:00.000Z' },
          { mean: 2.38, high: 2.45, low: 2.30, standard_deviation: 0.04, count: 12, updated_at: '2024-01-20T10:00:00.000Z' },
        ],
        mean: 2.38, high: 2.45, low: 2.30, standard_deviation: 0.05, count: 12,
        updated_at: '2024-01-20T10:00:00.000Z',
      },
      revenue: {
        revisions: [],
        mean: 118000000000, high: 119000000000, low: 117000000000,
        standard_deviation: 700000000, count: 8,
        updated_at: '2024-01-20T10:00:00.000Z',
      },
    },
    wallstreet: {
      eps: { revisions: [], mean: 2.32, high: 2.4, low: 2.2, standard_deviation: 0.04, count: 18, updated_at: '2024-01-20T10:00:00.000Z' },
      revenue: { revisions: [], mean: 117900000000, high: 118500000000, low: 117000000000, standard_deviation: 500000000, count: 22, updated_at: '2024-01-20T10:00:00.000Z' },
    },
    _securityId: 'sec-146',
    _ticker: 'AAPL',
    _cik: '0000320193',
    _fiscalYear: 2024,
    _fiscalQuarter: 1,
    _periodEndDate: '2024-02-01T21:30:00.000Z',
    _actualEps: 2.18,
    _actualRevenue: 119580000000,
    _actualReportDate: '2024-02-01T21:30:00.000Z',
  };

  it('parses API response into snapshots with updated_at → knownAt', () => {
    const snapshots = adapter.parseSnapshots(apiResponse)!;
    expect(snapshots).not.toBeNull();

    // 1 current EPS + 2 EPS revisions + 1 current revenue + 0 revenue revisions
    expect(snapshots.length).toBe(4);

    const epsSnapshots = snapshots.filter(s => s.metricType === 'EPS');
    expect(epsSnapshots.length).toBe(3);

    // Current snapshot
    const current = epsSnapshots.find(s => s.consensusMean === 2.38 && s.analystCount === 12)!;
    expect(current.knownAt.toISOString()).toBe(new Date('2024-01-20T10:00:00.000Z').toISOString());
    expect(current.securityId).toBe('sec-146');
    expect(current.ticker).toBe('AAPL');
    expect(current.cik).toBe('0000320193');
    expect(current.actualValue).toBe(2.18);
  });

  it('uses Estimize consensus (not Wall Street)', () => {
    const snapshots = adapter.parseSnapshots(apiResponse)!;
    // Wall Street mean is 2.32 — must not appear
    expect(snapshots.find(s => s.consensusMean === 2.32)).toBeUndefined();
  });

  it('returns null when context fields are missing', () => {
    const noContext = { ...apiResponse };
    delete (noContext as Record<string, unknown>)._securityId;
    expect(adapter.parseSnapshots(noContext)).toBeNull();
  });
});
