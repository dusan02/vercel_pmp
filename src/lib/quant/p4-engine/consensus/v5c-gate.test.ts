/**
 * Empirical PIT Audit + V5-C OOS Harness — Tests
 * ===============================================
 *
 * Fixture-based tests for the final data-integrity gate and the
 * frozen V5-B vs V5-C evaluation harness.
 */

import { describe, it, expect } from 'vitest';
import { runPitAudit } from './empirical-pit-audit';
import {
  pearsonCorrelation,
  computeOosMetrics,
  decideGoNoGo,
  V5B_BENCHMARK,
  ScoredObservation,
  OosMetrics,
} from './v5c-oos-harness';
import type {
  ConsensusFactInsert,
  ConsensusRevisionInsert,
} from './consensus-ingest-types';

// ─── Fixture factories ───────────────────────────────────────────────────────

function fact(overrides: Record<string, unknown> = {}) {
  return {
    securityId: 'sec-aapl',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-02-01T21:30:00.000Z'),
    observationDate: new Date('2024-01-31T00:00:00.000Z'),
    availableAt: new Date('2024-01-31T00:00:00.000Z'),
    supersededAt: null,
    metricType: 'EPS',
    consensusMean: 2.40,
    consensusMedian: null,
    consensusHigh: 2.48,
    consensusLow: 2.32,
    consensusStdDev: 0.03,
    analystCount: 15,
    actualValue: null,
    actualReportDate: null,
    sourceProvider: 'ESTIMIZE',
    sourceType: 'CSV',
    sourceRecordHash: 'h1',
    ...overrides,
  };
}

function revision(overrides: Record<string, unknown> = {}) {
  return {
    securityId: 'sec-aapl',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-02-01T21:30:00.000Z'),
    revisionDate: new Date('2024-01-10T00:00:00.000Z'),
    availableAt: new Date('2024-01-10T00:00:00.000Z'),
    analystId: 'an-77',
    analystName: 'quant_alice',
    metricType: 'EPS',
    priorEstimate: null,
    newEstimate: 2.30,
    sourceProvider: 'ESTIMIZE',
    sourceType: 'CSV',
    sourceRecordHash: 'r1',
    ...overrides,
  };
}

const UNIVERSE = new Set(['sec-aapl', 'sec-msft', 'sec-tsla', 'sec-dead']);

// ─── Audit tests ─────────────────────────────────────────────────────────────

describe('runPitAudit', () => {
  const OOS_START = new Date('2024-01-01');
  const OOS_END = new Date('2024-06-30');

  it('passes a clean, well-covered dataset', () => {
    // Facts spanning all 6 OOS months (Jan–Jun) for 3 of 4 universe securities
    const months = ['01', '02', '03', '04', '05', '06'];
    const facts = months.map(m =>
      fact({ observationDate: new Date(`2024-${m}-05T00:00:00.000Z`), availableAt: new Date(`2024-${m}-05T00:00:00.000Z`) }),
    );
    facts.push(fact({ securityId: 'sec-msft', observationDate: new Date('2024-03-10T00:00:00.000Z'), availableAt: new Date('2024-03-10T00:00:00.000Z') }));
    facts.push(fact({ securityId: 'sec-tsla', observationDate: new Date('2024-04-15T00:00:00.000Z'), availableAt: new Date('2024-04-15T00:00:00.000Z') }));

    const report = runPitAudit(
      { facts, revisions: [], tickerHistory: new Map() },
      OOS_START, OOS_END, UNIVERSE,
    );

    expect(report.passed).toBe(true);
    expect(report.gateFailures).toHaveLength(0);
    expect(report.coverage.securitiesCovered).toBe(3);
    expect(report.coverage.universeCoveragePct).toBeCloseTo(75, 1); // 3 of 4
    expect(report.window.monthsCovered).toBe(6);
    expect(report.window.windowCoveragePct).toBeCloseTo(100, 1);
    expect(report.validator.factErrors).toBe(0);
  });

  it('HARD FAILS on leakage (actualValue on pre-earnings snapshot)', () => {
    const facts = [
      fact({
        observationDate: new Date('2024-01-05'),
        availableAt: new Date('2024-01-05'),
        actualValue: 1.90,
        actualReportDate: new Date('2024-02-01T21:30:00.000Z'),
      }),
    ];
    const report = runPitAudit(
      { facts, revisions: [], tickerHistory: new Map() },
      OOS_START, OOS_END, UNIVERSE,
    );
    expect(report.passed).toBe(false);
    expect(report.gateFailures.some(f => f.startsWith('PIT_FACTS'))).toBe(true);
  });

  it('flags low universe coverage', () => {
    const facts = [fact()]; // 1 of 4 universe = 25% < 60%
    const report = runPitAudit(
      { facts, revisions: [], tickerHistory: new Map() },
      OOS_START, OOS_END, UNIVERSE,
    );
    expect(report.passed).toBe(false);
    expect(report.gateFailures.some(f => f.startsWith('COVERAGE'))).toBe(true);
  });

  it('flags low OOS window coverage', () => {
    // Facts only in Jan — window Jan–Jun has 6 months, 1 covered ≈ 17% < 80%
    const facts = [fact()];
    const report = runPitAudit(
      { facts, revisions: [], tickerHistory: new Map() },
      OOS_START, OOS_END, UNIVERSE,
    );
    expect(report.passed).toBe(false);
    expect(report.gateFailures.some(f => f.startsWith('WINDOW'))).toBe(true);
  });

  it('detects ticker renames (security with multiple tickers)', () => {
    const facts = [fact(), fact({ securityId: 'sec-msft' })];
    const report = runPitAudit(
      {
        facts,
        revisions: [],
        tickerHistory: new Map([['sec-aapl', new Set(['FB', 'META'])]]),
      },
      OOS_START, OOS_END, UNIVERSE,
    );
    expect(report.tickerRenames).toEqual([
      { securityId: 'sec-aapl', tickers: ['FB', 'META'] },
    ]);
  });

  it('counts revisions after actual report', () => {
    const facts = [
      fact(),
      fact({
        observationDate: new Date('2024-02-05'),
        availableAt: new Date('2024-02-05'),
        actualValue: 2.18,
        actualReportDate: new Date('2024-02-01T21:30:00.000Z'),
      }),
    ];
    const revisions = [
      revision({ revisionDate: new Date('2024-02-10T00:00:00.000Z'), sourceRecordHash: 'r1' }), // after report
      revision({ revisionDate: new Date('2024-01-15T00:00:00.000Z'), sourceRecordHash: 'r2' }), // before
    ];
    const report = runPitAudit(
      { facts, revisions, tickerHistory: new Map() },
      OOS_START, OOS_END, UNIVERSE,
    );
    expect(report.revisions.revisionsAfterActualReport).toBe(1);
  });

  it('reports missingness rates', () => {
    const facts = [
      fact(),
      fact({ consensusMean: null, analystCount: null }),
    ];
    const report = runPitAudit(
      { facts, revisions: [], tickerHistory: new Map() },
      OOS_START, OOS_END, UNIVERSE,
    );
    expect(report.missingness.nullConsensusMeanPct).toBeCloseTo(50, 1);
    expect(report.missingness.nullAnalystCountPct).toBeCloseTo(50, 1);
  });
});

