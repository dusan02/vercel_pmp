/**
 * EarlyWinner Engine — Feature Registry
 * ========================================
 *
 * Centralized registry of all expected features in the EarlyWinner scoring engine.
 * Every feature that ANY provider can return must be registered here.
 *
 * The scoring engine verifies that all registry features are present in the
 * output of every score computation. Missing features must be explicitly
 * marked MISSING/BLOCKED — they cannot silently disappear.
 *
 * Versioning: when a feature formula changes, increment its version and
 * update the registry. The featureSetVersion in EwScore reflects which
 * registry version was used.
 */

import { FeatureCategory } from './types.js';

export const FEATURE_SET_VERSION = 'EW-FEATURESET-v3';

/**
 * Research tier — evidence metadata, NOT a scoring parameter.
 * CORE ≠ higher weight. This field is for audit/provenance only.
 * The scoring engine MUST NOT interpret this as a weight.
 */
export type ResearchTier = 'CORE' | 'SECONDARY';

/**
 * Feature lifecycle status.
 * ACTIVE: feature is part of the current scoring set.
 * DEPRECATED: feature is superseded by a validated replacement.
 *   DEPRECATED entries remain in the registry for audit trail but are
 *   excluded from getFeaturesByCategory(), getExpectedFeatureKeys(),
 *   and verifyRegistryCompleteness().
 */
export type FeatureStatus = 'ACTIVE' | 'DEPRECATED';

export interface FeatureRegistryEntry {
  readonly key: string;
  readonly category: FeatureCategory;
  readonly provider: string;        // provider class name
  readonly providerVersion: string; // e.g. "SEC-FUND-v1"
  readonly formula: string;
  readonly pitRequirements: readonly string[];
  readonly minHistory: number;      // minimum quarters/bars needed
  readonly description: string;
  // ─── Lifecycle ───
  readonly status: FeatureStatus;              // ACTIVE or DEPRECATED
  readonly replacedBy: string | null;          // key of replacement feature (if DEPRECATED)
  // ─── Research provenance (optional — null for non-research-validated features) ───
  readonly researchTier: ResearchTier | null;   // evidence metadata, NOT a scoring parameter
  readonly researchProvenance: string | null;    // e.g. "P7.1", "P7.2", "P7.3"
  readonly researchCommit: string | null;        // git commit of frozen experiment
  readonly researchStatus: string | null;        // e.g. "PASS-frozen", "PASS-borderline-matched"
}

