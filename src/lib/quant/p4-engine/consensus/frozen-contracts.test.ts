/**
 * Frozen Contracts Regression Guard
 * ==================================
 *
 * Hard regression test pinning EVERY frozen constant and decision rule in
 * the V5-C comparison. If any of these values change, this test fails —
 * that is intentional: frozen artifacts must not drift silently.
 *
 *   - V5-B benchmark numbers (Pearson / spread / counts)
 *   - GO/NO-GO criteria + decideGoNoGo boundary semantics
 *   - Empirical audit thresholds (60 / 80 / 5)
 *   - Frozen OOS window (2023-06-18 → 2025-09-30)
 *   - Frozen universe shape (575 / 575 / 173)
 *   - Frozen category weights (35 / 30 / 25 / 10)
 *
 * DO NOT "fix" this test by editing the constants. A failure here means a
 * frozen contract changed — revert the change, not the test.
 */

import { describe, it, expect } from 'vitest';
import {
  V5B_BENCHMARK,
  FROZEN_GO_NO_GO,
  decideGoNoGo,
  OosMetrics,
} from './v5c-oos-harness';
import { FROZEN_AUDIT_THRESHOLDS } from './empirical-pit-audit';
import { FROZEN_V5B_UNIVERSE } from './universe-manifest';
import { FROZEN_OOS_WINDOW } from './oos-coverage';
import { CATEGORY_WEIGHTS } from '../../ew-engine/types';

describe('frozen V5-B benchmark', () => {
  it('exact frozen values', () => {
    expect(V5B_BENCHMARK.name).toBe('V5-B SEC-only OOS');
    expect(V5B_BENCHMARK.pearson).toBe(0.0984);
    expect(V5B_BENCHMARK.spreadPct).toBe(14.03);
    expect(V5B_BENCHMARK.observations).toBe(23941);
    expect(V5B_BENCHMARK.securities).toBe(589);
  });
});

describe('frozen GO/NO-GO criteria', () => {
  it('exact frozen values', () => {
    expect(FROZEN_GO_NO_GO.minPearsonImprovement).toBe(0.0);
    expect(FROZEN_GO_NO_GO.minSpreadImprovementPp).toBe(0.0);
    expect(FROZEN_GO_NO_GO.minConsensusCoveragePct).toBe(60);
  });

  it('decideGoNoGo: improvement on both + coverage ≥60 → GO', () => {
    const m: OosMetrics = {
      observations: 100, securities: 50,
      pearson: 0.15, spreadPct: 16, hitRatePct: 70,
      topDecileMeanReturnPct: 8, bottomDecileMeanReturnPct: -8,
    };
    const r = decideGoNoGo(m, 75);
    expect(r.decision).toBe('GO');
  });

  it('decideGoNoGo: equal-to-benchmark does NOT count as improvement', () => {
    const m: OosMetrics = {
      observations: 100, securities: 50,
      pearson: 0.0984, spreadPct: 14.03, hitRatePct: 60,
      topDecileMeanReturnPct: 7, bottomDecileMeanReturnPct: -7,
    };
    expect(decideGoNoGo(m, 75).decision).toBe('NO-GO');
  });

  it('decideGoNoGo: coverage below 60 → NO-GO even with better metrics', () => {
    const m: OosMetrics = {
      observations: 100, securities: 50,
      pearson: 0.20, spreadPct: 20, hitRatePct: 80,
      topDecileMeanReturnPct: 10, bottomDecileMeanReturnPct: -10,
    };
    expect(decideGoNoGo(m, 59.9).decision).toBe('NO-GO');
    expect(decideGoNoGo(m, 60.0).decision).toBe('GO');
  });
});

describe('frozen empirical audit thresholds', () => {
  it('exact frozen values (60 / 80 / 5)', () => {
    expect(FROZEN_AUDIT_THRESHOLDS.minUniverseCoveragePct).toBe(60);
    expect(FROZEN_AUDIT_THRESHOLDS.minWindowCoveragePct).toBe(80);
    expect(FROZEN_AUDIT_THRESHOLDS.maxMissingMeanPct).toBe(5);
  });
});

describe('frozen OOS window + universe', () => {
  it('window 2023-06-18 → 2025-09-30', () => {
    expect(FROZEN_OOS_WINDOW.start).toBe('2023-06-18');
    expect(FROZEN_OOS_WINDOW.end).toBe('2025-09-30');
    expect(FROZEN_V5B_UNIVERSE.oosStart).toBe('2023-06-18');
    expect(FROZEN_V5B_UNIVERSE.oosEnd).toBe('2025-09-30');
  });

  it('universe 575 / 575 / 173', () => {
    expect(FROZEN_V5B_UNIVERSE.securities).toBe(575);
    expect(FROZEN_V5B_UNIVERSE.distinctTickers).toBe(575);
    expect(FROZEN_V5B_UNIVERSE.delistedOrEndedTickers).toBe(173);
  });
});

describe('frozen category weights (35/30/25/10)', () => {
  it('exact values', () => {
    expect(CATEGORY_WEIGHTS.EARNINGS).toBe(0.35);
    expect(CATEGORY_WEIGHTS.FUNDAMENTALS).toBe(0.30);
    expect(CATEGORY_WEIGHTS.MOMENTUM).toBe(0.25);
    expect(CATEGORY_WEIGHTS.QUALITY).toBe(0.10);
  });
});
