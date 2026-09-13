/**
 * Estimize Ingest — End-to-End Fixture Tests
 * ===========================================
 *
 * Runs the full pipeline against fixture CSVs with an in-memory store:
 *   CSV → adapter → buildFactRows → PIT validation → idempotent write
 *
 * Fixtures:
 *   - estimize-consensus-sample.csv (clean data + DEAD ticker + actuals)
 *   - estimize-leakage.csv (observationDate AFTER actualReportDate → must hard fail)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { EstimizeConsensusAdapter } from './vendor-adapter';
import { buildFactRows, normalizeTicker } from './estimize-ingest';
import {
  validateConsensusFacts,
  buildCoverageReport,
} from './pit-consensus-validator';
import type { ConsensusFactInsert, QuarantineEntry, TickerResolver } from './consensus-ingest-types';

const FIXTURES = path.join(__dirname, '__fixtures__');

function num(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function int(v: string | undefined): number | null {
  if (v === undefined || v === '') return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

function loadFixture(name: string): Record<string, unknown>[] {
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

// In-memory ticker map (mirrors PitTickerHistory in the PIT DB)
const TICKER_MAP: Record<string, string> = {
  AAPL: 'sec-aapl',
  MSFT: 'sec-msft',
  TSLA: 'sec-tsla',
  // DEAD intentionally absent — must be quarantined
};

const resolver: TickerResolver = {
  resolve(ticker: string): string | null {
    return TICKER_MAP[ticker.toUpperCase()] ?? null;
  },
};

// In-memory idempotent store (mirrors Prisma upsert-by-hash semantics)
function makeStore() {
  const facts = new Map<string, ConsensusFactInsert>();
  return {
    facts,
    insertFactIfAbsent: async (f: ConsensusFactInsert) => {
      if (facts.has(f.sourceRecordHash)) return false;
      facts.set(f.sourceRecordHash, f);
      return true;
    },
  };
}

describe('Estimize ingest — end-to-end fixtures', () => {
  it('ingests clean CSV: resolves tickers, quarantines DEAD, chains supersededAt', () => {
    const rows = loadFixture('estimize-consensus-sample.csv');
    const adapter = new EstimizeConsensusAdapter();
    const snapshots = adapter.parseSnapshots(rows)!;
    const quarantine: QuarantineEntry[] = [];
    const factRows = buildFactRows(snapshots, resolver, quarantine);

    // 13 CSV rows × 2 metrics = 26 snapshots
    expect(snapshots.length).toBe(26);

    // DEAD (1 row × 2 metrics = 2 snapshots) quarantined
    expect(quarantine.length).toBe(2);
    expect(quarantine.every(q => q.reason === 'TICKER_UNRESOLVED')).toBe(true);

    // 26 - 2 = 24 facts
    expect(factRows.length).toBe(24);

    // All resolved facts have a securityId
    expect(factRows.every(r => r.securityId.startsWith('sec-'))).toBe(true);

    // PIT validation passes on clean data
    expect(validateConsensusFacts(factRows).passed).toBe(true);
  });

  it('is idempotent — re-running the same CSV inserts nothing new', async () => {
    const rows = loadFixture('estimize-consensus-sample.csv');
    const adapter = new EstimizeConsensusAdapter();
    const snapshots = adapter.parseSnapshots(rows)!;

    const store = makeStore();

    // First run
    const q1: QuarantineEntry[] = [];
    const facts1 = buildFactRows(snapshots, resolver, q1);
    let inserted1 = 0;
    for (const f of facts1) {
      if (await store.insertFactIfAbsent(f)) inserted1++;
    }
    expect(inserted1).toBe(24);
    expect(store.facts.size).toBe(24);

    // Second run — same input
    const q2: QuarantineEntry[] = [];
    const facts2 = buildFactRows(snapshots, resolver, q2);
    let inserted2 = 0;
    for (const f of facts2) {
      if (await store.insertFactIfAbsent(f)) inserted2++;
    }
    expect(inserted2).toBe(0);
    expect(store.facts.size).toBe(24);
  });

  it('is deterministic — shuffled input produces identical fact set', () => {
    const rows = loadFixture('estimize-consensus-sample.csv');
    const adapter = new EstimizeConsensusAdapter();
    const snapshots = adapter.parseSnapshots(rows)!;

    const a = buildFactRows(snapshots, resolver, []);
    const b = buildFactRows([...snapshots].reverse(), resolver, []);

    const keyOf = (r: ConsensusFactInsert) =>
      `${r.securityId}|${r.fiscalYear}|${r.fiscalPeriod}|${r.metricType}|${r.observationDate.toISOString()}`;
    const setA = new Map(a.map(r => [keyOf(r), r]));
    const setB = new Map(b.map(r => [keyOf(r), r]));

    expect(setB.size).toBe(setA.size);
    for (const [k, v] of setA) {
      expect(setB.get(k)?.consensusMean).toBe(v.consensusMean);
      expect(setB.get(k)?.supersededAt?.toISOString() ?? null).toBe(v.supersededAt?.toISOString() ?? null);
    }
  });

  it('HARD FAILS on leakage fixture (observationDate after actualReportDate)', () => {
    const rows = loadFixture('estimize-leakage.csv');
    const adapter = new EstimizeConsensusAdapter();
    const snapshots = adapter.parseSnapshots(rows)!;
    // Resolver that resolves LEAK — we want the fact rows to exist so the
    // validator can catch the leakage (not quarantine them away).
    const leakResolver: TickerResolver = { resolve: () => 'sec-leak' };
    const factRows = buildFactRows(snapshots, leakResolver, []);

    // The leakage fixture: actual attached to a pre-earnings snapshot
    const validation = validateConsensusFacts(factRows);
    expect(validation.passed).toBe(false);
    expect(validation.errors.some(e => e.includes('LEAKAGE'))).toBe(true);
  });

  it('coverage report reflects fixture contents', () => {
    const rows = loadFixture('estimize-consensus-sample.csv');
    const adapter = new EstimizeConsensusAdapter();
    const snapshots = adapter.parseSnapshots(rows)!;
    const factRows = buildFactRows(snapshots, resolver, []);

    const coverage = buildCoverageReport(factRows);
    expect(coverage.totalFacts).toBe(24);
    expect(coverage.securitiesCovered).toBe(3); // AAPL, MSFT, TSLA
    expect(coverage.metricBreakdown['EPS']).toBe(12);
    expect(coverage.metricBreakdown['REVENUE']).toBe(12);
    expect(coverage.dateRange.min).toEqual(new Date('2024-01-05T00:00:00.000Z'));
    expect(coverage.dateRange.max).toEqual(new Date('2024-05-06T00:00:00.000Z'));
  });

  it('normalizeTicker handles fixture tickers', () => {
    expect(normalizeTicker('AAPL')).toBe('AAPL');
    expect(normalizeTicker('aapl.us')).toBe('AAPL');
    expect(normalizeTicker(' TSLA.NYSE ')).toBe('TSLA');
  });
});