export const FEATURE_REGISTRY: readonly FeatureRegistryEntry[] = Object.freeze([
  // ─── EARNINGS (blocked — vendor gate pending) ───
  {
    key: 'epsSurprisePct',
    category: 'EARNINGS',
    provider: 'ConsensusEarningsProvider',
    providerVersion: 'CONSENSUS-EARN-v0-BLOCKED',
    formula: '(actual - consensus) / abs(consensus) * 100',
    pitRequirements: ['consensus.observationDate <= asOfTime', 'actual.reportDate <= asOfTime'],
    minHistory: 1,
    description: 'EPS surprise percentage vs analyst consensus',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'revenueSurprisePct',
    category: 'EARNINGS',
    provider: 'ConsensusEarningsProvider',
    providerVersion: 'CONSENSUS-EARN-v0-BLOCKED',
    formula: '(actualRevenue - consensusRevenue) / abs(consensusRevenue) * 100',
    pitRequirements: ['consensus.observationDate <= asOfTime', 'actual.reportDate <= asOfTime'],
    minHistory: 1,
    description: 'Revenue surprise percentage vs analyst consensus',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'estimateRevisionsPct',
    category: 'EARNINGS',
    provider: 'ConsensusEarningsProvider',
    providerVersion: 'CONSENSUS-EARN-v0-BLOCKED',
    formula: '(consensusT1 - consensusT0) / abs(consensusT0) * 100',
    pitRequirements: ['consensusT1.observationDate <= asOfTime', 'consensusT0.observationDate <= asOfTime'],
    minHistory: 2,
    description: 'Estimate revision percentage between two consensus snapshots',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'guidanceSurprisePct',
    category: 'EARNINGS',
    provider: 'ConsensusEarningsProvider',
    providerVersion: 'CONSENSUS-EARN-v0-BLOCKED',
    formula: '(actualGuidance - consensusGuidance) / abs(consensusGuidance) * 100',
    pitRequirements: ['consensus.observationDate <= asOfTime', 'guidance.publishedAt <= asOfTime'],
    minHistory: 1,
    description: 'Guidance surprise percentage (if available)',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },

  // ─── FUNDAMENTALS (legacy — DEPRECATED, superseded by P7-validated features) ───
  // SDD-v1 decision: legacy features are DEPRECATED, not scored.
  // Retained in registry for audit trail and backward compatibility.
  {
    key: 'revenueAccelerationPct',
    category: 'FUNDAMENTALS',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: 'currentYoY - priorYoY',
    pitRequirements: ['all facts availableAt <= asOfTime', 'earliest availableAt per (year,period)'],
    minHistory: 5,
    description: 'YoY revenue growth acceleration (current YoY minus prior quarter YoY) — DEPRECATED',
    status: 'DEPRECATED',
    replacedBy: 'revenueYoYGrowthShock',
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'marginExpansionBps',
    category: 'FUNDAMENTALS',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: '((curOp/curRev) - (priorOp/priorRev)) * 10000',
    pitRequirements: ['all facts availableAt <= asOfTime', 'earliest availableAt per (year,period)'],
    minHistory: 2,
    description: 'Operating margin YoY change in basis points — DEPRECATED',
    status: 'DEPRECATED',
    replacedBy: 'operatingMarginYoYExpansion',
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },

  // ─── FUNDAMENTALS (P7-validated — Feature Selection Decision v1) ───
  // These features are registered with frozen research provenance.
  // researchTier is EVIDENCE METADATA, NOT a scoring parameter.
  // The scoring engine MUST NOT interpret researchTier as a weight.
  // Intra-category weighting is a separate scoring-design decision.
  {
    key: 'revenueYoYGrowthShock',
    category: 'FUNDAMENTALS',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: '(revenue_q - revenue_{q-4}) / abs(revenue_{q-4})',
    pitRequirements: [
      'all facts availableAt <= asOfTime',
      'earliest availableAt per (year,period)',
      'sourceForm = 10-Q',
      'fiscalPeriod IN (Q1, Q2, Q3)',
      'revenue >= $1M (denominator floor)',
      'revenue_{q-4} >= $1M',
    ],
    minHistory: 9,
    description: 'YoY quarterly revenue growth from 10-Q filings (P7.1 validated signal)',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: 'CORE',
    researchProvenance: 'P7.1',
    researchCommit: 'ed78aa4',
    researchStatus: 'PASS-frozen',
  },
  {
    key: 'operatingMarginYoYExpansion',
    category: 'FUNDAMENTALS',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: '(operatingIncome_q / revenue_q) - (operatingIncome_{q-4} / revenue_{q-4})',
    pitRequirements: [
      'all facts availableAt <= asOfTime',
      'earliest availableAt per (year,period)',
      'sourceForm = 10-Q',
      'fiscalPeriod IN (Q1, Q2, Q3)',
      'revenue > 0 (margin computation)',
      'operatingIncome NOT NULL',
    ],
    minHistory: 9,
    description: 'YoY operating margin change from 10-Q filings (P7.2 validated signal)',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: 'CORE',
    researchProvenance: 'P7.2',
    researchCommit: '962f9bc',
    researchStatus: 'PASS-frozen',
  },
  {
    key: 'fcfYoYGrowthShock',
    category: 'FUNDAMENTALS',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: '(FCF_q - FCF_{q-4}) / abs(FCF_{q-4}) where FCF = operatingCashFlow - capitalExpenditures',
    pitRequirements: [
      'all facts availableAt <= asOfTime',
      'earliest availableAt per (year,period)',
      'sourceForm = 10-Q',
      'fiscalPeriod IN (Q1, Q2, Q3)',
      'operatingCashFlow NOT NULL',
      'capitalExpenditures NOT NULL',
      'abs(FCF_{q-4}) >= $1M (denominator floor)',
    ],
    minHistory: 9,
    description: 'YoY FCF growth from 10-Q filings, FCF computed as OCF - CapEx (P7.3 validated signal)',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: 'SECONDARY',
    researchProvenance: 'P7.3',
    researchCommit: '87b6e23',
    researchStatus: 'PASS-frozen-borderline-matched',
  },

  // ─── MOMENTUM ───
  {
    key: 'priceStrengthPct',
    category: 'MOMENTUM',
    provider: 'PriceMomentumProvider',
    providerVersion: 'PRICE-MOM-v1',
    formula: 'stockReturn(6M) - spyReturn(6M)',
    pitRequirements: ['all prices availableAt <= asOfTime', 'tradeDate <= asOfTime'],
    minHistory: 126, // ~6 months of trading days
    description: '6-month relative return vs SPY benchmark',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'trendAlignment',
    category: 'MOMENTUM',
    provider: 'PriceMomentumProvider',
    providerVersion: 'PRICE-MOM-v1',
    formula: 'currentPrice > MA50 ? 100 : 0',
    pitRequirements: ['all prices availableAt <= asOfTime', 'tradeDate <= asOfTime'],
    minHistory: 51, // 50-day MA + current
    description: 'Binary trend indicator: 100 if above 50-day MA, 0 if below',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'relativeVolume',
    category: 'MOMENTUM',
    provider: 'PriceMomentumProvider',
    providerVersion: 'PRICE-MOM-v1',
    formula: 'currentVolume / avgVolume(20d)',
    pitRequirements: ['all prices availableAt <= asOfTime', 'tradeDate <= asOfTime'],
    minHistory: 21, // 20-day avg + current
    description: 'Current volume relative to 20-day average volume',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },

  // ─── QUALITY ───
  {
    key: 'profitabilityScore',
    category: 'QUALITY',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: '100 * (1 - stdDev(margin_4q) / 0.10)',
    pitRequirements: ['all facts availableAt <= asOfTime', 'earliest availableAt per (year,period)'],
    minHistory: 4, // 4 quarters of margin data
    description: 'Margin stability score over 4 quarters (lower variance = higher score)',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
  {
    key: 'leverageRatio',
    category: 'QUALITY',
    provider: 'SecFundamentalsProvider',
    providerVersion: 'SEC-FUND-v1',
    formula: 'totalLiabilities / stockholdersEquity',
    pitRequirements: ['all facts availableAt <= asOfTime', 'earliest availableAt per (year,period)'],
    minHistory: 1,
    description: 'Leverage ratio: total liabilities divided by stockholders equity',
    status: 'ACTIVE',
    replacedBy: null,
    researchTier: null,
    researchProvenance: null,
    researchCommit: null,
    researchStatus: null,
  },
]);

// ─── Registry helpers ────────────────────────────────────────────────────
// SDD-v1: DEPRECATED features are excluded from scoring-related queries.
// They remain in FEATURE_REGISTRY for audit trail but are not expected by
// verifyRegistryCompleteness() or getFeaturesByCategory().

export function getFeaturesByCategory(category: FeatureCategory): readonly FeatureRegistryEntry[] {
  return FEATURE_REGISTRY.filter(e => e.category === category && e.status === 'ACTIVE');
}

export function getFeaturesByProvider(providerName: string): readonly FeatureRegistryEntry[] {
  return FEATURE_REGISTRY.filter(e => e.provider === providerName && e.status === 'ACTIVE');
}

export function getExpectedFeatureKeys(): readonly string[] {
  return FEATURE_REGISTRY.filter(e => e.status === 'ACTIVE').map(e => e.key);
}

export function getDeprecatedFeatures(): readonly FeatureRegistryEntry[] {
  return FEATURE_REGISTRY.filter(e => e.status === 'DEPRECATED');
}

export function getRegistryEntry(key: string): FeatureRegistryEntry | undefined {
  return FEATURE_REGISTRY.find(e => e.key === key);
}

// ─── Research-validated feature helpers ──────────────────────────────────

export function getResearchValidatedFeatures(): readonly FeatureRegistryEntry[] {
  return FEATURE_REGISTRY.filter(e => e.researchTier !== null);
}

export function getFeaturesByResearchTier(tier: ResearchTier): readonly FeatureRegistryEntry[] {
  return FEATURE_REGISTRY.filter(e => e.researchTier === tier);
}
