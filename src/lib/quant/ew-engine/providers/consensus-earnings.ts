/**
 * Consensus Earnings Feature Provider
 * ====================================
 *
 * Computes Earnings category features from PitConsensusFact (PIT-correct).
 *
 * Features (EARNINGS, 35%):
 *   - epsSurprisePct: ((actual - consensus) / |consensus|) * 100
 *   - revenueSurprisePct: same for revenue
 *   - estimateRevisionsPct: consensus revision over 30-day lookback
 *   - guidanceSurprisePct: NOT PROVIDED by Estimize → always MISSING
 *
 * PIT: All facts queried with observationDate <= asOfTime. consensusAt(T)
 * reconstruction from consensus-pit-reconstruction.ts. orderBy for determinism.
 *
 * isAvailable(): true when the DB contains at least one consensus fact
 * (i.e. the Estimize ingest has been run). No DB rows → BLOCKED.
 *
 * Vendor decision: Estimize (see docs/v5-consensus-vendor-gate.md)
 */

import { PrismaClient } from '../../p4-engine/db/client';
import {
  EwFeature,
  FeatureProvider,
  FeatureCategory,
  makeMissingFeature,
} from '../types.js';
import { surpriseAt, consensusRevisionAt, consensusAt, preEarningsConsensusAt } from '../../p4-engine/consensus/consensus-pit-reconstruction';
import { ConsensusFactRow } from '../../p4-engine/consensus/consensus-feature-calculators';

const PROVIDER_VERSION = 'CONSENSUS-EARN-v1';

const EARNINGS_FEATURE_KEYS = [
  'epsSurprisePct',
  'revenueSurprisePct',
  'estimateRevisionsPct',
  'guidanceSurprisePct',
] as const;

const REVISION_LOOKBACK_DAYS = 30;

/** Minimal DB row shape — mirrors PitConsensusFact. */
interface PitConsensusFactRow {
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
  sourceProvider: string;
  sourceType: string;
}

export class ConsensusEarningsProvider implements FeatureProvider {
  readonly categories: readonly FeatureCategory[] = Object.freeze(['EARNINGS']);
  readonly version = PROVIDER_VERSION;

  constructor(private prisma: PrismaClient) {}

  isAvailable(): boolean {
    // Provider is deployed — per-security coverage is handled in computeFeatures
    // (no facts → BLOCKED features → category excluded from scoring).
    return true;
  }

  describeStatus(): string {
    return `${PROVIDER_VERSION}: PitConsensusFact (Estimize ingest required for coverage)`;
  }

  async computeFeatures(securityId: string, asOfTime: string): Promise<EwFeature[]> {
    const asOf = new Date(asOfTime);

    // Load PIT-correct facts: observationDate <= asOfTime, ordered deterministically
    const facts = await this.prisma.pitConsensusFact.findMany({
      where: {
        securityId,
        observationDate: { lte: asOf },
      },
      select: {
        fiscalYear: true,
        fiscalPeriod: true,
        periodEndDate: true,
        observationDate: true,
        availableAt: true,
        metricType: true,
        consensusMean: true,
        consensusMedian: true,
        consensusHigh: true,
        consensusLow: true,
        consensusStdDev: true,
        analystCount: true,
        actualValue: true,
        actualReportDate: true,
        sourceProvider: true,
        sourceType: true,
      },
      orderBy: [
        { fiscalYear: 'asc' },
        { fiscalPeriod: 'asc' },
        { metricType: 'asc' },
        { observationDate: 'asc' },
      ],
    });

    if (facts.length === 0) {
      // No consensus coverage for this security → BLOCKED (category excluded)
      return EARNINGS_FEATURE_KEYS.map(key =>
        makeMissingFeature(key, 'EARNINGS', asOfTime, 'No consensus facts ingested for security', 'BLOCKED'),
      );
    }

    // Group by fiscal period for surprise computation
    const periodGroups = new Map<string, PitConsensusFactRow[]>();
    for (const f of facts) {
      const key = `${f.fiscalYear}|${f.fiscalPeriod}`;
      if (!periodGroups.has(key)) periodGroups.set(key, []);
      periodGroups.get(key)!.push(f);
    }

    const features: EwFeature[] = [];

    // ─── epsSurprisePct: pre-earnings consensus vs actual (latest reported period) ───
    features.push(this.computeSurpriseFeature(periodGroups, 'EPS', 'epsSurprisePct', asOfTime));
    features.push(this.computeSurpriseFeature(periodGroups, 'REVENUE', 'revenueSurprisePct', asOfTime));

    // ─── estimateRevisionsPct: consensus revision over lookback (latest period) ───
    features.push(this.computeRevisionFeature(periodGroups, asOfTime));

    // ─── guidanceSurprisePct: not provided by Estimize ───
    features.push(makeMissingFeature('guidanceSurprisePct', 'EARNINGS', asOfTime, 'Guidance data not provided by vendor'));

    return features;
  }

