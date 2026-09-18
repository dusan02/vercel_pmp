/**
 * V5-C OOS Evaluation Harness
 * ============================
 *
 * Frozen evaluation harness for the V5-B vs V5-C comparison.
 *
 * Design rules (FROZEN — do NOT tune after seeing results):
 *   - Same OOS observation dates for V5-B and V5-C
 *   - Same universe (frozen security set)
 *   - Same scoring engine (EwEngine, frozen weights 35/30/25/10)
 *   - Same forward-return horizon and evaluation rules
 *   - Only difference: consensus provider enabled (V5-C) vs blocked (V5-B)
 *
 * Metrics per variant:
 *   - Pearson correlation: totalScore vs forward return
 *   - Spread: mean forward return (top decile) − mean forward return (bottom decile)
 *   - Hit rate: % of top-decile names with positive forward return
 *   - Coverage: % of universe securities with a computable score
 *
 * GO/NO-GO (frozen BEFORE the run):
 *   GO   = V5-C Pearson > V5-B Pearson AND V5-C spread > V5-B spread
 *          AND V5-C consensus coverage >= minConsensusCoveragePct
 *   NO-GO otherwise → keep V5-B, close consensus path
 *
 * The harness is deterministic: same inputs → same report, bit-for-bit.
 */

import type { EwScore } from '../../ew-engine/types';

// ─── Frozen V5-B benchmark (from the completed OOS run — do NOT recompute) ───

export interface FrozenBenchmark {
  name: string;
  pearson: number;
  spreadPct: number;
  observations: number;
  securities: number;
}

export const V5B_BENCHMARK: FrozenBenchmark = {
  name: 'V5-B SEC-only OOS',
  pearson: 0.0984,
  spreadPct: 14.03,
  observations: 23941,
  securities: 589,
};

// ─── Harness input surface ───────────────────────────────────────────────────

/** One scored observation: score at T + forward return over the horizon. */
export interface ScoredObservation {
  securityId: string;
  asOfTime: string;
  totalScore: number;
  forwardReturnPct: number;
}

/** Minimal engine surface the harness needs (EwEngine or a fixture stub). */
export interface ScoreEngine {
  scoreUniverse(securityIds: string[], asOfTime: string): Promise<{
    rankedScores: ReadonlyArray<{ securityId: string; score: EwScore }>;
    universe: { includedSecurityIds: readonly string[] };
  }>;
}

/** Forward-return loader: securityId + asOf → forward return % over horizon. */
export type ForwardReturnFn = (securityId: string, asOfTime: string) => number | null;

// ─── Frozen GO/NO-GO rule ────────────────────────────────────────────────────

export interface GoNoGoCriteria {
  /** V5-C Pearson must exceed V5-B Pearson by at least this margin */
  minPearsonImprovement: number;
  /** V5-C spread must exceed V5-B spread by at least this many pp */
  minSpreadImprovementPp: number;
  /** Min % of scored observations that had consensus coverage (EARNINGS available) */
  minConsensusCoveragePct: number;
}

export const FROZEN_GO_NO_GO: GoNoGoCriteria = {
  minPearsonImprovement: 0.0,
  minSpreadImprovementPp: 0.0,
  minConsensusCoveragePct: 60,
};

// ─── Evaluation math (pure, deterministic) ───────────────────────────────────

export interface OosMetrics {
  observations: number;
  securities: number;
  pearson: number | null;
  spreadPct: number | null;
  hitRatePct: number | null;
  topDecileMeanReturnPct: number | null;
  bottomDecileMeanReturnPct: number | null;
}

/**
 * Pearson correlation between totalScore and forwardReturnPct.
 * Returns null when fewer than 2 pairs or zero variance.
 */
export function pearsonCorrelation(pairs: Array<{ x: number; y: number }>): number | null {
  if (pairs.length < 2) return null;
  const n = pairs.length;
  const meanX = pairs.reduce((s, p) => s + p.x, 0) / n;
  const meanY = pairs.reduce((s, p) => s + p.y, 0) / n;
  let cov = 0, varX = 0, varY = 0;
  for (const p of pairs) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    cov += dx * dy;
    varX += dx * dx;
    varY += dy * dy;
  }
  if (varX === 0 || varY === 0) return null;
  return cov / Math.sqrt(varX * varY);
}

/**
 * Compute OOS metrics from scored observations.
 * Spread = mean forward return of top decile (by score) − bottom decile.
 * Deterministic tie-breaking by (score ASC, securityId ASC).
 */
