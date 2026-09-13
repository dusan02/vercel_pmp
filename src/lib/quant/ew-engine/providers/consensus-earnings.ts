/**
 * Consensus Earnings Feature Provider — BLOCKED (adapter ready, awaiting ingest)
 * ===========================================================================
 *
 * The EstimizeConsensusAdapter is IMPLEMENTED (see p4-engine/consensus/vendor-adapter.ts)
 * and can parse both CSV (historical files) and API JSON responses.
 *
 * This provider remains BLOCKED until:
 *   1. Estimize data is obtained (free trial CSV or API access)
 *   2. Ingest pipeline writes canonical snapshots to PIT DB
 *   3. consensusAt(T) reconstruction is verified
 *
 * Once data is ingested, replace computeFeatures() with real implementation
 * using ConsensusFeatureCalculators from p4-engine/consensus/consensus-feature-calculators.ts.
 *
 * Vendor decision: Estimize (see docs/v5-consensus-vendor-gate.md)
 * Adapter: EstimizeConsensusAdapter (parseSnapshots + parseRevisions implemented)
 *
 * DO NOT use free/current consensus APIs as a historical PIT source.
 */

import {
  EwFeature,
  FeatureProvider,
  FeatureCategory,
  makeBlockedFeature,
} from '../types.js';

const PROVIDER_VERSION = 'CONSENSUS-EARN-v0-BLOCKED';

const EARNINGS_FEATURE_KEYS = [
  'epsSurprisePct',
  'revenueSurprisePct',
  'estimateRevisionsPct',
  'guidanceSurprisePct',
] as const;

export class ConsensusEarningsProvider implements FeatureProvider {
  readonly categories: readonly FeatureCategory[] = Object.freeze(['EARNINGS']);
  readonly version = PROVIDER_VERSION;

  isAvailable(): boolean {
    return false; // BLOCKED — adapter ready, awaiting data ingest
  }

  describeStatus(): string {
    return `${PROVIDER_VERSION}: BLOCKED — Estimize adapter implemented, awaiting data ingest (see docs/v5-consensus-vendor-gate.md)`;
  }

  async computeFeatures(_securityId: string, asOfTime: string): Promise<EwFeature[]> {
    return EARNINGS_FEATURE_KEYS.map(key =>
      makeBlockedFeature(key, 'EARNINGS', asOfTime, 'Consensus data not ingested — awaiting Estimize ingest pipeline')
    );
  }
}