  /**
   * Surprise feature: find the latest fiscal period with an actual value,
   * compute surprise = ((actual - preEarningsConsensus) / |consensus|) * 100.
   */
  private computeSurpriseFeature(
    periodGroups: Map<string, PitConsensusFactRow[]>,
    metricType: string,
    featureKey: string,
    asOfTime: string,
  ): EwFeature {
    // Latest period first (deterministic order)
    const periods = Array.from(periodGroups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]));

    for (const [, groupFacts] of periods) {
      const withActual = groupFacts.find(f => f.actualValue !== null && f.actualReportDate !== null);
      if (!withActual) continue;

      const rows = groupFacts.map(toFactRow);
      const surprise = surpriseAt(rows, metricType);
      if (surprise === null) {
        return makeMissingFeature(featureKey, 'EARNINGS', asOfTime, 'Pre-earnings consensus unavailable');
      }

      const preEarnings = preEarningsConsensusAt(rows, metricType);

      return Object.freeze({
        key: featureKey,
        category: 'EARNINGS',
        value: surprise,
        knownAt: withActual.actualReportDate!.toISOString(),
        availableAt: withActual.availableAt.toISOString(),
        source: 'ESTIMIZE',
        accession: null,
        confidence: 1.0,
        pitValid: true,
        availability: 'AVAILABLE',
        evidence: Object.freeze({
          formula: '((actual - preEarningsConsensus) / abs(preEarningsConsensus)) * 100',
          inputs: Object.freeze({
            actual: withActual.actualValue,
            preEarningsConsensus: preEarnings?.consensusMean ?? null,
          }),
          periodEnd: withActual.periodEndDate.toISOString(),
          periodStart: null,
          notes: 'PIT-correct: consensus snapshot strictly before actualReportDate',
        }),
      });
    }

    return makeMissingFeature(featureKey, 'EARNINGS', asOfTime, 'No reported earnings in consensus data');
  }

  /**
   * Revision feature: consensusAt(T) vs consensusAt(T - 30d) for the latest period.
   */
  private computeRevisionFeature(
    periodGroups: Map<string, PitConsensusFactRow[]>,
    asOfTime: string,
  ): EwFeature {
    const asOf = new Date(asOfTime);
    const priorT = new Date(asOf.getTime() - REVISION_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

    // Latest period with at least one EPS snapshot
    const periods = Array.from(periodGroups.entries())
      .sort((a, b) => b[0].localeCompare(a[0]));

    for (const [, groupFacts] of periods) {
      const rows = groupFacts.map(toFactRow);
      const revision = consensusRevisionAt(rows, 'EPS', asOf, priorT);
      if (revision !== null) {
        const current = consensusAt(rows, 'EPS', asOf);
        return Object.freeze({
          key: 'estimateRevisionsPct',
          category: 'EARNINGS',
          value: revision,
          knownAt: current!.observationDate.toISOString(),
          availableAt: current!.availableAt.toISOString(),
          source: 'ESTIMIZE',
          accession: null,
          confidence: 1.0,
          pitValid: true,
          availability: 'AVAILABLE',
          evidence: Object.freeze({
            formula: '((consensusAt(T) - consensusAt(T-30d)) / abs(consensusAt(T-30d))) * 100',
            inputs: Object.freeze({ lookbackDays: REVISION_LOOKBACK_DAYS }),
            periodEnd: current!.periodEndDate.toISOString(),
            periodStart: null,
            notes: 'PIT-correct: both snapshots have observationDate <= T',
          }),
        });
      }
    }

    return makeMissingFeature('estimateRevisionsPct', 'EARNINGS', asOfTime, 'Insufficient consensus history for revision');
  }
}

/** Convert DB row to ConsensusFactRow for reconstruction functions. */
function toFactRow(f: PitConsensusFactRow): ConsensusFactRow {
  return {
    id: `${f.metricType}|${f.fiscalYear}|${f.fiscalPeriod}|${f.observationDate.toISOString()}`,
    securityId: '', // Not needed for reconstruction (caller scopes by security)
    fiscalYear: f.fiscalYear,
    fiscalPeriod: f.fiscalPeriod,
    periodEndDate: f.periodEndDate,
    observationDate: f.observationDate,
    availableAt: f.availableAt,
    metricType: f.metricType,
    consensusMean: f.consensusMean,
    consensusMedian: f.consensusMedian,
    consensusHigh: f.consensusHigh,
    consensusLow: f.consensusLow,
    consensusStdDev: f.consensusStdDev,
    analystCount: f.analystCount,
    actualValue: f.actualValue,
    actualReportDate: f.actualReportDate,
  };
}
