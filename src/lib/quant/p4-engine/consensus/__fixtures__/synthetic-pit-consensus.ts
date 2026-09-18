/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SYNTHETIC TEST FIXTURE — NOT REAL MARKET DATA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Deterministic synthetic PIT consensus history for testing the
 * vendor-neutral consensus pipeline. Every value below was invented for
 * coverage of edge cases. It is NOT vendor data, NOT Nasdaq/Zacks/Estimize
 * data, and MUST NOT be treated as real market data anywhere.
 *
 * Coverage of cases (per task spec):
 *   - multiple revisions of the same consensus
 *   - multiple fiscal periods (Q1, Q2, FY)
 *   - EPS and REVENUE metrics
 *   - null-consensus rows representing zero contributing coverage
 *   - observation vs availability timestamps
 *   - revisions occurring close to an as-of boundary
 *   - rows available only AFTER a given as-of (must be excluded)
 *   - delisted/terminated ticker mapping (PIT-correct resolution)
 *   - duplicate records
 *   - missing observations
 *   - invalid analyst counts
 *
 * Synthetic securities:
 *   sec-syn-aapl / AAPL  — active
 *   sec-syn-msft / MSFT  — active
 *   sec-syn-dead / DEADC — ticker terminated 2020-12-31
 */

import * as crypto from 'crypto';
import {
  CanonicalConsensusSnapshot,
  CanonicalRevisionEvent,
} from '../vendor-adapter';
import { TickerResolver } from '../consensus-ingest-types';

export const SYNTHETIC_LABEL = 'SYNTHETIC TEST FIXTURE — NOT REAL MARKET DATA' as const;

// ─── Synthetic ticker history (PIT-correct) ────────────────────────────────

export interface SyntheticTickerRow {
  ticker: string;
  securityId: string;
  startDate: Date;
  endDate: Date | null;
}

export const SYNTHETIC_TICKER_HISTORY: readonly SyntheticTickerRow[] = [
  { ticker: 'AAPL', securityId: 'sec-syn-aapl', startDate: new Date('1980-12-12'), endDate: null },
  { ticker: 'MSFT', securityId: 'sec-syn-msft', startDate: new Date('1986-03-13'), endDate: null },
  // Delisted: DEADC is resolvable only before its termination date
  { ticker: 'DEADC', securityId: 'sec-syn-dead', startDate: new Date('1990-01-01'), endDate: new Date('2020-12-31') },
];

/** PIT-correct resolver over the synthetic ticker history. */
export function syntheticTickerResolver(): TickerResolver {
  return {
    resolve(ticker: string, at: Date): string | null {
      const t = ticker.toUpperCase();
      const atMs = at.getTime();
      const match = SYNTHETIC_TICKER_HISTORY.find(
        r =>
          r.ticker === t &&
          r.startDate.getTime() <= atMs &&
          (r.endDate === null || atMs < r.endDate.getTime()),
      );
      return match ? match.securityId : null;
    },
  };
}

/** securityId → all tickers ever used (for rename detection in audit). */
export const SYNTHETIC_TICKER_NAMES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['sec-syn-aapl', new Set(['AAPL'])],
  ['sec-syn-msft', new Set(['MSFT'])],
  ['sec-syn-dead', new Set(['DEADC'])],
]);

/** Universe used by synthetic tests/audits. */
export const SYNTHETIC_UNIVERSE: ReadonlySet<string> = new Set([
  'sec-syn-aapl',
  'sec-syn-msft',
  'sec-syn-dead',
]);

// ─── Snapshot factory ──────────────────────────────────────────────────────

let hashCounter = 0;

function snapHash(parts: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts)).digest('hex');
}

export function makeSyntheticSnapshot(
  overrides: Partial<CanonicalConsensusSnapshot> = {},
): CanonicalConsensusSnapshot {
  const base: CanonicalConsensusSnapshot = {
    securityId: 'sec-syn-aapl',
    ticker: 'AAPL',
    cik: null,
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-03-31T00:00:00.000Z'),
    knownAt: new Date('2024-01-05T00:00:00.000Z'),
    metricType: 'EPS',
    consensusMean: 2.10,
    consensusMedian: null,
    consensusHigh: 2.18,
    consensusLow: 2.02,
    consensusStdDev: 0.05,
    analystCount: 12,
    actualValue: null,
    actualReportDate: null,
    sourceProvider: 'SYNTHETIC',
    sourceType: 'FIXTURE',
    sourceRecordHash: snapHash({ n: hashCounter++, ...overrides }),
    ...overrides,
  };
  // Hash over content so identical rows dedup and distinct rows don't collide
  base.sourceRecordHash = snapHash({
    ticker: base.ticker,
    fiscalYear: base.fiscalYear,
    fiscalPeriod: base.fiscalPeriod,
    metricType: base.metricType,
    knownAt: base.knownAt.toISOString(),
    consensusMean: base.consensusMean,
    analystCount: base.analystCount,
    n: hashCounter++,
  });
  return base;
}

