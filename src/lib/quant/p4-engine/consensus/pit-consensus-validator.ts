/**
 * PIT Consensus Validator
 * ========================
 *
 * Empirical PIT validation for ingested consensus data.
 * Leakage is a HARD FAILURE — the ingest pipeline aborts, never warns.
 *
 * Checks:
 *   1. knownAt < actualReportDate (consensus must predate the earnings report)
 *   2. No future data (observationDate must not be in the future relative to
 *      the dataset's max observationDate — catches clock-skewed vendor rows)
 *   3. No duplicate PIT observations (same security/period/metric/observationDate
 *      with conflicting values)
 *   4. Monotonic revision chains (revisionDate ordering, priorEstimate →
 *      newEstimate consistency where both present)
 *   5. Consistent observationDate (availableAt >= observationDate — we cannot
 *      have ingested data before it was knowable)
 *   6. Coverage report (securities × dates, for the gate report)
 *
 * This validator runs on the CANONICAL rows BEFORE DB write and can also be
 * run against DB contents post-ingest (see validateDbCoverage).
 */

import {
  ConsensusFactInsert,
  ConsensusRevisionInsert,
} from './consensus-ingest-types';

// ─── Fact Validation ─────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate consensus fact rows. Leakage → errors (hard failure).
 */
export function validateConsensusFacts(rows: readonly ConsensusFactInsert[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ─── Check 1: LEAKAGE — actual value known before the report ───
  // A snapshot with observationDate < actualReportDate must NOT carry the
  // actual value (the actual is only knowable at/after the report).
  // Post-earnings event snapshots (observationDate >= reportDate with actual)
  // are legitimate — consensusAt(T) reconstruction only uses them at T >= report.
  for (const r of rows) {
    if (
      r.actualValue !== null && r.actualValue !== undefined &&
      r.actualReportDate &&
      r.observationDate.getTime() < r.actualReportDate.getTime()
    ) {
      errors.push(
        `LEAKAGE: ${r.securityId} ${r.fiscalPeriod}${r.fiscalYear} ${r.metricType} — ` +
        `actualValue attached to pre-earnings snapshot (observationDate ${r.observationDate.toISOString()} < actualReportDate ${r.actualReportDate.toISOString()})`,
      );
    }
  }

  // ─── Check 2: availableAt >= observationDate ───
  for (const r of rows) {
    if (r.availableAt.getTime() < r.observationDate.getTime()) {
      errors.push(
        `TEMPORAL: ${r.securityId} ${r.fiscalPeriod}${r.fiscalYear} ${r.metricType} — ` +
        `availableAt ${r.availableAt.toISOString()} < observationDate ${r.observationDate.toISOString()}`,
      );
    }
  }

  // ─── Check 3: no future observations (beyond dataset max) ───
  if (rows.length > 0) {
    const maxObs = Math.max(...rows.map(r => r.observationDate.getTime()));
    const nowMs = Date.now();
    if (maxObs > nowMs) {
      errors.push(
        `FUTURE_DATA: max observationDate ${new Date(maxObs).toISOString()} is in the future`,
      );
    }
  }

  // ─── Check 4: duplicate PIT observations with conflicting values ───
  const seen = new Map<string, ConsensusFactInsert>();
  for (const r of rows) {
    const key = `${r.securityId}|${r.fiscalYear}|${r.fiscalPeriod}|${r.metricType}|${r.observationDate.toISOString()}`;
    const existing = seen.get(key);
    if (existing) {
      const sameValues =
        existing.consensusMean === r.consensusMean &&
        existing.analystCount === r.analystCount &&
        existing.consensusHigh === r.consensusHigh &&
        existing.consensusLow === r.consensusLow;
      if (!sameValues) {
        errors.push(
          `DUPLICATE_CONFLICT: ${r.securityId} ${r.fiscalPeriod}${r.fiscalYear} ${r.metricType} @ ` +
          `${r.observationDate.toISOString()} — conflicting consensus values (hash ${r.sourceRecordHash.slice(0, 8)} vs ${existing.sourceRecordHash.slice(0, 8)})`,
        );
      } else {
        warnings.push(
          `DUPLICATE_IDENTICAL: ${key} — identical row ingested twice (dedup recommended upstream)`,
        );
      }
    }
    seen.set(key, r);
  }

  // ─── Check 5: supersededAt consistency ───
  for (const r of rows) {
    if (r.supersededAt && r.supersededAt.getTime() <= r.observationDate.getTime()) {
      errors.push(
        `CHAIN: ${r.securityId} ${r.fiscalPeriod}${r.fiscalYear} ${r.metricType} — ` +
        `supersededAt ${r.supersededAt.toISOString()} <= observationDate ${r.observationDate.toISOString()}`,
      );
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

// ─── Revision Validation ─────────────────────────────────────────────────────

/**
 * Validate revision rows: monotonic chains per (security, period, metric, analyst).
 */
export function validateConsensusRevisions(rows: readonly ConsensusRevisionInsert[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Group by (security, period, metric, analyst)
  const groups = new Map<string, ConsensusRevisionInsert[]>();
  for (const r of rows) {
    const key = `${r.securityId}|${r.fiscalYear}|${r.fiscalPeriod}|${r.metricType}|${r.analystId ?? 'unknown'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(r);
  }

  for (const [key, chain] of groups) {
    // Sort by revisionDate — must be strictly ascending per analyst
    const sorted = [...chain].sort((a, b) => a.revisionDate.getTime() - b.revisionDate.getTime());

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]!;
      const cur = sorted[i]!;

      // Same timestamp with different values = conflicting PIT state
      if (prev.revisionDate.getTime() === cur.revisionDate.getTime()) {
        if (prev.newEstimate !== cur.newEstimate) {
          errors.push(
            `REVISION_CONFLICT: ${key} @ ${cur.revisionDate.toISOString()} — ` +
            `same analyst revised to different values at identical timestamp`,
          );
        }
      }

      // priorEstimate of next should equal newEstimate of previous (chain continuity)
      if (cur.priorEstimate !== null && prev.newEstimate !== null) {
        if (Math.abs(cur.priorEstimate - prev.newEstimate) > 1e-9) {
          warnings.push(
            `CHAIN_GAP: ${key} — priorEstimate ${cur.priorEstimate} != previous newEstimate ${prev.newEstimate}`,
          );
        }
      }
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

// ─── Combined Validation (used by ingest CLI) ────────────────────────────────

export function validateFactRows(rows: readonly ConsensusFactInsert[]): ValidationResult {
  return validateConsensusFacts(rows);
}

export function validateRevRows(rows: readonly ConsensusRevisionInsert[]): ValidationResult {
  return validateConsensusRevisions(rows);
}

// ─── Coverage Report ─────────────────────────────────────────────────────────

export interface CoverageReport {
  totalFacts: number;
  securitiesCovered: number;
  metricBreakdown: Record<string, number>;
  periodBreakdown: Record<string, number>;
  dateRange: { min: Date | null; max: Date | null };
  securitiesPerYear: Record<number, number>;
}

/**
 * Build a coverage report from fact rows (or DB query results shaped the same).
 */
export function buildCoverageReport(rows: readonly ConsensusFactInsert[]): CoverageReport {
  if (rows.length === 0) {
    return {
      totalFacts: 0,
      securitiesCovered: 0,
      metricBreakdown: {},
      periodBreakdown: {},
      dateRange: { min: null, max: null },
      securitiesPerYear: {},
    };
  }

  const metricBreakdown: Record<string, number> = {};
  const periodBreakdown: Record<string, number> = {};
  const securitiesPerMetricYear = new Map<string, Set<string>>();
  const securities = new Set<string>();
  let minMs = Infinity;
  let maxMs = -Infinity;

  for (const r of rows) {
    metricBreakdown[r.metricType] = (metricBreakdown[r.metricType] ?? 0) + 1;
    const periodKey = `${r.fiscalPeriod}${r.fiscalYear}`;
    periodBreakdown[periodKey] = (periodBreakdown[periodKey] ?? 0) + 1;
    securities.add(r.securityId);

    const obsMs = r.observationDate.getTime();
    if (obsMs < minMs) minMs = obsMs;
    if (obsMs > maxMs) maxMs = obsMs;

    const year = r.observationDate.getUTCFullYear();
    const yearKey = `${r.metricType}|${year}`;
    if (!securitiesPerMetricYear.has(yearKey)) securitiesPerMetricYear.set(yearKey, new Set());
    securitiesPerMetricYear.get(yearKey)!.add(r.securityId);
  }

  const securitiesPerYear: Record<number, number> = {};
  for (const [key, set] of securitiesPerMetricYear) {
    const year = parseInt(key.split('|')[1] ?? '0', 10);
    securitiesPerYear[year] = Math.max(securitiesPerYear[year] ?? 0, set.size);
  }

  return {
    totalFacts: rows.length,
    securitiesCovered: securities.size,
    metricBreakdown,
    periodBreakdown,
    dateRange: { min: new Date(minMs), max: new Date(maxMs) },
    securitiesPerYear,
  };
}
