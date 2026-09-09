/**
 * Consensus PIT Reconstruction — consensusAt(T)
 * ===============================================
 *
 * Core operation: given a set of consensus snapshots and a time T,
 * return the latest snapshot where knownAt <= T.
 *
 *   consensusAt(T) = latest consensus observation where knownAt <= T
 *
 * This is the PIT-correct way to query consensus data. It ensures
 * we never use information that wasn't available at time T.
 *
 * This module is tested with SYNTHETIC fixtures only. Synthetic tests
 * do NOT prove vendor PIT suitability — they verify our reconstruction
 * logic is correct. Vendor data must pass the empirical PIT gate separately.
 */

import { ConsensusFactRow } from './consensus-feature-calculators';

/**
 * Reconstruct the consensus state as-of time T.
 * Returns the latest snapshot with knownAt <= T.
 *
 * @param facts All consensus snapshots for a security/metric/period
 * @param metricType 'EPS' or 'REVENUE'
 * @param asOfDate T — the point-in-time we want to reconstruct
 * @returns The latest snapshot where knownAt <= T, or null if none exists
 */
export function consensusAt(
  facts: ConsensusFactRow[],
  metricType: string,
  asOfDate: Date,
): ConsensusFactRow | null {
  const eligible = facts
    .filter(f => f.metricType === metricType && f.observationDate.getTime() <= asOfDate.getTime())
    .sort((a, b) => a.observationDate.getTime() - b.observationDate.getTime());

  if (eligible.length === 0) return null;
  return eligible[eligible.length - 1];
}

/**
 * Reconstruct consensus at two points in time and compute revision percentage.
 *
 * revisionPct = ((currentEst - priorEst) / |priorEst|) * 100
 *
 * @param facts All consensus snapshots
 * @param metricType 'EPS' or 'REVENUE'
 * @param currentT Current time T
 * @param priorT Prior time (T - lookback)
 * @returns Revision percentage, or null if cannot compute
 */
export function consensusRevisionAt(
  facts: ConsensusFactRow[],
  metricType: string,
  currentT: Date,
  priorT: Date,
): number | null {
  const current = consensusAt(facts, metricType, currentT);
  const prior = consensusAt(facts, metricType, priorT);

  if (!current || !prior) return null;
  if (current.consensusMean === null || prior.consensusMean === null) return null;
  if (Math.abs(prior.consensusMean) < 0.01) return null;

  return ((current.consensusMean - prior.consensusMean) / Math.abs(prior.consensusMean)) * 100;
}

/**
 * Find the pre-earnings consensus for a fiscal period.
 * This is the consensus snapshot closest to (but before) the actual report date.
 *
 * @param facts All consensus snapshots
 * @param metricType 'EPS' or 'REVENUE'
 * @returns The pre-earnings consensus, or null
 */
export function preEarningsConsensusAt(
  facts: ConsensusFactRow[],
  metricType: string,
): ConsensusFactRow | null {
  // Find the snapshot with actualValue (the earnings event)
  const withActual = facts.find(
    f => f.metricType === metricType && f.actualValue !== null && f.actualReportDate !== null,
  );
  if (!withActual || !withActual.actualReportDate) return null;

  // Get the latest consensus BEFORE the report date
  const reportDate = withActual.actualReportDate;
  return consensusAt(facts, metricType, new Date(reportDate.getTime() - 1));
}

/**
 * Compute earnings surprise using PIT-correct pre-earnings consensus.
 *
 * surprisePct = ((actual - consensus) / |consensus|) * 100
 *
 * @param facts All consensus snapshots
 * @param metricType 'EPS' or 'REVENUE'
 * @returns Surprise percentage, or null if cannot compute
 */
export function surpriseAt(
  facts: ConsensusFactRow[],
  metricType: string,
): number | null {
  const preEarnings = preEarningsConsensusAt(facts, metricType);
  if (!preEarnings || preEarnings.consensusMean === null) return null;

  const withActual = facts.find(
    f => f.metricType === metricType && f.actualValue !== null,
  );
  if (!withActual || withActual.actualValue === null) return null;

  if (Math.abs(preEarnings.consensusMean) < 0.01) return null;
  return ((withActual.actualValue - preEarnings.consensusMean) / Math.abs(preEarnings.consensusMean)) * 100;
}

/**
 * Temporal Integrity Gate — verify that all facts respect PIT constraints.
 *
 * For a given time T, verify:
 *   1. No consensus snapshot used has knownAt > T
 *   2. No actual value used has actualReportDate > T
 *   3. No revision used has revisionDate > T
 *
 * @param facts All consensus snapshots
 * @param metricType Metric to check
 * @param asOfDate T — the point-in-time to verify
 * @returns { passed: boolean, violations: string[] }
 */
export function temporalIntegrityCheck(
  facts: ConsensusFactRow[],
  metricType: string,
  asOfDate: Date,
): { passed: boolean; violations: string[] } {
  const violations: string[] = [];
  const Tms = asOfDate.getTime();

  // Check all snapshots of this metric
  for (const f of facts) {
    if (f.metricType !== metricType) continue;

    // If this snapshot is used at T (knownAt <= T), verify no future info
    if (f.observationDate.getTime() <= Tms) {
      // Actual report date must not be after T (if present)
      if (f.actualReportDate && f.actualReportDate.getTime() > Tms) {
        violations.push(
          `Temporal violation: snapshot knownAt=${f.observationDate.toISOString()} ` +
          `has actualReportDate=${f.actualReportDate.toISOString()} > T=${asOfDate.toISOString()}`,
        );
      }
    }
  }

  return { passed: violations.length === 0, violations };
}