// ─── The synthetic dataset ─────────────────────────────────────────────────

/**
 * AAPL FY2024-Q1 EPS — three revisions + one post-report snapshot carrying
 * the actual. reportDate 2024-04-25.
 */
export const AAPL_Q1_EPS: readonly CanonicalConsensusSnapshot[] = [
  makeSyntheticSnapshot({ knownAt: new Date('2024-01-05'), consensusMean: 2.10, analystCount: 12 }),
  makeSyntheticSnapshot({ knownAt: new Date('2024-02-05'), consensusMean: 2.15, analystCount: 13 }),
  // Publication-lag row: observed 2024-03-20 but only available 2024-03-25.
  // The canonical snapshot uses knownAt = availability boundary so that
  // consensusAt(T) with T in [03-20, 03-25) must NOT see it.
  makeSyntheticSnapshot({ knownAt: new Date('2024-03-25'), consensusMean: 2.18, analystCount: 13 }),
  makeSyntheticSnapshot({ knownAt: new Date('2024-04-10'), consensusMean: 2.20, analystCount: 14 }),
  // Post-report snapshot carrying the actual (observationDate >= reportDate)
  makeSyntheticSnapshot({
    knownAt: new Date('2024-04-26'),
    consensusMean: 2.20,
    analystCount: 14,
    actualValue: 2.25,
    actualReportDate: new Date('2024-04-25T20:30:00.000Z'),
  }),
];

/** AAPL FY2024-Q1 REVENUE — two revisions + post-report actual. */
export const AAPL_Q1_REVENUE: readonly CanonicalConsensusSnapshot[] = [
  makeSyntheticSnapshot({ metricType: 'REVENUE', knownAt: new Date('2024-01-05'), consensusMean: 90000, analystCount: 10 }),
  makeSyntheticSnapshot({ metricType: 'REVENUE', knownAt: new Date('2024-04-10'), consensusMean: 92000, analystCount: 11 }),
  makeSyntheticSnapshot({
    metricType: 'REVENUE',
    knownAt: new Date('2024-04-26'),
    consensusMean: 92000,
    analystCount: 11,
    actualValue: 91500,
    actualReportDate: new Date('2024-04-25T20:30:00.000Z'),
  }),
];

/** AAPL FY2024 (annual) — single annual-period snapshot. */
export const AAPL_FY2024: readonly CanonicalConsensusSnapshot[] = [
  makeSyntheticSnapshot({
    fiscalPeriod: 'FY',
    periodEndDate: new Date('2024-09-30T00:00:00.000Z'),
    knownAt: new Date('2024-04-15'),
    consensusMean: 8.90,
    analystCount: 14,
  }),
];

/**
 * MSFT FY2024-Q2 EPS — includes the ZERO-COVERAGE row: consensusMean null +
 * analystCount 0. Under vendor-documented zero-coverage semantics this row
 * is a NON-OBSERVATION (must be excluded before ingest), not missingness.
 */
