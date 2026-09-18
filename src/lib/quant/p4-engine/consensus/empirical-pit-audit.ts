/**
 * Empirical PIT Audit — Real-Data Integrity Gate
 * ================================================
 *
 * Runs on an INGESTED consensus dataset (DB rows or fixture store) and
 * produces the empirical PIT audit report required BEFORE V5-C OOS:
 *
 *   1. Coverage: security × period combinations, securities covered
 *   2. Revision chains: count, monotonicity, revisions after actual report
 *   3. knownAt distribution: min/max, per-year buckets
 *   4. OOS window coverage: months with >=1 observation
 *   5. Missingness: null consensusMean / analystCount rates
 *   6. Ticker rename cases (securityId → multiple tickers)
 *   7. Validator rejection stats (fact + revision gate errors)
 *
 * Gate PASSES only if:
 *   - zero leakage (no actualValue on pre-earnings snapshots)
 *   - zero future-dated observations
 *   - revision chains monotonic (no same-timestamp conflicts)
 *   - coverage >= frozen thresholds
 *
 * Thresholds are FROZEN here — do NOT tune after seeing OOS results.
 */

import {
  ConsensusFactInsert,
  ConsensusRevisionInsert,
} from './consensus-ingest-types';
import {
  validateConsensusFacts,
  validateConsensusRevisions,
} from './pit-consensus-validator';

// ─── Frozen gate thresholds (V5-C data gate — do NOT tune after seeing OOS) ──

export interface AuditThresholds {
  /** Min % of frozen-universe securities with >=1 consensus fact */
  minUniverseCoveragePct: number;
  /** Min % of OOS window months with >=1 observation */
  minWindowCoveragePct: number;
  /** Max allowed missingness (null consensusMean) rate in % */
  maxMissingMeanPct: number;
}

export const FROZEN_AUDIT_THRESHOLDS: AuditThresholds = {
  minUniverseCoveragePct: 60,
  minWindowCoveragePct: 80,
  maxMissingMeanPct: 5,
};

// ─── Audit input surface (DB rows or fixture store) ──────────────────────────

export interface AuditDataSource {
  readonly facts: readonly ConsensusFactInsert[];
  readonly revisions: readonly ConsensusRevisionInsert[];
  /** securityId → set of tickers seen in history (for rename detection) */
  readonly tickerHistory: ReadonlyMap<string, ReadonlySet<string>>;
}

// ─── Report types ────────────────────────────────────────────────────────────

export interface PitAuditReport {
  passed: boolean;
  gateFailures: string[];

  coverage: {
    totalFacts: number;
    securityPeriodCombinations: number;
    securitiesCovered: number;
    universeSize: number;
    universeCoveragePct: number;
  };

  revisions: {
    totalRevisions: number;
    chains: number;
    monotonicChains: number;
    conflictingTimestamps: number;
    revisionsAfterActualReport: number;
  };

  knownAt: {
    min: string | null;
    max: string | null;
    perYear: Record<number, number>;
  };

  window: {
    oosStart: string;
    oosEnd: string;
    monthsTotal: number;
    monthsCovered: number;
    windowCoveragePct: number;
  };

  missingness: {
    nullConsensusMeanPct: number;
    nullAnalystCountPct: number;
  };

  /**
   * Record classification — distinguishes WHY rows carry no usable
   * consensus, so coverage gaps are diagnosed, not just counted:
   *   valid                  consensusMean present
   *   nullMeanWithCoverage   null mean but analysts > 0 → REAL missingness
   *   zeroCoverageLike       null mean AND analystCount 0/null → looks like a
   *                          vendor non-observation (should have been excluded
   *                          at ingest when vendor documents zero-coverage
   *                          semantics — flagged here, not silently excused)
   *   futureObservation      observationDate in the future (clock-skew)
   *   lateAvailability       availableAt > observationDate (publication lag)
   *   malformed              structural problems (bad period, neg counts)
   */
  classification: {
    valid: number;
    nullMeanWithCoverage: number;
    zeroCoverageLike: number;
    futureObservation: number;
    lateAvailability: number;
    malformed: number;
  };

  tickerRenames: Array<{ securityId: string; tickers: string[] }>;

