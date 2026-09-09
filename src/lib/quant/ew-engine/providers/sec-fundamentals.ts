/**
 * SEC Fundamentals Feature Provider
 * ===================================
 *
 * Computes Fundamentals and Quality category features from PitFundamentalFact.
 *
 * Features:
 *   Fundamentals (30%):
 *     - revenueAccelerationPct: YoY revenue growth acceleration
 *     - marginExpansionBps: operating margin YoY change in bps
 *     - fcfGrowthPct: free cash flow YoY growth (if computable)
 *     - roicLevel: return on invested capital (if computable)
 *
 *   Quality (10%):
 *     - profitabilityScore: margin stability over 4 quarters
 *     - leverageRatio: total liabilities / equity
 *     - earningsConsistency: EPS predictability
 *
 * PIT: All facts queried with availableAt <= asOfTime. orderBy for determinism.
 */

import { PrismaClient } from '../../p4-engine/db/client';
import {
  EwFeature,
  FeatureProvider,
  FeatureCategory,
  FeatureAvailability,
  makeMissingFeature,
} from '../types.js';

const PROVIDER_VERSION = 'SEC-FUND-v1';

interface PitFact {
  securityId: string;
  fiscalYear: number;
  fiscalPeriod: string;
  periodEndDate: Date;
  availableAt: Date;
  sourceForm: string | null;
  revenue: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  totalLiabilities: number | null;
  stockholdersEquity: number | null;
  totalAssets: number | null;
  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  accessionNum: string | null;
}

export class SecFundamentalsProvider implements FeatureProvider {
  readonly categories: readonly FeatureCategory[] = Object.freeze(['FUNDAMENTALS', 'QUALITY']);
  readonly version = PROVIDER_VERSION;

  constructor(private prisma: PrismaClient) {}

  isAvailable(): boolean {
    return true;
  }

  describeStatus(): string {
    return `${PROVIDER_VERSION}: SEC PitFundamentalFact (available)`;
  }

  async computeFeatures(securityId: string, asOfTime: string): Promise<EwFeature[]> {
    const asOf = new Date(asOfTime);

    // Load PIT-correct facts: availableAt <= asOfTime, ordered deterministically
    const facts = await this.prisma.pitFundamentalFact.findMany({
      where: {
        securityId,
        availableAt: { lte: asOf },
        sourceForm: { in: ['10-K', '10-Q'] },
      },
      select: {
        fiscalYear: true,
        fiscalPeriod: true,
        periodEndDate: true,
        availableAt: true,
        sourceForm: true,
        revenue: true,
        operatingIncome: true,
        netIncome: true,
        totalLiabilities: true,
        stockholdersEquity: true,
        totalAssets: true,
        operatingCashFlow: true,
        capitalExpenditures: true,
        accessionNum: true,
      },
      orderBy: [{ fiscalYear: 'asc' }, { fiscalPeriod: 'asc' }, { availableAt: 'asc' }],
    });

    if (facts.length === 0) {
      return [
        makeMissingFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No SEC facts'),
        makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'No SEC facts'),
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No SEC facts'),
        makeMissingFeature('profitabilityScore', 'QUALITY', asOfTime, 'No SEC facts'),
        makeMissingFeature('leverageRatio', 'QUALITY', asOfTime, 'No SEC facts'),
      ];
    }

    // Build PIT-correct index: (fiscalYear, fiscalPeriod) → earliest availableAt fact
    const factIndex = new Map<string, PitFact>();
    for (const f of facts) {
      const key = `${f.fiscalYear}|${f.fiscalPeriod}`;
      const existing = factIndex.get(key);
      if (!existing || f.availableAt < existing.availableAt) {
        factIndex.set(key, {
          securityId,
          fiscalYear: f.fiscalYear,
          fiscalPeriod: f.fiscalPeriod,
          periodEndDate: f.periodEndDate,
          availableAt: f.availableAt,
          sourceForm: f.sourceForm,
          revenue: f.revenue,
          operatingIncome: f.operatingIncome,
          netIncome: f.netIncome,
          totalLiabilities: f.totalLiabilities,
          stockholdersEquity: f.stockholdersEquity,
          totalAssets: f.totalAssets,
          operatingCashFlow: f.operatingCashFlow,
          capitalExpenditures: f.capitalExpenditures,
          accessionNum: f.accessionNum,
        });
      }
    }

    // Get the latest available quarterly fact
    const quarterlyFacts = Array.from(factIndex.values())
      .filter(f => f.fiscalPeriod.startsWith('Q'))
      .sort((a, b) => b.periodEndDate.getTime() - a.periodEndDate.getTime());