export function computeOosMetrics(observations: ScoredObservation[]): OosMetrics {
  if (observations.length === 0) {
    return {
      observations: 0, securities: 0,
      pearson: null, spreadPct: null, hitRatePct: null,
      topDecileMeanReturnPct: null, bottomDecileMeanReturnPct: null,
    };
  }

  const securities = new Set(observations.map(o => o.securityId)).size;
  const pairs = observations.map(o => ({ x: o.totalScore, y: o.forwardReturnPct }));
  const pearson = pearsonCorrelation(pairs);

  // Deterministic sort: score ASC, then securityId ASC, then asOf ASC
  const sorted = [...observations].sort(
    (a, b) =>
      a.totalScore - b.totalScore ||
      a.securityId.localeCompare(b.securityId) ||
      a.asOfTime.localeCompare(b.asOfTime),
  );

  const n = sorted.length;
  const decile = Math.max(1, Math.floor(n / 10));
  const bottom = sorted.slice(0, decile);
  const top = sorted.slice(n - decile);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const topMean = mean(top.map(o => o.forwardReturnPct));
  const bottomMean = mean(bottom.map(o => o.forwardReturnPct));
  const spreadPct = top !== null && bottom !== null && topMean !== null && bottomMean !== null
    ? topMean - bottomMean
    : null;

  const hitRatePct = top.length
    ? (top.filter(o => o.forwardReturnPct > 0).length / top.length) * 100
    : null;

  return {
    observations: n,
    securities,
    pearson,
    spreadPct,
    hitRatePct,
    topDecileMeanReturnPct: topMean,
    bottomDecileMeanReturnPct: bottomMean,
  };
}

// ─── OOS run (pure over a score function) ────────────────────────────────────

export interface OosRunResult {
  metrics: OosMetrics;
  /** % of observations where EARNINGS category was available (consensus coverage) */
  consensusCoveragePct: number;
}

/**
 * Run one OOS evaluation pass over the frozen observation dates.
 * `scoreAt` must be deterministic and PIT-correct (EwEngine.scoreUniverse
 * or a fixture-backed stub).
 */
export async function runOosPass(
  scoreUniverse: ScoreEngine['scoreUniverse'],
  universeSecurityIds: readonly string[],
  observationDates: readonly string[],
  forwardReturn: ForwardReturnFn,
): Promise<{ metrics: OosMetrics; consensusCoveragePct: number }> {
  const observations: ScoredObservation[] = [];
  let consensusAvailable = 0;

  for (const asOfTime of observationDates) {
    const result = await scoreUniverse([...universeSecurityIds], asOfTime);
    for (const ranked of result.rankedScores) {
      const fwd = forwardReturn(ranked.securityId, asOfTime);
      if (fwd === null) continue;
      observations.push({
        securityId: ranked.securityId,
        asOfTime,
        totalScore: ranked.score.totalScore,
        forwardReturnPct: fwd,
      });
      const earnings = ranked.score.categoryScores.EARNINGS;
      if (!earnings.isBlocked && earnings.availableFeatureCount > 0) consensusAvailable++;
    }
  }

  const metrics = computeOosMetrics(observations);
  const consensusCoveragePct = observations.length
    ? (consensusAvailable / observations.length) * 100
    : 0;

  return { metrics, consensusCoveragePct };
}

// ─── GO/NO-GO decision (pure) ────────────────────────────────────────────────

export interface GoNoGoReport {
  decision: 'GO' | 'NO-GO';
  reasons: string[];
  v5c: OosMetrics;
  v5b: FrozenBenchmark;
  consensusCoveragePct: number;
}

export function decideGoNoGo(
  v5cMetrics: OosMetrics,
  consensusCoveragePct: number,
  benchmark: FrozenBenchmark = V5B_BENCHMARK,
  criteria: GoNoGoCriteria = FROZEN_GO_NO_GO,
): GoNoGoReport {
  const reasons: string[] = [];
  let go = true;

  if (v5cMetrics.pearson === null || v5cMetrics.spreadPct === null) {
    go = false;
    reasons.push('V5-C metrics not computable (insufficient data)');
  } else {
    if (v5cMetrics.pearson <= benchmark.pearson + criteria.minPearsonImprovement) {
      go = false;
      reasons.push(
        `Pearson ${v5cMetrics.pearson.toFixed(4)} <= V5-B ${benchmark.pearson.toFixed(4)} + ${criteria.minPearsonImprovement}`,
      );
    }
    if (v5cMetrics.spreadPct <= benchmark.spreadPct + criteria.minSpreadImprovementPp) {
      go = false;
      reasons.push(
        `Spread ${v5cMetrics.spreadPct.toFixed(2)}% <= V5-B ${benchmark.spreadPct.toFixed(2)}% + ${criteria.minSpreadImprovementPp}pp`,
      );
    }
  }

  if (consensusCoveragePct < criteria.minConsensusCoveragePct) {
    go = false;
    reasons.push(
      `Consensus coverage ${consensusCoveragePct.toFixed(1)}% < ${criteria.minConsensusCoveragePct}%`,
    );
  }

  return {
    decision: go ? 'GO' : 'NO-GO',
    reasons: go ? ['V5-C improves Pearson AND spread over V5-B with sufficient consensus coverage'] : reasons,
    v5c: v5cMetrics,
    v5b: benchmark,
    consensusCoveragePct,
  };
}
