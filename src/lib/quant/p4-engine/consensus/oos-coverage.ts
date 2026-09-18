/**
 * OOS Coverage Checker — Frozen V5-B Window
 * ==========================================
 *
 * Measures whether an observation set (e.g. consensus facts, or a raw
 * vendor extract profiled upstream) covers the frozen V5-B OOS window
 * on the V5-B monthly observation grid.
 *
 *   Frozen OOS window: 2023-06-18 → 2025-09-30  (TEST split boundary)
 *
 * The check is month-bucketed (UTC months), matching the monthly
 * observation grid used by the V5-B backtest. It answers:
 *   - which months have ≥1 observation (and per month, which securities)
 *   - which universe securities have ≥1 observation inside the window
 *   - universe coverage percentage
 *
 * Pure + deterministic. No DB access, no vendor assumptions — it takes
 * dated observations and a universe and produces a report.
 */

// ─── Frozen OOS window (V5-B TEST split — do not change) ───────────────────

export const FROZEN_OOS_WINDOW = Object.freeze({
  start: '2023-06-18',
  end: '2025-09-30',
});

// ─── Types ─────────────────────────────────────────────────────────────────

/** A dated observation attributable to a universe security. */
export interface CoverageObservation {
  securityId: string;
  /** Observation/known date — PIT timestamp */
  date: Date;
}

export interface OosCoverageReport {
  window: { start: string; end: string };
  monthsTotal: number;
  monthsCovered: number;
  monthsMissing: string[];           // 'YYYY-MM' buckets with zero observations
  windowCoveragePct: number;
  universeSize: number;
  securitiesCovered: number;
  securitiesMissing: string[];       // universe securityIds with no obs in window
  universeCoveragePct: number;
  observationsPerMonth: Record<string, number>;
  observationsPerSecurity: Record<string, number>;
  /** Observations outside the window are ignored, but counted for provenance */
  outOfWindowObservations: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** All UTC month buckets overlapping [start, end] (inclusive). */
export function monthsInWindow(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endM = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur.getTime() <= endM.getTime()) {
    out.push(monthKey(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

// ─── Coverage computation ──────────────────────────────────────────────────

/**
 * Compute OOS coverage of an observation set against the frozen universe.
 *
 * @param observations  dated observations (any source — canonical facts,
 *                      raw vendor rows profiled upstream, fixtures)
 * @param universeIds   frozen universe securityIds
 * @param window        defaults to the frozen V5-B OOS window
 */
export function computeOosCoverage(
  observations: readonly CoverageObservation[],
  universeIds: ReadonlySet<string>,
  window: { start: string; end: string } = FROZEN_OOS_WINDOW,
): OosCoverageReport {
  const start = new Date(`${window.start}T00:00:00.000Z`);
  const end = new Date(`${window.end}T23:59:59.999Z`);
  const startMs = start.getTime();
  const endMs = end.getTime();

  const months = monthsInWindow(start, end);
  const monthSet = new Set(months);

  const perMonth = new Map<string, number>();
  const perSecurity = new Map<string, number>();
  const coveredMonths = new Set<string>();
  const coveredSecurities = new Set<string>();
  let outOfWindow = 0;

  for (const o of observations) {
    const ms = o.date.getTime();
    if (ms < startMs || ms > endMs) {
      outOfWindow++;
      continue;
    }
    const mk = monthKey(o.date);
    if (!monthSet.has(mk)) continue; // defensive — impossible given bounds
    coveredMonths.add(mk);
    perMonth.set(mk, (perMonth.get(mk) ?? 0) + 1);
    if (universeIds.has(o.securityId)) {
      coveredSecurities.add(o.securityId);
      perSecurity.set(o.securityId, (perSecurity.get(o.securityId) ?? 0) + 1);
    }
  }

  const monthsMissing = months.filter(m => !coveredMonths.has(m));
  const securitiesMissing = [...universeIds].filter(id => !coveredSecurities.has(id)).sort();

  return {
    window: { ...window },
    monthsTotal: months.length,
    monthsCovered: coveredMonths.size,
    monthsMissing,
    windowCoveragePct: months.length ? (coveredMonths.size / months.length) * 100 : 0,
    universeSize: universeIds.size,
    securitiesCovered: coveredSecurities.size,
    securitiesMissing,
    universeCoveragePct: universeIds.size ? (coveredSecurities.size / universeIds.size) * 100 : 0,
    observationsPerMonth: Object.fromEntries([...perMonth.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    observationsPerSecurity: Object.fromEntries([...perSecurity.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
    outOfWindowObservations: outOfWindow,
  };
}
