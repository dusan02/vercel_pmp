/**
 * Consensus Feature Calculators — PIT-correct
 * ============================================
 *
 * Computes earnings surprise and estimate revision features from
 * PitConsensusFact and PitConsensusRevision data.
 *
 * All features are PIT-correct:
 *   - Only consensus snapshots with observationDate <= T are used
 *   - Only revisions with revisionDate <= T are used
 *   - No future information leaks
 *
 * Features:
 *   1. epsSurprisePct: ((actual - consensus) / |consensus|) * 100
 *      - consensus = pre-earnings snapshot (closest to but before actualReportDate)
 *      - actual = reported EPS
 *
 *   2. revenueSurprisePct: same for revenue
 *
 *   3. estimateRevisionsPct: ((currentEst - priorEst) / |priorEst|) * 100
 *      - currentEst = consensus as-of T
 *      - priorEst = consensus as-of T - 30 days (or T - 60 days)
 *
 *   4. estimateAccelerationPct: revision acceleration
 *      - currentRevision = estimateRevisionsPct(T, T-30)
 *      - priorRevision = estimateRevisionsPct(T-30, T-60)
 *      - acceleration = currentRevision - priorRevision
 *
 *   5. analystCountChange: change in analyst count (coverage momentum)
 *
 *   6. estimateDispersionPct: (stdDev / |mean|) * 100 (uncertainty)
 */

import { PrismaClient } from '../db/client';

const DB_URL = 'postgresql://postgres:postgres@localhost:54320/postgres?schema=public';

export interface ConsensusFeatures {
  epsSurprisePct: number | null;
  revenueSurprisePct: number | null;
  epsRevisionPct: number | null;
  revenueRevisionPct: number | null;
  epsRevisionAcceleration: number | null;
  analystCountChange: number | null;
  epsDispersionPct: number | null;
}

export interface ConsensusFactRow {
  id: string;
  securityId: string;
  fiscalYear: number;
  fiscalPeriod: string;
  periodEndDate: Date;
  observationDate: Date;
  availableAt: Date;
  metricType: string;
  consensusMean: number | null;
  consensusMedian: number | null;
  consensusHigh: number | null;
  consensusLow: number | null;
  consensusStdDev: number | null;
  analystCount: number | null;
  actualValue: number | null;
  actualReportDate: Date | null;
}

/**
 * Find the pre-earnings consensus snapshot for a fiscal period.
 * This is the snapshot closest to (but before) the actual report date.
 * PIT-correct: only snapshots with observationDate <= actualReportDate.
 */
export function findPreEarningsConsensus(
  facts: ConsensusFactRow[],
  metricType: string,
): ConsensusFactRow | null {
  const metricFacts = facts.filter(f => f.metricType === metricType);
  if (metricFacts.length === 0) return null;

  // Find the snapshot with actualValue (the earnings event snapshot)
  const withActual = metricFacts.find(f => f.actualValue !== null && f.actualReportDate !== null);
  if (!withActual || !withActual.actualReportDate) return null;

  const reportDate = withActual.actualReportDate.getTime();

  // Find the latest snapshot BEFORE the report date (pre-earnings consensus)
  const preEarnings = metricFacts
    .filter(f => f.observationDate.getTime() < reportDate)
    .sort((a, b) => b.observationDate.getTime() - a.observationDate.getTime());

  return preEarnings[0] ?? null;
}

/**
 * Compute epsSurprisePct = ((actual - consensus) / |consensus|) * 100
 * PIT-correct: uses pre-earnings consensus, not post-earnings restated value.
 */
export function computeEpsSurprisePct(facts: ConsensusFactRow[]): number | null {
  const preEarnings = findPreEarningsConsensus(facts, 'EPS');
  if (!preEarnings || preEarnings.consensusMean === null) return null;

  const withActual = facts.find(f => f.metricType === 'EPS' && f.actualValue !== null);
  if (!withActual || withActual.actualValue === null) return null;

  const consensus = preEarnings.consensusMean;
  const actual = withActual.actualValue;

  if (Math.abs(consensus) < 0.01) return null; // avoid division by near-zero
  return ((actual - consensus) / Math.abs(consensus)) * 100;
}

/**
 * Compute revenueSurprisePct (same logic as EPS)
 */
export function computeRevenueSurprisePct(facts: ConsensusFactRow[]): number | null {
  const preEarnings = findPreEarningsConsensus(facts, 'REVENUE');
  if (!preEarnings || preEarnings.consensusMean === null) return null;

  const withActual = facts.find(f => f.metricType === 'REVENUE' && f.actualValue !== null);
  if (!withActual || withActual.actualValue === null) return null;

  const consensus = preEarnings.consensusMean;
  const actual = withActual.actualValue;

  if (Math.abs(consensus) < 1) return null;
  return ((actual - consensus) / Math.abs(consensus)) * 100;
}