export const MSFT_Q2_EPS: readonly CanonicalConsensusSnapshot[] = [
  makeSyntheticSnapshot({
    ticker: 'MSFT', securityId: 'sec-syn-msft',
    fiscalPeriod: 'Q2', periodEndDate: new Date('2024-06-30T00:00:00.000Z'),
    knownAt: new Date('2024-05-05'), consensusMean: 2.90, analystCount: 18,
  }),
  // zero-coverage non-observation (only meaningful with zeroCoverageIsNonObservation)
  makeSyntheticSnapshot({
    ticker: 'MSFT', securityId: 'sec-syn-msft',
    fiscalPeriod: 'Q2', periodEndDate: new Date('2024-06-30T00:00:00.000Z'),
    knownAt: new Date('2024-06-01'), consensusMean: null, consensusHigh: null,
    consensusLow: null, consensusStdDev: null, analystCount: 0,
  }),
  makeSyntheticSnapshot({
    ticker: 'MSFT', securityId: 'sec-syn-msft',
    fiscalPeriod: 'Q2', periodEndDate: new Date('2024-06-30T00:00:00.000Z'),
    knownAt: new Date('2024-07-15'), consensusMean: 2.95, analystCount: 19,
  }),
  makeSyntheticSnapshot({
    ticker: 'MSFT', securityId: 'sec-syn-msft',
    fiscalPeriod: 'Q2', periodEndDate: new Date('2024-06-30T00:00:00.000Z'),
    knownAt: new Date('2024-07-31'), consensusMean: 2.95, analystCount: 19,
    actualValue: 2.98, actualReportDate: new Date('2024-07-30T20:00:00.000Z'),
  }),
];

/**
 * DEADC (delisted 2020-12-31): resolvable pre-termination, unresolved after.
 * The 2020-06-15 snapshot resolves; the 2021-03-01 snapshot must quarantine.
 */
export const DEADC_SNAPSHOTS: readonly CanonicalConsensusSnapshot[] = [
  makeSyntheticSnapshot({
    ticker: 'DEADC', securityId: '',
    fiscalYear: 2020, fiscalPeriod: 'Q2',
    periodEndDate: new Date('2020-06-30'),
    knownAt: new Date('2020-06-15'), consensusMean: 0.45, analystCount: 4,
  }),
  makeSyntheticSnapshot({
    ticker: 'DEADC', securityId: '',
    fiscalYear: 2021, fiscalPeriod: 'Q1',
    periodEndDate: new Date('2021-03-31'),
    knownAt: new Date('2021-03-01'), consensusMean: 0.50, analystCount: 3,
  }),
];

/** Invalid analyst count (negative) — sanity/sentinel row. */
export const INVALID_ANALYST_COUNT: readonly CanonicalConsensusSnapshot[] = [
  makeSyntheticSnapshot({ knownAt: new Date('2024-02-20'), analystCount: -3 }),
];

/** All "clean" snapshots: everything except invalid-count sentinel. */
export const SYNTHETIC_SNAPSHOTS: readonly CanonicalConsensusSnapshot[] = [
  ...AAPL_Q1_EPS,
  ...AAPL_Q1_REVENUE,
  ...AAPL_FY2024,
  ...MSFT_Q2_EPS,
  ...DEADC_SNAPSHOTS,
];

// ─── Revisions (analyst-level events) ──────────────────────────────────────

export function makeSyntheticRevision(
  overrides: Partial<CanonicalRevisionEvent> = {},
): CanonicalRevisionEvent {
  const base: CanonicalRevisionEvent = {
    securityId: 'sec-syn-aapl',
    ticker: 'AAPL',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-03-31T00:00:00.000Z'),
    revisionDate: new Date('2024-01-05T14:30:00.000Z'),
    analystId: 'syn-analyst-1',
    analystName: 'synthetic_analyst',
    metricType: 'EPS',
    priorEstimate: null,
    newEstimate: 2.05,
    sourceProvider: 'SYNTHETIC',
    sourceType: 'FIXTURE',
    sourceRecordHash: snapHash({ r: hashCounter++, ...overrides }),
    ...overrides,
  };
  base.sourceRecordHash = snapHash({
    ticker: base.ticker,
    revisionDate: base.revisionDate.toISOString(),
    analystId: base.analystId,
    metricType: base.metricType,
    newEstimate: base.newEstimate,
    r: hashCounter++,
  });
  return base;
}

/** AAPL Q1 EPS analyst-level chain — matches the consensus revisions above. */
export const SYNTHETIC_REVISIONS: readonly CanonicalRevisionEvent[] = [
  makeSyntheticRevision({ revisionDate: new Date('2024-01-05T14:30:00Z'), newEstimate: 2.05 }),
  makeSyntheticRevision({ revisionDate: new Date('2024-02-05T09:00:00Z'), priorEstimate: 2.05, newEstimate: 2.12 }),
  makeSyntheticRevision({
    revisionDate: new Date('2024-04-10T11:00:00Z'),
    analystId: 'syn-analyst-2', analystName: 'synthetic_analyst_2',
    priorEstimate: null, newEstimate: 2.30,
  }),
];