// ─── OOS harness math ────────────────────────────────────────────────────────

describe('pearsonCorrelation', () => {
  it('returns 1 for perfect positive relation', () => {
    const r = pearsonCorrelation([
      { x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 },
    ]);
    expect(r).toBeCloseTo(1, 6);
  });

  it('returns null for zero variance in x', () => {
    expect(pearsonCorrelation([{ x: 5, y: 1 }, { x: 5, y: 2 }])).toBeNull();
  });

  it('returns null for <2 pairs', () => {
    expect(pearsonCorrelation([{ x: 1, y: 1 }])).toBeNull();
  });
});

describe('computeOosMetrics', () => {
  it('computes spread and hit rate deterministically', () => {
    const obs: ScoredObservation[] = [
      { securityId: 'sec-a', asOfTime: '2024-01-01', totalScore: 10, forwardReturnPct: 10 },
      { securityId: 'sec-b', asOfTime: '2024-01-01', totalScore: 20, forwardReturnPct: 20 },
      { securityId: 'sec-c', asOfTime: '2024-01-01', totalScore: 30, forwardReturnPct: 30 },
      { securityId: 'sec-d', asOfTime: '2024-01-01', totalScore: 40, forwardReturnPct: -5 },
      { securityId: 'sec-e', asOfTime: '2024-01-01', totalScore: 50, forwardReturnPct: 20 },
    ];
    const m = computeOosMetrics(obs);
    expect(m.observations).toBe(5);
    expect(m.pearson).not.toBeNull();
    // decile = max(1, floor(5/10)) = 1 → sorted ASC [10..50], top = last (score 50, ret 20), bottom = first (score 10, ret 10)
    expect(m.topDecileMeanReturnPct).toBe(20);
    expect(m.bottomDecileMeanReturnPct).toBe(10);
    expect(m.spreadPct).toBeCloseTo(10, 6);
    expect(m.hitRatePct).toBe(100);
  });

  it('returns nulls for empty input', () => {
    const m = computeOosMetrics([]);
    expect(m.observations).toBe(0);
    expect(m.pearson).toBeNull();
    expect(m.spreadPct).toBeNull();
  });
});

// ─── GO/NO-GO decision ───────────────────────────────────────────────────────

describe('decideGoNoGo', () => {
  const goodV5c: OosMetrics = {
    observations: 24000, securities: 589,
    pearson: 0.15, spreadPct: 18.0, hitRatePct: 60,
    topDecileMeanReturnPct: 8, bottomDecileMeanReturnPct: -10,
  };

  it('GO when V5-C beats V5-B on Pearson and spread with coverage', () => {
    const report = decideGoNoGo(goodV5c, 75);
    expect(report.decision).toBe('GO');
  });

  it('NO-GO when Pearson does not improve', () => {
    const weak: OosMetrics = { ...goodV5c, pearson: 0.05 };
    const report = decideGoNoGo(weak, 75);
    expect(report.decision).toBe('NO-GO');
    expect(report.reasons.some(r => r.includes('Pearson'))).toBe(true);
  });

  it('NO-GO when spread does not improve', () => {
    const weak: OosMetrics = { ...goodV5c, spreadPct: 10 };
    const report = decideGoNoGo(weak, 75);
    expect(report.decision).toBe('NO-GO');
    expect(report.reasons.some(r => r.includes('Spread'))).toBe(true);
  });

  it('NO-GO when consensus coverage below threshold', () => {
    const report = decideGoNoGo(goodV5c, 40);
    expect(report.decision).toBe('NO-GO');
    expect(report.reasons.some(r => r.includes('Consensus coverage'))).toBe(true);
  });

  it('NO-GO on non-computable metrics', () => {
    const empty: OosMetrics = {
      observations: 0, securities: 0,
      pearson: null, spreadPct: null, hitRatePct: null,
      topDecileMeanReturnPct: null, bottomDecileMeanReturnPct: null,
    };
    const report = decideGoNoGo(empty, 75);
    expect(report.decision).toBe('NO-GO');
    expect(report.reasons[0]).toContain('not computable');
  });
});
