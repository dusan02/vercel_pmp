/**
 * EarlyWinner Engine — Public API
 * =================================
 *
 * Usage:
 *   import { EwEngine } from './ew-engine';
 *   const engine = new EwEngine(prisma);
 *   const score = await engine.score(securityId, asOfTime);
 *   const result = await engine.scoreUniverse(securityIds, asOfTime);
 */

export { EwEngine, ENGINE_VERSION, FROZEN_WEIGHTS_VERSION, FEATURE_SET_VERSION } from './scoring-engine.js';
export { PitGate } from './pit-gate.js';
export { SecFundamentalsProvider } from './providers/sec-fundamentals.js';
export { PriceMomentumProvider } from './providers/price-momentum.js';
export { ConsensusEarningsProvider } from './providers/consensus-earnings.js';
export {
  FEATURE_REGISTRY,
  FEATURE_SET_VERSION as REGISTRY_FEATURE_SET_VERSION,
  getFeaturesByCategory,
  getFeaturesByProvider,
  getExpectedFeatureKeys,
  getRegistryEntry,
  getResearchValidatedFeatures,
  getFeaturesByResearchTier,
  getDeprecatedFeatures,
} from './feature-registry.js';
export type { ResearchTier, FeatureStatus } from './feature-registry.js';
export * from './types.js';