  validator: {
    factErrors: number;
    factWarnings: number;
    revisionErrors: number;
    revisionWarnings: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pct(part: number, total: number): number {
  return total === 0 ? 0 : (part / total) * 100;
}

function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthsBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  const cur = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const endM = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (cur.getTime() <= endM.getTime()) {
    out.push(monthKey(cur));
    cur.setUTCMonth(cur.getUTCMonth() + 1);
  }
  return out;
}

// ─── Core audit (pure) ───────────────────────────────────────────────────────

export function runPitAudit(
  data: {
    facts: readonly ConsensusFactInsert[];
    revisions: readonly ConsensusRevisionInsert[];
    tickerHistory: ReadonlyMap<string, ReadonlySet<string>>;
  },
  oosStart: Date,
  oosEnd: Date,
  universeSecurityIds: ReadonlySet<string>,
  thresholds: AuditThresholds = FROZEN_AUDIT_THRESHOLDS,
): PitAuditReport {
  const gateFailures: string[] = [];

  // ─── 1. Coverage ───
  const facts = data.facts;
  const secPeriods = new Set<string>();
  const securities = new Set<string>();
  for (const f of facts) {
    secPeriods.add(`${f.securityId}|${f.fiscalYear}|${f.fiscalPeriod}`);
    securities.add(f.securityId);
  }
  const universeCoveragePct = pct(securities.size, universeSecurityIds.size);
  if (universeCoveragePct < thresholds.minUniverseCoveragePct) {
    gateFailures.push(
      `COVERAGE: universe coverage ${universeCoveragePct.toFixed(1)}% < ${thresholds.minUniverseCoveragePct}%`,
    );
  }

  // ─── 2. Revision chains ───
  const revs = data.revisions;
  const chains = new Map<string, ConsensusRevisionInsert[]>();
  for (const r of revs) {
    const key = `${r.securityId}|${r.fiscalYear}|${r.fiscalPeriod}|${r.metricType}|${r.analystId ?? 'unknown'}`;
    if (!chains.has(key)) chains.set(key, []);
    chains.get(key)!.push(r);
  }

  let conflictingTimestamps = 0;
  let monotonicChains = 0;
  for (const chain of chains.values()) {
    const sorted = [...chain].sort((a, b) => a.revisionDate.getTime() - b.revisionDate.getTime());
    let conflict = false;
    for (let i = 1; i < sorted.length; i++) {
      if (
        sorted[i]!.revisionDate.getTime() === sorted[i - 1]!.revisionDate.getTime() &&
        sorted[i]!.newEstimate !== sorted[i - 1]!.newEstimate
      ) {
        conflict = true;
        break;
      }
    }
    if (conflict) conflictingTimestamps++;
    else monotonicChains++;
  }

  // Revisions after actual report (per security/period/metric)
  const actualReportByPeriod = new Map<string, Date>();
  for (const f of facts) {
    if (f.actualReportDate) {
      const key = `${f.securityId}|${f.fiscalYear}|${f.fiscalPeriod}|${f.metricType}`;
      actualReportByPeriod.set(key, f.actualReportDate);
    }
  }
  let revisionsAfterActualReport = 0;
  for (const r of revs) {
    const key = `${r.securityId}|${r.fiscalYear}|${r.fiscalPeriod}|${r.metricType}`;
    const report = actualReportByPeriod.get(key);
    if (report && r.revisionDate.getTime() > report.getTime()) {
      revisionsAfterActualReport++;
    }
  }

  // ─── 3. knownAt distribution ───
  const obsDates = facts.map(f => f.observationDate.getTime());
  const perYear = new Map<number, number>();
  for (const f of facts) {
    const y = f.observationDate.getUTCFullYear();
    perYear.set(y, (perYear.get(y) ?? 0) + 1);
  }

  // ─── 4. OOS window coverage ───
  const obsMonths = new Set(facts.map(f => monthKey(f.observationDate)));
  const windowMonths = monthsBetween(oosStart, oosEnd);
  const monthsCovered = windowMonths.filter(m => obsMonths.has(m)).length;
  const windowCoveragePct = pct(monthsCovered, windowMonths.length);
  if (windowCoveragePct < thresholds.minWindowCoveragePct) {
    gateFailures.push(
      `WINDOW: OOS window coverage ${windowCoveragePct.toFixed(1)}% < ${thresholds.minWindowCoveragePct}%`,
    );
  }

  // ─── 5. Missingness ───
  const nullMean = facts.filter(f => f.consensusMean === null || f.consensusMean === undefined).length;
  const nullCnt = facts.filter(f => f.analystCount === null || f.analystCount === undefined).length;
  const nullMeanPct = pct(nullMean, facts.length);
  const nullCountPct = pct(nullCnt, facts.length);
  if (nullMeanPct > thresholds.maxMissingMeanPct) {
    gateFailures.push(
      `MISSINGNESS: null consensusMean ${nullMeanPct.toFixed(1)}% > ${thresholds.maxMissingMeanPct}%`,
    );
  }

  // ─── 5b. Record classification (diagnostic — does not change the gate) ───
  const VALID_PERIODS = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'FY']);
  const cls = {
    valid: 0, nullMeanWithCoverage: 0, zeroCoverageLike: 0,
    futureObservation: 0, lateAvailability: 0, malformed: 0,
  };
  for (const f of facts) {
    if (f.observationDate.getTime() > Date.now()) cls.futureObservation++;
    if (f.availableAt.getTime() > f.observationDate.getTime()) cls.lateAvailability++;
    if (
      !VALID_PERIODS.has(f.fiscalPeriod) ||
      !f.periodEndDate || isNaN(f.periodEndDate.getTime()) ||
      (f.analystCount !== null && f.analystCount < 0)
    ) {
      cls.malformed++;
      continue;
    }
    if (f.consensusMean === null || f.consensusMean === undefined) {
      if (f.analystCount === null || f.analystCount === 0) cls.zeroCoverageLike++;
      else cls.nullMeanWithCoverage++;
    } else {
      cls.valid++;
    }
  }

  // ─── 6. Ticker renames ───
  const tickerRenames: Array<{ securityId: string; tickers: string[] }> = [];
  for (const [securityId, tickers] of data.tickerHistory) {
    if (tickers.size > 1) {
      tickerRenames.push({ securityId, tickers: Array.from(tickers).sort() });
    }
  }

  // ─── 7. Validator stats (the empirical PIT gate) ───
  const factValidation = validateConsensusFacts(facts);
  const revValidation = validateConsensusRevisions(revs);
  if (!factValidation.passed) {
    gateFailures.push(
      `PIT_FACTS: ${factValidation.errors.length} hard failures (leakage/temporal/future/duplicate/chain)`,
    );
  }
  if (!revValidation.passed) {
    gateFailures.push(
      `PIT_REVISIONS: ${revValidation.errors.length} hard failures (timestamp conflicts)`,
    );
  }

  return {
    passed: gateFailures.length === 0,
    gateFailures,
    coverage: {
      totalFacts: facts.length,
      securityPeriodCombinations: secPeriods.size,
      securitiesCovered: securities.size,
      universeSize: universeSecurityIds.size,
      universeCoveragePct,
    },
    revisions: {
      totalRevisions: revs.length,
      chains: chains.size,
      monotonicChains,
      conflictingTimestamps,
      revisionsAfterActualReport,
    },
    knownAt: {
      min: obsDates.length ? new Date(Math.min(...obsDates)).toISOString() : null,
      max: obsDates.length ? new Date(Math.max(...obsDates)).toISOString() : null,
      perYear: Object.fromEntries([...perYear.entries()].sort((a, b) => a[0] - b[0])),
    },
    window: {
      oosStart: oosStart.toISOString(),
      oosEnd: oosEnd.toISOString(),
      monthsTotal: windowMonths.length,
      monthsCovered,
      windowCoveragePct,
    },
    missingness: {
      nullConsensusMeanPct: nullMeanPct,
      nullAnalystCountPct: nullCountPct,
    },
    classification: cls,
    tickerRenames,
    validator: {
      factErrors: factValidation.errors.length,
      factWarnings: factValidation.warnings.length,
      revisionErrors: revValidation.errors.length,
      revisionWarnings: revValidation.warnings.length,
    },
  };
}
