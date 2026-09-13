/**
 * Estimize Ingest Pipeline — Unit Tests
 * ======================================
 *
 * Verifies:
 *   1. buildFactRows: ticker resolution (PIT-correct), dedup, supersededAt chains
 *   2. buildRevisionRows: hash dedup, ticker resolution
 *   3. PIT validator: leakage = HARD FAILURE, duplicates, chain consistency
 *   4. Ingest idempotency: same input twice → no new rows
 *
 * Uses an in-memory TickerResolver + in-memory store — no real Postgres needed.
 */

import { describe, it, expect } from 'vitest';
import * as crypto from 'crypto';
import {
  buildFactRows,
  buildRevisionRows,
  buildReport,
  normalizeTicker,
  normalizeDate,
  buildSupersededChain,
} from './estimize-ingest';
import {
  validateConsensusFacts,
  validateConsensusRevisions,
  buildCoverageReport,
} from './pit-consensus-validator';
import {
  CanonicalConsensusSnapshot,
  CanonicalRevisionEvent,
} from './vendor-adapter';
import {
  ConsensusFactInsert,
  QuarantineEntry,
  TickerResolver,
} from './consensus-ingest-types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hash(obj: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function makeSnapshot(overrides: Partial<CanonicalConsensusSnapshot> = {}): CanonicalConsensusSnapshot {
  const record = { ticker: 'AAPL', knownAt: '2024-01-05', metric: 'EPS', ...overrides };
  return {
    securityId: 'sec-aapl',
    ticker: 'AAPL',
    cik: '0000320193',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-02-01T21:30:00.000Z'),
    knownAt: new Date('2024-01-05'),
    metricType: 'EPS',
    consensusMean: 2.35,
    consensusMedian: null,
    consensusHigh: 2.42,
    consensusLow: 2.28,
    consensusStdDev: 0.04,
    analystCount: 12,
    actualValue: null,
    actualReportDate: null,
    sourceProvider: 'ESTIMIZE',
    sourceType: 'CSV',
    sourceRecordHash: hash(record),
    ...overrides,
  };
}

const resolver: TickerResolver = {
  resolve(ticker: string): string | null {
    const map: Record<string, string> = { AAPL: 'sec-aapl', MSFT: 'sec-msft' };
    return map[ticker.toUpperCase()] ?? null;
  },
};

// ─── Normalization ───────────────────────────────────────────────────────────

describe('normalizeTicker', () => {
  it('uppercases and trims', () => {
    expect(normalizeTicker(' aapl ')).toBe('AAPL');
  });

  it('strips exchange suffixes', () => {
    expect(normalizeTicker('AAPL.US')).toBe('AAPL');
    expect(normalizeTicker('msft.nasdaq')).toBe('MSFT');
    expect(normalizeTicker('TSLA.NYSE')).toBe('TSLA');
  });
});

describe('normalizeDate', () => {
  it('normalizes to UTC midnight', () => {
    const d = normalizeDate('2024-01-05T14:30:00.000Z');
    expect(d!.toISOString()).toBe('2024-01-05T00:00:00.000Z');
  });

  it('returns null for invalid dates', () => {
    expect(normalizeDate('not-a-date')).toBeNull();
  });
});

describe('buildSupersededChain', () => {
  it('chains snapshots in knownAt order, last is open (null)', () => {
    const s1 = makeSnapshot({ knownAt: new Date('2024-01-05') });
    const s2 = makeSnapshot({ knownAt: new Date('2024-01-20') });
    const s3 = makeSnapshot({ knownAt: new Date('2024-01-31') });

    const chain = buildSupersededChain([s3, s1, s2]); // unsorted input

    expect(chain.get(s1)).toEqual(new Date('2024-01-20'));
    expect(chain.get(s2)).toEqual(new Date('2024-01-31'));
    expect(chain.get(s3)).toBeNull();
  });
});

// ─── buildFactRows ───────────────────────────────────────────────────────────

