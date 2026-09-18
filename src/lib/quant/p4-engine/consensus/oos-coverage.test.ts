/**
 * OOS Coverage Checker — Tests (Task 8)
 * ======================================
 *
 * Synthetic-fixture tests for the monthly OOS coverage report over the
 * frozen V5-B window 2023-06-18 → 2025-09-30.
 */

import { describe, it, expect } from 'vitest';
import { computeOosCoverage, monthsInWindow, FROZEN_OOS_WINDOW } from './oos-coverage';

const UNIVERSE = new Set(['sec-a', 'sec-b', 'sec-c', 'sec-d']);

function obs(securityId: string, date: string) {
  return { securityId, date: new Date(`${date}T00:00:00.000Z`) };
}

describe('monthsInWindow', () => {
  it('enumerates UTC months overlapping the frozen window', () => {
    const months = monthsInWindow(new Date(FROZEN_OOS_WINDOW.start), new Date(FROZEN_OOS_WINDOW.end));
    expect(months[0]).toBe('2023-06');
    expect(months[months.length - 1]).toBe('2025-09');
    expect(months.length).toBe(28); // Jun 2023 … Sep 2025 inclusive
  });
});

describe('computeOosCoverage', () => {
  it('full coverage: every month + every security', () => {
    const months = monthsInWindow(new Date(FROZEN_OOS_WINDOW.start), new Date(FROZEN_OOS_WINDOW.end));
    // day 20 is inside the window for every month (window starts 2023-06-18)
    const observations = months.flatMap(m =>
      [...UNIVERSE].map(s => obs(s, `${m}-20`)),
    );
    const r = computeOosCoverage(observations, UNIVERSE);
    expect(r.monthsCovered).toBe(28);
    expect(r.windowCoveragePct).toBe(100);
    expect(r.securitiesCovered).toBe(4);
    expect(r.universeCoveragePct).toBe(100);
    expect(r.monthsMissing).toEqual([]);
    expect(r.securitiesMissing).toEqual([]);
    expect(r.outOfWindowObservations).toBe(0);
  });

  it('reports missing months and missing securities', () => {
    const observations = [
      obs('sec-a', '2023-07-10'),
      obs('sec-a', '2023-08-10'),
      obs('sec-b', '2023-08-20'),
    ];
    const r = computeOosCoverage(observations, UNIVERSE);
    expect(r.monthsCovered).toBe(2); // 2023-07, 2023-08
    expect(r.monthsMissing).toHaveLength(26);
    expect(r.securitiesCovered).toBe(2);
    expect(r.securitiesMissing).toEqual(['sec-c', 'sec-d']);
    expect(r.universeCoveragePct).toBe(50);
    expect(r.observationsPerMonth['2023-08']).toBe(2);
    expect(r.observationsPerSecurity['sec-a']).toBe(2);
  });

  it('ignores out-of-window observations but counts them', () => {
    const observations = [
      obs('sec-a', '2020-01-15'),   // before window
      obs('sec-a', '2026-01-15'),   // after window
      obs('sec-a', '2024-03-15'),   // inside
    ];
    const r = computeOosCoverage(observations, UNIVERSE);
    expect(r.outOfWindowObservations).toBe(2);
    expect(r.monthsCovered).toBe(1);
    expect(r.observationsPerMonth['2024-03']).toBe(1);
  });

  it('counts non-universe observations for months but not securities', () => {
    const observations = [
      obs('sec-a', '2024-01-10'),
      obs('sec-unknown', '2024-02-10'), // not in universe
    ];
    const r = computeOosCoverage(observations, UNIVERSE);
    expect(r.monthsCovered).toBe(2); // vendor row still marks the month
    expect(r.securitiesCovered).toBe(1);
  });

  it('empty input → zero coverage, all months missing', () => {
    const r = computeOosCoverage([], UNIVERSE);
    expect(r.monthsCovered).toBe(0);
    expect(r.windowCoveragePct).toBe(0);
    expect(r.securitiesCovered).toBe(0);
    expect(r.securitiesMissing).toEqual(['sec-a', 'sec-b', 'sec-c', 'sec-d']);
  });

  it('respects a custom window (default is frozen)', () => {
    const observations = [obs('sec-a', '2024-06-15')];
    const r = computeOosCoverage(observations, UNIVERSE, { start: '2024-06-01', end: '2024-08-31' });
    expect(r.monthsTotal).toBe(3);
    expect(r.monthsCovered).toBe(1);
    expect(r.monthsMissing).toEqual(['2024-07', '2024-08']);
  });
});
