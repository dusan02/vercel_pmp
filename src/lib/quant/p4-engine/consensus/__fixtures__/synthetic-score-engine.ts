/**
 * ═══════════════════════════════════════════════════════════════════════
 *  SYNTHETIC SCORE ENGINE — TEST/DEMO STUB ONLY, NOT THE EW ENGINE
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A deterministic stand-in for EwEngine used by the synthetic end-to-end
 * test and the local demo CLI. It scores each security by the PIT-reconstructed
 * EPS consensus mean at T (consensusAt) — a REAL check that as-of semantics
 * hold end-to-end — but it is NOT the V5-C scoring model and its output is
 * NOT a research result.
 *
 * EARNINGS is AVAILABLE iff a usable consensus snapshot exists at T
 * (observationDate <= T AND availableAt <= T) — that is what
 * consensusCoveragePct measures.
 */

import { ConsensusFactInsert } from '../consensus-ingest-types';
import { ConsensusFactRow } from '../consensus-feature-calculators';
import { consensusAt } from '../consensus-pit-reconstruction';
import {
  EwScore,
  EwRankedScore,
  EwUniverseResult,
  CategoryScore,
  FeatureCategory,
  CATEGORY_WEIGHTS,
} from '../../../ew-engine/types';

export const SYNTHETIC_ENGINE_LABEL =
  'SYNTHETIC TEST ENGINE — NOT THE V5-C SCORING MODEL — NOT A RESEARCH RESULT' as const;

function stubCategory(
  category: FeatureCategory,
  isBlocked: boolean,
  availableFeatureCount: number,
): CategoryScore {
  const weight = CATEGORY_WEIGHTS[category];
  return Object.freeze({
    category,
    weight,
    rawScore: isBlocked ? null : 50,
    weightedScore: isBlocked ? 0 : 50 * weight,
    featureCount: 4,
    availableFeatureCount,
    expectedFeatureCount: 4,
    isBlocked,
    isPartial: false,
    isSingleSecurity: false,
    providerVersions: Object.freeze(['STUB']),
  });
}

/**
 * Build a scoreUniverse function over ConsensusFactInsert rows
 * (e.g. an InMemoryConsensusStore's facts).
 */
export function makeSyntheticScoreEngine(facts: readonly ConsensusFactInsert[]) {
  const scoreUniverse = async (
    securityIds: string[],
    asOfTime: string,
  ): Promise<EwUniverseResult> => {
    const asOf = new Date(asOfTime);
    const rankedScores: EwRankedScore[] = securityIds.map((sid, i) => {
      const rows = facts
        .filter(f => f.securityId === sid)
        .map(f => ({ ...f, id: f.sourceRecordHash })) as ConsensusFactRow[];
      const usable = consensusAt(rows, 'EPS', asOf);
      const blocked = usable === null;
      const totalScore =
        usable?.consensusMean !== null && usable?.consensusMean !== undefined
          ? Math.max(0, Math.min(100, usable.consensusMean * 10))
          : i; // deterministic tiebreak for blocked
      const score: EwScore = {
        securityId: sid,
        asOfTime,
        totalScore,
        maxPossibleScore: 100,
        categoryScores: Object.freeze({
          EARNINGS: stubCategory('EARNINGS', blocked, blocked ? 0 : 3),
          FUNDAMENTALS: stubCategory('FUNDAMENTALS', false, 3),
          MOMENTUM: stubCategory('MOMENTUM', false, 3),
          QUALITY: stubCategory('QUALITY', false, 3),
        }),
        features: Object.freeze([]),
        pitGatePassed: !blocked,
        pitViolations: Object.freeze([]),
        engineVersion: 'STUB',
        weightsVersion: 'STUB',
        featureSetVersion: 'STUB',
        universeDefinition: null,
      };
      return { securityId: sid, score, rank: i + 1 };
    });
    return {
      rankedScores,
      universe: Object.freeze({
        universeId: 'SYNTHETIC-UNIVERSE',
        asOfTime,
        requestedSecurityIds: Object.freeze([...securityIds]),
        includedSecurityIds: Object.freeze([...securityIds]),
        excludedSecurityIds: Object.freeze([]),
      }),
    };
  };
  return { scoreUniverse };
}