    if (quarterlyFacts.length === 0) {
      return [
        makeMissingFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No quarterly facts'),
        makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'No quarterly facts'),
        makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No quarterly facts'),
        makeMissingFeature('profitabilityScore', 'QUALITY', asOfTime, 'No quarterly facts'),
        makeMissingFeature('leverageRatio', 'QUALITY', asOfTime, 'No quarterly facts'),
      ];
    }

    const latest = quarterlyFacts[0]!;
    const features: EwFeature[] = [];

    // ─── P7-validated features (10-Q only, Q1/Q2/Q3 only) ───
    // SDD-v1: legacy revenueAccelerationPct and marginExpansionBps are DEPRECATED.
    // They are no longer emitted by the provider. P7-validated features replace them.
    // Each P7 experiment had DIFFERENT filters. We build three separate
    // factIndexes, each matching the corresponding frozen P7 experiment
    // methodology exactly.
    //
    // P7.1 (Revenue): 10-Q, Q1/Q2/Q3, revenue >= $1M
    // P7.2 (Margin):   10-Q, Q1/Q2/Q3, revenue >= $1M, operatingIncome NOT NULL
    // P7.3 (FCF):      10-Q, Q1/Q2/Q3, OCF NOT NULL, CapEx NOT NULL
    //   (revenue floor only applied when revenue is non-null)

    const p7RevIndex = this.buildP7RevenueFactIndex(factIndex);
    const p7MarginIndex = this.buildP7MarginFactIndex(factIndex);
    const p7FcfIndex = this.buildP7FcfFactIndex(factIndex);

    const p7RevLatest = this.getLatestQuarterly(p7RevIndex);
    const p7MarginLatest = this.getLatestQuarterly(p7MarginIndex);
    const p7FcfLatest = this.getLatestQuarterly(p7FcfIndex);

    // ─── revenueYoYGrowthShock (P7.1 validated) ───
    if (p7RevLatest) {
      features.push(this.computeRevenueYoYGrowthShock(p7RevLatest, p7RevIndex, asOfTime));
    } else {
      features.push(makeMissingFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No P7.1-compliant 10-Q facts'));
    }

    // ─── operatingMarginYoYExpansion (P7.2 validated) ───
    if (p7MarginLatest) {
      features.push(this.computeOperatingMarginYoYExpansion(p7MarginLatest, p7MarginIndex, asOfTime));
    } else {
      features.push(makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'No P7.2-compliant 10-Q facts'));
    }

    // ─── fcfYoYGrowthShock (P7.3 validated) ───
    if (p7FcfLatest) {
      features.push(this.computeFcfYoYGrowthShock(p7FcfLatest, p7FcfIndex, asOfTime));
    } else {
      features.push(makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'No P7.3-compliant 10-Q facts'));
    }

    // ─── profitabilityScore (Quality) ───
    features.push(this.computeProfitabilityScore(quarterlyFacts, asOfTime));

    // ─── leverageRatio (Quality) ───
    features.push(this.computeLeverageRatio(latest, asOfTime));

    return features;
  }

  /**
   * Returns the latest quarterly fact (most recent periodEndDate) from a factIndex.
   */
  private getLatestQuarterly(factIndex: Map<string, PitFact>): PitFact | null {
    const quarterly = Array.from(factIndex.values())
      .filter(f => f.fiscalPeriod.startsWith('Q'))
      .sort((a, b) => b.periodEndDate.getTime() - a.periodEndDate.getTime());
    return quarterly[0] ?? null;
  }

  /**
   * P7.1 factIndex: 10-Q, Q1/Q2/Q3, revenue >= $1M (matches pit-event-experiment.ts)
   */
  private buildP7RevenueFactIndex(factIndex: Map<string, PitFact>): Map<string, PitFact> {
    const idx = new Map<string, PitFact>();
    for (const [key, f] of factIndex) {
      if (f.sourceForm !== '10-Q') continue;
      if (!['Q1', 'Q2', 'Q3'].includes(f.fiscalPeriod)) continue;
      if (f.revenue === null || f.revenue < 1_000_000) continue;
      idx.set(key, f);
    }
    return idx;
  }

  /**
   * P7.2 factIndex: 10-Q, Q1/Q2/Q3, revenue >= $1M, operatingIncome NOT NULL
   * (matches p72-margin-experiment.ts)
   */
  private buildP7MarginFactIndex(factIndex: Map<string, PitFact>): Map<string, PitFact> {
    const idx = new Map<string, PitFact>();
    for (const [key, f] of factIndex) {
      if (f.sourceForm !== '10-Q') continue;
      if (!['Q1', 'Q2', 'Q3'].includes(f.fiscalPeriod)) continue;
      if (f.revenue === null || f.revenue < 1_000_000) continue;
      if (f.operatingIncome === null) continue;
      idx.set(key, f);
    }
    return idx;
  }

  /**
   * P7.3 factIndex: 10-Q, Q1/Q2/Q3, OCF NOT NULL, CapEx NOT NULL
   * Revenue floor only applied when revenue is non-null.
   * (matches p73-fcf-experiment.ts)
   */
  private buildP7FcfFactIndex(factIndex: Map<string, PitFact>): Map<string, PitFact> {
    const idx = new Map<string, PitFact>();
    for (const [key, f] of factIndex) {
      if (f.sourceForm !== '10-Q') continue;
      if (!['Q1', 'Q2', 'Q3'].includes(f.fiscalPeriod)) continue;
      if (f.revenue !== null && f.revenue < 1_000_000) continue;
      if (f.operatingCashFlow === null || f.capitalExpenditures === null) continue;
      idx.set(key, f);
    }
    return idx;
  }

  private computeRevenueAcceleration(
    latest: PitFact,
    factIndex: Map<string, PitFact>,
    asOfTime: string
  ): EwFeature {
    // Current YoY = (rev_q - rev_q-4) / |rev_q-4|
    // Prior YoY = (rev_q-1 - rev_q-5) / |rev_q-5|
    // Acceleration = currentYoY - priorYoY

    const currentKey = `${latest.fiscalYear}|${latest.fiscalPeriod}`;
    const priorYearKey = `${latest.fiscalYear - 1}|${latest.fiscalPeriod}`;

    // Find prior quarter (Q-1)
    const priorQuarterPeriod = this.getPriorQuarter(latest.fiscalYear, latest.fiscalPeriod);
    if (!priorQuarterPeriod) {
      return makeMissingFeature('revenueAccelerationPct', 'FUNDAMENTALS', asOfTime, 'Cannot compute prior quarter');
    }
    const priorQKey = `${priorQuarterPeriod.year}|${priorQuarterPeriod.period}`;
    const priorQPriorYearKey = `${priorQuarterPeriod.year - 1}|${priorQuarterPeriod.period}`;

    const curRev = latest.revenue;
    const curRevPriorYr = factIndex.get(priorYearKey)?.revenue ?? null;
    const priorQRev = factIndex.get(priorQKey)?.revenue ?? null;
    const priorQRevPriorYr = factIndex.get(priorQPriorYearKey)?.revenue ?? null;

    if (curRev === null || curRevPriorYr === null || priorQRev === null || priorQRevPriorYr === null) {
      return makeMissingFeature('revenueAccelerationPct', 'FUNDAMENTALS', asOfTime, 'Insufficient revenue history');
    }
    if (curRevPriorYr === 0 || priorQRevPriorYr === 0) {
      return makeMissingFeature('revenueAccelerationPct', 'FUNDAMENTALS', asOfTime, 'Zero denominator', 'INVALID');
    }

    const curYoY = ((curRev - curRevPriorYr) / Math.abs(curRevPriorYr)) * 100;
    const priorYoY = ((priorQRev - priorQRevPriorYr) / Math.abs(priorQRevPriorYr)) * 100;
    const acceleration = curYoY - priorYoY;

    return Object.freeze({
      key: 'revenueAccelerationPct',
      category: 'FUNDAMENTALS',
      value: acceleration,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: 'currentYoY - priorYoY',
        inputs: Object.freeze({ curYoY, priorYoY, curRev, curRevPriorYr, priorQRev, priorQRevPriorYr }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: null,
        notes: null,
      }),
    });
  }

  private computeMarginExpansion(
    latest: PitFact,
    factIndex: Map<string, PitFact>,
    asOfTime: string
  ): EwFeature {
    const priorYearKey = `${latest.fiscalYear - 1}|${latest.fiscalPeriod}`;

    const curRev = latest.revenue;
    const curOp = latest.operatingIncome;
    const priorRev = factIndex.get(priorYearKey)?.revenue ?? null;
    const priorOp = factIndex.get(priorYearKey)?.operatingIncome ?? null;

    if (curRev === null || curOp === null || priorRev === null || priorOp === null) {
      return makeMissingFeature('marginExpansionBps', 'FUNDAMENTALS', asOfTime, 'Insufficient margin history');
    }
    if (curRev <= 0 || priorRev <= 0) {
      return makeMissingFeature('marginExpansionBps', 'FUNDAMENTALS', asOfTime, 'Non-positive revenue', 'INVALID');
    }

    const curMargin = curOp / curRev;
    const priorMargin = priorOp / priorRev;
    const bps = (curMargin - priorMargin) * 10000;

    return Object.freeze({
      key: 'marginExpansionBps',
      category: 'FUNDAMENTALS',
      value: bps,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: '((curOp/curRev) - (priorOp/priorRev)) * 10000',
        inputs: Object.freeze({ curMargin, priorMargin, curOp, curRev, priorOp, priorRev }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: null,
        notes: null,
      }),
    });
  }

  // ─── P7.1-validated: Revenue YoY Growth Shock ───────────────────────────
  // Formula: (revenue_q - revenue_{q-4}) / abs(revenue_{q-4})
  // 10-Q only, Q1/Q2/Q3, revenue >= $1M floor
  private computeRevenueYoYGrowthShock(
    latest: PitFact,
    factIndex: Map<string, PitFact>,
    asOfTime: string
  ): EwFeature {
    const priorYearKey = `${latest.fiscalYear - 1}|${latest.fiscalPeriod}`;

    const curRev = latest.revenue;
    const priorRev = factIndex.get(priorYearKey)?.revenue ?? null;

    if (curRev === null || priorRev === null) {
      return makeMissingFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'Insufficient revenue history');
    }
    if (curRev < 1_000_000 || priorRev < 1_000_000) {
      return makeMissingFeature('revenueYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'Revenue below $1M floor', 'INVALID');
    }

    const growth = (curRev - priorRev) / Math.abs(priorRev);

    return Object.freeze({
      key: 'revenueYoYGrowthShock',
      category: 'FUNDAMENTALS',
      value: growth,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: '(revenue_q - revenue_{q-4}) / abs(revenue_{q-4})',
        inputs: Object.freeze({ curRev, priorRev }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: null,
        notes: 'P7.1 validated (PASS-frozen, commit ed78aa4)',
      }),
    });
  }

  // ─── P7.2-validated: Operating Margin YoY Expansion ─────────────────────
  // Formula: (opInc_q/revenue_q) - (opInc_{q-4}/revenue_{q-4})
  // 10-Q only, Q1/Q2/Q3, revenue > 0, operatingIncome NOT NULL
  private computeOperatingMarginYoYExpansion(
    latest: PitFact,
    factIndex: Map<string, PitFact>,
    asOfTime: string
  ): EwFeature {
    const priorYearKey = `${latest.fiscalYear - 1}|${latest.fiscalPeriod}`;

    const curRev = latest.revenue;
    const curOp = latest.operatingIncome;
    const priorRev = factIndex.get(priorYearKey)?.revenue ?? null;
    const priorOp = factIndex.get(priorYearKey)?.operatingIncome ?? null;

    if (curRev === null || curOp === null || priorRev === null || priorOp === null) {
      return makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'Insufficient margin history');
    }
    if (curRev <= 0 || priorRev <= 0) {
      return makeMissingFeature('operatingMarginYoYExpansion', 'FUNDAMENTALS', asOfTime, 'Non-positive revenue', 'INVALID');
    }

    const curMargin = curOp / curRev;
    const priorMargin = priorOp / priorRev;
    const expansion = curMargin - priorMargin;

    return Object.freeze({
      key: 'operatingMarginYoYExpansion',
      category: 'FUNDAMENTALS',
      value: expansion,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: '(operatingIncome_q / revenue_q) - (operatingIncome_{q-4} / revenue_{q-4})',
        inputs: Object.freeze({ curMargin, priorMargin, curOp, curRev, priorOp, priorRev }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: null,
        notes: 'P7.2 validated (PASS-frozen, commit 962f9bc)',
      }),
    });
  }

  // ─── P7.3-validated: FCF YoY Growth Shock ───────────────────────────────
  // Formula: (FCF_q - FCF_{q-4}) / abs(FCF_{q-4}) where FCF = OCF - CapEx
  // 10-Q only, Q1/Q2/Q3, abs(FCF_{q-4}) >= $1M
  // Sign-change events INCLUDED. Negative CapEx INCLUDED.
  private computeFcfYoYGrowthShock(
    latest: PitFact,
    factIndex: Map<string, PitFact>,
    asOfTime: string
  ): EwFeature {
    const priorYearKey = `${latest.fiscalYear - 1}|${latest.fiscalPeriod}`;

    const curOcf = latest.operatingCashFlow;
    const curCapex = latest.capitalExpenditures;
    const priorOcf = factIndex.get(priorYearKey)?.operatingCashFlow ?? null;
    const priorCapex = factIndex.get(priorYearKey)?.capitalExpenditures ?? null;

    if (curOcf === null || curCapex === null || priorOcf === null || priorCapex === null) {
      return makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'Insufficient FCF history');
    }

    const curFcf = curOcf - curCapex;
    const priorFcf = priorOcf - priorCapex;

    if (Math.abs(priorFcf) < 1_000_000) {
      return makeMissingFeature('fcfYoYGrowthShock', 'FUNDAMENTALS', asOfTime, 'FCF denominator below $1M floor', 'INVALID');
    }

    const growth = (curFcf - priorFcf) / Math.abs(priorFcf);

    return Object.freeze({
      key: 'fcfYoYGrowthShock',
      category: 'FUNDAMENTALS',
      value: growth,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: '(FCF_q - FCF_{q-4}) / abs(FCF_{q-4}) where FCF = operatingCashFlow - capitalExpenditures',
        inputs: Object.freeze({ curFcf, priorFcf, curOcf, curCapex, priorOcf, priorCapex }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: null,
        notes: 'P7.3 validated (PASS-frozen, commit 87b6e23). Sign-change events included.',
      }),
    });
  }

  private computeProfitabilityScore(
    quarterlyFacts: PitFact[],
    asOfTime: string
  ): EwFeature {
    // Margin stability: std dev of operating margin over last 4 quarters
    const last4 = quarterlyFacts.slice(0, 4);
    const margins: number[] = [];

    for (const f of last4) {
      if (f.revenue !== null && f.revenue > 0 && f.operatingIncome !== null) {
        margins.push(f.operatingIncome / f.revenue);
      }
    }

    if (margins.length < 4) {
      return makeMissingFeature('profitabilityScore', 'QUALITY', asOfTime, 'Insufficient quarters for stability');
    }

    const meanMargin = margins.reduce((s, m) => s + m, 0) / margins.length;
    const variance = margins.reduce((s, m) => s + (m - meanMargin) ** 2, 0) / margins.length;
    const stdDev = Math.sqrt(variance);

    // Convert to 0-100 score: lower std dev = higher score
    // stdDev of 0 → 100, stdDev of 0.10 (10% margin swing) → 0
    const score = Math.max(0, Math.min(100, 100 * (1 - stdDev / 0.10)));

    const latest = last4[0]!;

    return Object.freeze({
      key: 'profitabilityScore',
      category: 'QUALITY',
      value: score,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: margins.length / 4,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: '100 * (1 - stdDev(margin_4q) / 0.10)',
        inputs: Object.freeze({ meanMargin, stdDev, quarterCount: margins.length }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: last4[last4.length - 1]!.periodEndDate.toISOString(),
        notes: 'Margin stability over 4 quarters',
      }),
    });
  }

  private computeLeverageRatio(latest: PitFact, asOfTime: string): EwFeature {
    const liab = latest.totalLiabilities;
    const equity = latest.stockholdersEquity;

    if (liab === null || equity === null) {
      return makeMissingFeature('leverageRatio', 'QUALITY', asOfTime, 'Missing liabilities or equity');
    }
    if (equity <= 0) {
      return makeMissingFeature('leverageRatio', 'QUALITY', asOfTime, 'Non-positive equity', 'INVALID');
    }

    const ratio = liab / equity;

    return Object.freeze({
      key: 'leverageRatio',
      category: 'QUALITY',
      value: ratio,
      knownAt: latest.availableAt.toISOString(),
      availableAt: latest.availableAt.toISOString(),
      source: 'SEC',
      accession: latest.accessionNum,
      confidence: 1.0,
      pitValid: true,
      availability: 'AVAILABLE',
      evidence: Object.freeze({
        formula: 'totalLiabilities / stockholdersEquity',
        inputs: Object.freeze({ totalLiabilities: liab, stockholdersEquity: equity }),
        periodEnd: latest.periodEndDate.toISOString(),
        periodStart: null,
        notes: null,
      }),
    });
  }

  private getPriorQuarter(year: number, period: string): { year: number; period: string } | null {
    const qMatch = period.match(/^Q(\d)$/);
    if (!qMatch) return null;
    const q = parseInt(qMatch[1]!);
    if (q === 1) return { year: year - 1, period: 'Q4' };
    return { year, period: `Q${q - 1}` };
  }
}