/**
 * Compute estimateRevisionsPct for a metric.
 * = ((currentEst - priorEst) / |priorEst|) * 100
 *
 * currentEst = consensus as-of T
 * priorEst = consensus as-of (T - lookbackDays)
 *
 * PIT-correct: only snapshots with observationDate <= T.
 */
export function computeEstimateRevisionsPct(
  facts: ConsensusFactRow[],
  metricType: string,
  asOfDate: Date,
  lookbackDays: number = 30,
): number | null {
  const metricFacts = facts
    .filter(f => f.metricType === metricType && f.observationDate.getTime() <= asOfDate.getTime())
    .sort((a, b) => a.observationDate.getTime() - b.observationDate.getTime());

  if (metricFacts.length < 2) return null;

  const asOfMs = asOfDate.getTime();
  const priorMs = asOfMs - lookbackDays * 86400000;

  // Current: latest snapshot <= asOfDate
  const current = metricFacts[metricFacts.length - 1];
  if (!current || current.consensusMean === null) return null;

  // Prior: latest snapshot <= (asOfDate - lookbackDays)
  const priorFacts = metricFacts.filter(f => f.observationDate.getTime() <= priorMs);
  if (priorFacts.length === 0) return null;
  const prior = priorFacts[priorFacts.length - 1];
  if (!prior || prior.consensusMean === null) return null;

  if (Math.abs(prior.consensusMean) < 0.01) return null;
  return ((current.consensusMean - prior.consensusMean) / Math.abs(prior.consensusMean)) * 100;
}

/**
 * Compute revision acceleration:
 * currentRevision = estimateRevisionsPct(T, T-30)
 * priorRevision = estimateRevisionsPct(T-30, T-60)
 * acceleration = currentRevision - priorRevision
 */
export function computeEstimateAcceleration(
  facts: ConsensusFactRow[],
  metricType: string,
  asOfDate: Date,
): number | null {
  const currentRev = computeEstimateRevisionsPct(facts, metricType, asOfDate, 30);
  const priorDate = new Date(asOfDate.getTime() - 30 * 86400000);
  const priorRev = computeEstimateRevisionsPct(facts, metricType, priorDate, 30);

  if (currentRev === null || priorRev === null) return null;
  return currentRev - priorRev;
}

/**
 * Compute analyst count change (coverage momentum).
 * Positive = more analysts covering (bullish signal).
 */
export function computeAnalystCountChange(
  facts: ConsensusFactRow[],
  metricType: string,
  asOfDate: Date,
  lookbackDays: number = 30,
): number | null {
  const metricFacts = facts
    .filter(f => f.metricType === metricType && f.observationDate.getTime() <= asOfDate.getTime())
    .sort((a, b) => a.observationDate.getTime() - b.observationDate.getTime());

  if (metricFacts.length < 2) return null;

  const current = metricFacts[metricFacts.length - 1];
  const priorMs = asOfDate.getTime() - lookbackDays * 86400000;
  const priorFacts = metricFacts.filter(f => f.observationDate.getTime() <= priorMs);
  if (priorFacts.length === 0) return null;
  const prior = priorFacts[priorFacts.length - 1];

  if (current.analystCount === null || prior.analystCount === null) return null;
  return current.analystCount - prior.analystCount;
}

/**
 * Compute estimate dispersion (uncertainty).
 * = (stdDev / |mean|) * 100
 * High dispersion = high uncertainty = potentially larger surprise.
 */
export function computeEstimateDispersionPct(
  facts: ConsensusFactRow[],
  metricType: string,
  asOfDate: Date,
): number | null {
  const metricFacts = facts
    .filter(f => f.metricType === metricType && f.observationDate.getTime() <= asOfDate.getTime())
    .sort((a, b) => b.observationDate.getTime() - a.observationDate.getTime());

  if (metricFacts.length === 0) return null;
  const latest = metricFacts[0];
  if (!latest.consensusMean || !latest.consensusStdDev) return null;
  if (Math.abs(latest.consensusMean) < 0.01) return null;
  return (latest.consensusStdDev / Math.abs(latest.consensusMean)) * 100;
}

/**
 * Compute all consensus features for a security at a point in time T.
 */
export function computeAllConsensusFeatures(
  facts: ConsensusFactRow[],
  asOfDate: Date,
): ConsensusFeatures {
  return {
    epsSurprisePct: computeEpsSurprisePct(facts),
    revenueSurprisePct: computeRevenueSurprisePct(facts),
    epsRevisionPct: computeEstimateRevisionsPct(facts, 'EPS', asOfDate, 30),
    revenueRevisionPct: computeEstimateRevisionsPct(facts, 'REVENUE', asOfDate, 30),
    epsRevisionAcceleration: computeEstimateAcceleration(facts, 'EPS', asOfDate),
    analystCountChange: computeAnalystCountChange(facts, 'EPS', asOfDate, 30),
    epsDispersionPct: computeEstimateDispersionPct(facts, 'EPS', asOfDate),
  };
}