describe('buildFactRows', () => {
  it('resolves tickers to securityIds', () => {
    const snapshots = [makeSnapshot({ ticker: 'MSFT', securityId: '' })];
    const rows = buildFactRows(snapshots, resolver, []);
    expect(rows[0].securityId).toBe('sec-msft');
  });

  it('quarantines unresolvable tickers (DEAD from fixture)', () => {
    const snapshots = [makeSnapshot({ ticker: 'DEAD', securityId: '' })];
    const quarantine: QuarantineEntry[] = [];
    const rows = buildFactRows(snapshots, resolver, quarantine);

    expect(rows.length).toBe(0);
    expect(quarantine.length).toBe(1);
    expect(quarantine[0].reason).toBe('TICKER_UNRESOLVED');
  });

  it('dedups identical sourceRecordHashes', () => {
    const s = makeSnapshot();
    const rows = buildFactRows([s, { ...s }], resolver, []);
    expect(rows.length).toBe(1);
  });

  it('builds supersededAt chains within (security, period, metric) groups', () => {
    const s1 = makeSnapshot({ knownAt: new Date('2024-01-05') });
    const s2 = makeSnapshot({ knownAt: new Date('2024-01-20') });
    const rows = buildFactRows([s1, s2], resolver, []);

    expect(rows.length).toBe(2);
    const byObs = new Map(rows.map(r => [r.observationDate.toISOString(), r]));
    expect(byObs.get('2024-01-05T00:00:00.000Z')!.supersededAt).toEqual(new Date('2024-01-20'));
    expect(byObs.get('2024-01-20T00:00:00.000Z')!.supersededAt).toBeNull();
  });

  it('does not chain across different metrics', () => {
    const eps = makeSnapshot({ metricType: 'EPS', knownAt: new Date('2024-01-05') });
    const rev = makeSnapshot({ metricType: 'REVENUE', knownAt: new Date('2024-01-06') });
    const rows = buildFactRows([eps, rev], resolver, []);

    expect(rows.length).toBe(2);
    // Both are the only snapshot in their group → open chain
    expect(rows.every(r => r.supersededAt === null)).toBe(true);
  });

  it('is deterministic — same input, same output (row order and hashes)', () => {
    const snapshots = [
      makeSnapshot({ knownAt: new Date('2024-01-20') }),
      makeSnapshot({ knownAt: new Date('2024-01-05') }),
      makeSnapshot({ ticker: 'MSFT', securityId: 'sec-msft', knownAt: new Date('2024-01-10') }),
    ];

    const a = buildFactRows(snapshots, resolver, []);
    const b = buildFactRows([...snapshots].reverse(), resolver, []);

    expect(a.map(r => r.sourceRecordHash)).toEqual(b.map(r => r.sourceRecordHash));
    expect(a.map(r => r.observationDate.toISOString())).toEqual(b.map(r => r.observationDate.toISOString()));
  });
});

// ─── PIT Validator ───────────────────────────────────────────────────────────

