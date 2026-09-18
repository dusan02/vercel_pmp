/**
 * Project Status Report — regression test
 * ========================================
 *
 * The status report must always reflect the frozen constants and must
 * never drift into claiming validation that hasn't happened.
 */

import { describe, it, expect } from 'vitest';
import { buildProjectStatus, formatProjectStatus } from './project-status';
import { V5B_BENCHMARK } from './p4-engine/consensus/v5c-oos-harness';
import { FROZEN_V5B_UNIVERSE } from './p4-engine/consensus/universe-manifest';

describe('buildProjectStatus', () => {
  const s = buildProjectStatus();

  it('derives frozen values, never hardcodes them', () => {
    expect(s.universe.securities).toBe(FROZEN_V5B_UNIVERSE.securities);
    expect(s.universe.tickers).toBe(FROZEN_V5B_UNIVERSE.distinctTickers);
    expect(s.universe.terminatedHistories).toBe(FROZEN_V5B_UNIVERSE.delistedOrEndedTickers);
    expect(s.v5bBenchmark.pearson).toBe(V5B_BENCHMARK.pearson);
    expect(s.v5bBenchmark.spreadPct).toBe(V5B_BENCHMARK.spreadPct);
  });

  it('is honest about the unvalidated V5-C hypothesis', () => {
    expect(s.historicalPitData).toBe('NOT AVAILABLE');
    expect(s.v5cOosValidation).toBe('NOT RUN');
    expect(s.predictiveEdge).toBe('NOT ESTABLISHED');
  });
});

describe('formatProjectStatus', () => {
  const text = formatProjectStatus();

  it('states the verdict and never claims an edge', () => {
    expect(text).toContain('PROJECT COMPLETE');
    expect(text).toContain('EMPIRICAL V5-C VALIDATION NOT ESTABLISHED');
    expect(text).toContain('NOT AVAILABLE');
    expect(text).toContain('NOT RUN');
    expect(text).toContain('NOT ESTABLISHED');
    // Must NOT claim performance anywhere
    expect(text).not.toMatch(/V5-C (works|is profitable|beats|has an edge)/i);
  });

  it('shows the V5-B benchmark labeled as V5-B, not V5-C', () => {
    expect(text).toContain('V5-B BENCHMARK');
    expect(text).toContain('+0.0984');
    expect(text).toContain('+14.03%');
  });
});
