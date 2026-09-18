/**
 * PIT Timing Regression Tests — observationDate vs availableAt
 * ==============================================================
 *
 * Encodes the existing canonical two-timestamp contract:
 *
 *   observationDate — when the consensus state was observed (as-of date)
 *   availableAt     — when the snapshot became available/deliverable to us
 *
 * A snapshot is usable at T only when BOTH timestamps are <= T.
 * A row observed earlier but only available later (publication lag)
 * must not enter reconstruction before it is available.
 *
 * These tests encode the EXISTING canonical contract only.
 * They make no claim about any specific vendor's publication semantics.
 */

import { describe, it, expect } from 'vitest';
import {
  consensusAt,
  consensusRevisionAt,
  preEarningsConsensusAt,
  surpriseAt,
  temporalIntegrityCheck,
} from './consensus-pit-reconstruction';
import { ConsensusFactRow } from './consensus-feature-calculators';

function fact(overrides: Partial<ConsensusFactRow> = {}): ConsensusFactRow {
  return {
    id: 'f1',
    securityId: 'sec-t',
    fiscalYear: 2024,
    fiscalPeriod: 'Q1',
    periodEndDate: new Date('2024-03-31'),
    observationDate: new Date('2024-03-10T00:00:00.000Z'),
    availableAt: new Date('2024-03-10T00:00:00.000Z'),
    metricType: 'EPS',
    consensusMean: 2.10,
    consensusMedian: null,
    consensusHigh: null,
    consensusLow: null,
    consensusStdDev: null,
    analystCount: 10,
    actualValue: null,
    actualReportDate: null,
    ...overrides,
  };
}

const T = new Date('2024-03-15T00:00:00.000Z');

describe('consensusAt — observationDate boundary', () => {
  it('includes a snapshot observed before asOf', () => {
    const rows = [fact({ observationDate: new Date('2024-03-10') })];
    expect(consensusAt(rows, 'EPS', T)?.consensusMean).toBe(2.10);
  });

  it('includes a snapshot observed exactly at asOf (inclusive boundary)', () => {
    const rows = [fact({ observationDate: T })];
    expect(consensusAt(rows, 'EPS', T)).not.toBeNull();
  });

  it('excludes a snapshot observed after asOf', () => {
    const rows = [fact({ observationDate: new Date('2024-03-16') })];
    expect(consensusAt(rows, 'EPS', T)).toBeNull();
  });
});

describe('consensusAt — availableAt boundary', () => {
  it('excludes a snapshot observed earlier but available only after asOf', () => {
    const rows = [
      fact({
        observationDate: new Date('2024-03-10'), // observed before T
        availableAt: new Date('2024-03-20'),     // but delivered after T
      }),
    ];
    expect(consensusAt(rows, 'EPS', T)).toBeNull();
  });

  it('includes the same snapshot once asOf passes its availability', () => {
    const rows = [
      fact({
        observationDate: new Date('2024-03-10'),
        availableAt: new Date('2024-03-20'),
      }),
    ];
    expect(consensusAt(rows, 'EPS', new Date('2024-03-21'))?.consensusMean).toBe(2.10);
  });

  it('picks the latest AVAILABLE revision, not the latest observed', () => {
    const rows = [
      fact({ observationDate: new Date('2024-03-10'), availableAt: new Date('2024-03-10'), consensusMean: 2.10, id: 'old' }),
      fact({ observationDate: new Date('2024-03-14'), availableAt: new Date('2024-03-18'), consensusMean: 9.99, id: 'lag' }),
    ];
    // At T the lagged row is observed but not yet available → 2.10 wins
    expect(consensusAt(rows, 'EPS', T)?.consensusMean).toBe(2.10);
    // After availability, the newer revision is selected
    expect(consensusAt(rows, 'EPS', new Date('2024-03-19'))?.consensusMean).toBe(9.99);
  });
});

describe('consensusAt — revision selection', () => {
  it('selects the latest revision known at asOf among multiple revisions', () => {
    const rows = [
      fact({ observationDate: new Date('2024-03-01'), consensusMean: 2.00 }),
      fact({ observationDate: new Date('2024-03-10'), consensusMean: 2.10 }),
      fact({ observationDate: new Date('2024-03-20'), consensusMean: 2.30 }), // future
    ];
    expect(consensusAt(rows, 'EPS', T)?.consensusMean).toBe(2.10);
  });

  it('is metric-scoped (EPS row does not leak into REVENUE)', () => {
    const rows = [fact({ metricType: 'REVENUE', consensusMean: 50000 })];
    expect(consensusAt(rows, 'EPS', T)).toBeNull();
    expect(consensusAt(rows, 'REVENUE', T)?.consensusMean).toBe(50000);
  });
});

describe('consensusRevisionAt — PIT lookback', () => {
  it('an unavailable-at-T revision is invisible: T falls back to the older row → revision 0', () => {
    const rows = [
      fact({ observationDate: new Date('2024-02-01'), availableAt: new Date('2024-02-01'), consensusMean: 2.00 }),
      fact({ observationDate: new Date('2024-03-14'), availableAt: new Date('2024-03-20'), consensusMean: 2.50 }),
    ];
    // At T the 03-14 revision is observed but not yet available →
    // consensusAt(T) = 2.00, consensusAt(T-30d) = 2.00 → revision is 0,
    // NOT the 2.50 jump. The unavailable row never enters the computation.
    expect(consensusRevisionAt(rows, 'EPS', T, new Date('2024-02-14'))).toBe(0);
    // After availability, the revision appears
    expect(
      consensusRevisionAt(rows, 'EPS', new Date('2024-03-21'), new Date('2024-02-20')),
    ).toBeCloseTo(25, 6);
  });
});

describe('preEarningsConsensusAt / surpriseAt — availability respected', () => {
  const reportDate = new Date('2024-04-25T20:30:00.000Z');
  const rows = [
    fact({ observationDate: new Date('2024-04-10'), availableAt: new Date('2024-04-10'), consensusMean: 2.00 }),
    // Observed before the report but published after it → NOT pre-earnings usable
    fact({ observationDate: new Date('2024-04-24'), availableAt: new Date('2024-04-26'), consensusMean: 9.99 }),
    fact({
      observationDate: new Date('2024-04-26'), availableAt: new Date('2024-04-26'),
      consensusMean: 2.00, actualValue: 2.25, actualReportDate: reportDate,
    }),
  ];

  it('pre-earnings consensus skips observed-but-unavailable snapshots', () => {
    const pre = preEarningsConsensusAt(rows, 'EPS');
    expect(pre?.consensusMean).toBe(2.00); // not 9.99
  });

  it('surprise uses the correct pre-earnings consensus', () => {
    // (2.25 - 2.00) / 2.00 = 12.5%
    expect(surpriseAt(rows, 'EPS')).toBeCloseTo(12.5, 6);
  });
});

describe('temporalIntegrityCheck — regression', () => {
  it('passes clean rows', () => {
    const rows = [fact({})];
    expect(temporalIntegrityCheck(rows, 'EPS', T).passed).toBe(true);
  });

  it('flags a usable-at-T snapshot carrying a post-T actualReportDate', () => {
    const rows = [
      fact({
        observationDate: new Date('2024-03-10'),
        availableAt: new Date('2024-03-10'),
        actualReportDate: new Date('2024-04-01'), // after T
      }),
    ];
    expect(temporalIntegrityCheck(rows, 'EPS', T).passed).toBe(false);
  });
});
