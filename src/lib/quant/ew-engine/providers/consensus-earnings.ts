/**
 * Consensus Earnings Feature Provider — STUB (BLOCKED)
 * ======================================================
 *
 * This provider is BLOCKED until vendor consensus data is available.
 * It returns BLOCKED features for all Earnings category slots.
 *
 * When vendor data arrives (3P.4.2 → 3P.6-E), replace this stub
 * with a real implementation using the EarningsVendorAdapter interface
 * from src/lib/quant/p5/earnings-contract.ts.
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
    return false; // BLOCKED
  }

  describeStatus(): string {
    return `${PROVIDER_VERSION}: BLOCKED — awaiting vendor consensus data (3P.4.2)`;
  }

  async computeFeatures(_securityId: string, asOfTime: string): Promise<EwFeature[]> {
    return EARNINGS_FEATURE_KEYS.map(key =>
      makeBlockedFeature(key, 'EARNINGS', asOfTime, 'Consensus provider not available — awaiting vendor data (3P.4.2)')
    );
  }
}