describe('validateConsensusFacts', () => {
  const baseFact = (overrides: Partial<ConsensusFactInsert>): ConsensusFactInsert => ({
    securityId: 'sec-aapl',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-02-01'),
    observationDate: new Date('2024-01-05'),
    availableAt: new Date('2024-01-05'),
    supersededAt: null,
    metricType: 'EPS',
    consensusMean: 2.35,
    consensusMedian: null,
    consensusHigh: 2.42,
    consensusLow: 2.28,
    consensusStdDev: 0.04,
    analystCount: 12,
    actualValue: null,
    actualReportDate: null,
    sourceProvider: 'ESTIMIZE',
    sourceType: 'CSV',
    sourceRecordHash: 'h1',
    ...overrides,
  });

  it('passes clean data', () => {
    const result = validateConsensusFacts([baseFact({})]);
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('HARD FAILS on leakage: actual attached to pre-earnings snapshot', () => {
    const rows = [
      baseFact({
        observationDate: new Date('2024-01-31'),
        availableAt: new Date('2024-01-31'),
        actualValue: 1.90,
        actualReportDate: new Date('2024-02-01'),
      }),
    ];
    const result = validateConsensusFacts(rows);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('LEAKAGE');
  });

  it('allows post-earnings event snapshot (actual attached after report date)', () => {
    const rows = [
      baseFact({
        observationDate: new Date('2024-02-05'),
        availableAt: new Date('2024-02-05'),
        actualValue: 1.90,
        actualReportDate: new Date('2024-02-01'),
      }),
    ];
    expect(validateConsensusFacts(rows).passed).toBe(true);
  });

  it('HARD FAILS when availableAt < observationDate', () => {
    const rows = [
      baseFact({
        observationDate: new Date('2024-01-10'),
        availableAt: new Date('2024-01-05'),
      }),
    ];
    const result = validateConsensusFacts(rows);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('TEMPORAL');
  });

  it('HARD FAILS on future-dated observations', () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const rows = [baseFact({ observationDate: farFuture, availableAt: farFuture })];
    const result = validateConsensusFacts(rows);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('FUTURE_DATA');
  });

  it('HARD FAILS on duplicate PIT observations with conflicting values', () => {
    const rows = [
      baseFact({ consensusMean: 2.35, sourceRecordHash: 'h1' }),
      baseFact({ consensusMean: 2.50, sourceRecordHash: 'h2' }),
    ];
    const result = validateConsensusFacts(rows);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('DUPLICATE_CONFLICT');
  });

  it('warns (not fails) on identical duplicates', () => {
    const rows = [
      baseFact({ sourceRecordHash: 'h1' }),
      baseFact({ sourceRecordHash: 'h2' }), // same values, different hash
    ];
    const result = validateConsensusFacts(rows);
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('DUPLICATE_IDENTICAL');
  });

  it('HARD FAILS on broken supersededAt chain', () => {
    const rows = [
      baseFact({ supersededAt: new Date('2024-01-01') }), // before observation
    ];
    const result = validateConsensusFacts(rows);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('CHAIN');
  });
});

describe('validateConsensusRevisions', () => {
  const baseRev = (overrides: Partial<ConsensusRevisionInsert>): ConsensusRevisionInsert => ({
    securityId: 'sec-aapl',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-02-01'),
    revisionDate: new Date('2024-01-05'),
    availableAt: new Date('2024-01-05'),
    analystId: 'an-77',
    analystName: 'quant_alice',
    metricType: 'EPS',
    priorEstimate: null,
    newEstimate: 2.30,
    sourceProvider: 'ESTIMIZE',
    sourceType: 'CSV',
    sourceRecordHash: 'r1',
    ...overrides,
  });

  it('passes monotonic chains', () => {
    const rows = [
      baseRev({ revisionDate: new Date('2024-01-05'), newEstimate: 2.30 }),
      baseRev({ revisionDate: new Date('2024-01-20'), priorEstimate: 2.30, newEstimate: 2.40, sourceRecordHash: 'r2' }),
    ];
    const result = validateConsensusRevisions(rows);
    expect(result.passed).toBe(true);
  });

  it('HARD FAILS on same-timestamp conflicting revisions', () => {
    const rows = [
      baseRev({ newEstimate: 2.30, sourceRecordHash: 'r1' }),
      baseRev({ newEstimate: 2.50, sourceRecordHash: 'r2' }),
    ];
    const result = validateConsensusRevisions(rows);
    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain('REVISION_CONFLICT');
  });

  it('warns on chain gaps (priorEstimate != previous newEstimate)', () => {
    const rows = [
      baseRev({ revisionDate: new Date('2024-01-05'), newEstimate: 2.30 }),
      baseRev({ revisionDate: new Date('2024-01-20'), priorEstimate: 2.10, newEstimate: 2.40, sourceRecordHash: 'r2' }),
    ];
    const result = validateConsensusRevisions(rows);
    expect(result.passed).toBe(true);
    expect(result.warnings.length).toBe(1);
    expect(result.warnings[0]).toContain('CHAIN_GAP');
  });
});

// ─── buildRevisionRows ───────────────────────────────────────────────────────

describe('buildRevisionRows', () => {
  function makeRevision(overrides: Partial<CanonicalRevisionEvent> = {}): CanonicalRevisionEvent {
    const record = { ticker: 'AAPL', rev: '2024-01-05', ...overrides };
    return {
      securityId: '',
      ticker: 'AAPL',
      fiscalYear: 2024,
      fiscalPeriod: 'Q1',
      periodEndDate: new Date('2024-02-01'),
      revisionDate: new Date('2024-01-05'),
      analystId: 'an-77',
      analystName: 'quant_alice',
      metricType: 'EPS',
      priorEstimate: null,
      newEstimate: 2.30,
      sourceProvider: 'ESTIMIZE',
      sourceType: 'CSV',
      sourceRecordHash: hash(record),
      ...overrides,
    };
  }

  it('resolves tickers and fills securityId', () => {
    const rows = buildRevisionRows([makeRevision({ ticker: 'MSFT' })], resolver, []);
    expect(rows[0].securityId).toBe('sec-msft');
  });

  it('quarantines unresolvable revision tickers', () => {
    const quarantine: QuarantineEntry[] = [];
    const rows = buildRevisionRows([makeRevision({ ticker: 'GONE' })], resolver, quarantine);
    expect(rows.length).toBe(0);
    expect(quarantine.length).toBe(1);
  });

  it('dedups identical revision hashes', () => {
    const r = makeRevision();
    const rows = buildRevisionRows([r, { ...r }], resolver, []);
    expect(rows.length).toBe(1);
  });
});

// ─── Coverage Report ─────────────────────────────────────────────────────────

describe('buildCoverageReport', () => {
  it('reports totals, securities, metric breakdown, and date range', () => {
    const rows: ConsensusFactInsert[] = [
      {
        securityId: 'sec-aapl', fiscalYear: 2024, fiscalPeriod: 'Q1',
        periodEndDate: new Date('2024-02-01'),
        observationDate: new Date('2024-01-05'), availableAt: new Date('2024-01-05'),
        supersededAt: null, metricType: 'EPS',
        consensusMean: 2.35, consensusMedian: null, consensusHigh: 2.42, consensusLow: 2.28,
        consensusStdDev: 0.04, analystCount: 12,
        actualValue: null, actualReportDate: null,
        sourceProvider: 'ESTIMIZE', sourceType: 'CSV', sourceRecordHash: 'h1',
      },
      {
        securityId: 'sec-aapl', fiscalYear: 2024, fiscalPeriod: 'Q1',
        periodEndDate: new Date('2024-02-01'),
        observationDate: new Date('2024-01-20'), availableAt: new Date('2024-01-20'),
        supersededAt: null, metricType: 'REVENUE',
        consensusMean: 118000000000, consensusMedian: null, consensusHigh: 119000000000, consensusLow: 117000000000,
        consensusStdDev: 700000000, analystCount: 10,
        actualValue: null, actualReportDate: null,
        sourceProvider: 'ESTIMIZE', sourceType: 'CSV', sourceRecordHash: 'h2',
      },
      {
        securityId: 'sec-msft', fiscalYear: 2024, fiscalPeriod: 'Q3',
        periodEndDate: new Date('2024-01-23'),
        observationDate: new Date('2024-01-10'), availableAt: new Date('2024-01-10'),
        supersededAt: null, metricType: 'EPS',
        consensusMean: 2.70, consensusMedian: null, consensusHigh: 2.80, consensusLow: 2.60,
        consensusStdDev: 0.05, analystCount: 20,
        actualValue: null, actualReportDate: null,
        sourceProvider: 'ESTIMIZE', sourceType: 'CSV', sourceRecordHash: 'h3',
      },
    ];

    const report = buildCoverageReport(rows);
    expect(report.totalFacts).toBe(3);
    expect(report.securitiesCovered).toBe(2);
    expect(report.metricBreakdown['EPS']).toBe(2);
    expect(report.metricBreakdown['REVENUE']).toBe(1);
    expect(report.dateRange.min!.toISOString()).toBe('2024-01-05T00:00:00.000Z');
    expect(report.dateRange.max!.toISOString()).toBe('2024-01-20T00:00:00.000Z');
  });

  it('handles empty input', () => {
    const report = buildCoverageReport([]);
    expect(report.totalFacts).toBe(0);
    expect(report.securitiesCovered).toBe(0);
    expect(report.dateRange.min).toBeNull();
  });
});

// ─── buildReport (ingest summary) ────────────────────────────────────────────

describe('buildReport', () => {
  it('aggregates counters and quarantine', () => {
    const quarantine: QuarantineEntry[] = [
      { reason: 'TICKER_UNRESOLVED', detail: 'DEAD', record: {} },
    ];
    const rows: ConsensusFactInsert[] = [
      {
        securityId: 'sec-aapl', fiscalYear: 2024, fiscalPeriod: 'Q1',
        periodEndDate: new Date('2024-02-01'),
        observationDate: new Date('2024-01-05'), availableAt: new Date('2024-01-05'),
        supersededAt: null, metricType: 'EPS',
        consensusMean: 2.35, consensusMedian: null, consensusHigh: 2.42, consensusLow: 2.28,
        consensusStdDev: 0.04, analystCount: 12,
        actualValue: null, actualReportDate: null,
        sourceProvider: 'ESTIMIZE', sourceType: 'CSV', sourceRecordHash: 'h1',
      },
    ];

    const report = buildReport(10, 1, 2, quarantine, rows);
    expect(report.rawCount).toBe(10);
    expect(report.acceptedCount).toBe(1);
    expect(report.duplicateCount).toBe(2);
    expect(report.quarantinedCount).toBe(1);
    expect(report.securitiesCovered).toBe(1);
  });
});
