/**
 * PMP Quantitative PIT Concept Registry
 * =====================================
 * 
 * Central deterministic dictionary for extracting US-GAAP XBRL concepts.
 * 
 * Rules:
 * 1. STRICT EQUALITY: Never use .includes() or substring regex matching on concepts.
 * 2. SEPARATION OF CONCERNS:
 *    - Consolidated Net Income != Net Income to Common Stockholders != Noncontrolling Interest
 *    - Total Assets must strictly be 'Assets'. Subcategories (OtherAssetsNoncurrent, AssetsCurrent) are forbidden.
 * 3. TAXONOMY SPECIFICITY:
 *    - Banks/Financials report interest & dividend operating income.
 *    - Non-financials report contract revenue or sales revenue net.
 */

export type MetricType = 'flow' | 'instant';
export type UnitType = 'USD' | 'shares' | 'USD/shares';

export interface ConceptDefinition {
  metric: string;
  type: MetricType;
  unit: UnitType;
  /** Primary preferred XBRL concepts in order of priority */
  preferredConcepts: string[];
  /** Secondary allowed fallback concepts (strictly verified) */
  allowedFallbackConcepts: string[];
  /** Industry / taxonomy tags where this applies */
  industry?: 'ALL' | 'BANKING' | 'NON_BANKING';
  /** Explicit description of the accounting fact */
  description: string;
}

export const CONCEPT_REGISTRY: Record<string, ConceptDefinition> = {
  // ─── Balance Sheet (Instant) ────────────────────────────────────────────────
  TotalAssets: {
    metric: 'TotalAssets',
    type: 'instant',
    unit: 'USD',
    preferredConcepts: ['Assets'],
    allowedFallbackConcepts: [], // STRICT: No sub-accounts allowed!
    industry: 'ALL',
    description: 'Total Assets of the entity (strictly Assets, no subcategories).',
  },

  TotalLiabilities: {
    metric: 'TotalLiabilities',
    type: 'instant',
    unit: 'USD',
    preferredConcepts: ['Liabilities'],
    allowedFallbackConcepts: ['LiabilitiesAndStockholdersEquity'],
    industry: 'ALL',
    description: 'Total liabilities of the reporting entity.',
  },

  CurrentAssets: {
    metric: 'CurrentAssets',
    type: 'instant',
    unit: 'USD',
    preferredConcepts: ['AssetsCurrent'],
    allowedFallbackConcepts: [],
    industry: 'NON_BANKING',
    description: 'Current assets (classified balance sheet).',
  },

  CurrentLiabilities: {
    metric: 'CurrentLiabilities',
    type: 'instant',
    unit: 'USD',
    preferredConcepts: ['LiabilitiesCurrent'],
    allowedFallbackConcepts: [],
    industry: 'NON_BANKING',
    description: 'Current liabilities (classified balance sheet).',
  },

  StockholdersEquity: {
    metric: 'StockholdersEquity',
    type: 'instant',
    unit: 'USD',
    preferredConcepts: [
      'StockholdersEquity',
      'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    ],
    allowedFallbackConcepts: ['CommonStockholdersEquity'],
    industry: 'ALL',
    description: 'Total equity attributable to parent or combined stockholders.',
  },

  CashAndEquivalents: {
    metric: 'CashAndEquivalents',
    type: 'instant',
    unit: 'USD',
    preferredConcepts: [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ],
    allowedFallbackConcepts: ['Cash'],
    industry: 'ALL',
    description: 'Cash, cash equivalents, and restricted cash balances.',
  },

  // ─── Income Statement (Flow) ────────────────────────────────────────────────
  Revenue: {
    metric: 'Revenue',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: [
      // Standard commercial / tech concepts
      'RevenueFromContractWithCustomerExcludingAssessedTax',
      'SalesRevenueNet',
      'Revenues',
      'TotalRevenuesAndOtherIncome',
      // Banking / Financial institutions concepts
      'InterestAndDividendIncomeOperating',
      'InterestIncomeExpenseNet',
    ],
    allowedFallbackConcepts: [
      'RevenueFromContractWithCustomerIncludingAssessedTax',
      'RegulatedOperatingRevenue',
    ],
    industry: 'ALL',
    description: 'Total revenue or operating interest income for financial filers.',
  },

  NetIncomeCommon: {
    metric: 'NetIncomeCommon',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: [
      'NetIncomeLossAvailableToCommonStockholdersBasic',
    ],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Net income available exclusively to common stockholders after preferred dividends.',
  },

  NetIncomeConsolidated: {
    metric: 'NetIncomeConsolidated',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: [
      'ProfitLoss',
      'NetIncomeLoss',
    ],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Consolidated profit/loss before noncontrolling interest distribution.',
  },

  NetIncomeNoncontrollingInterest: {
    metric: 'NetIncomeNoncontrollingInterest',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: [
      'NetIncomeLossAttributableToNoncontrollingInterest',
    ],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Net income or loss attributable to noncontrolling interests in subsidiaries.',
  },

  OperatingIncome: {
    metric: 'OperatingIncome',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: ['OperatingIncomeLoss'],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Operating income (EBIT) before interest and taxes.',
  },

  GrossProfit: {
    metric: 'GrossProfit',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: ['GrossProfit'],
    allowedFallbackConcepts: [],
    industry: 'NON_BANKING',
    description: 'Gross profit (revenue minus cost of goods sold).',
  },

  // ─── Cash Flows (Flow) ──────────────────────────────────────────────────────
  OperatingCashFlow: {
    metric: 'OperatingCashFlow',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: ['NetCashProvidedByUsedInOperatingActivities'],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Net cash provided by (used in) operating activities.',
  },

  CapitalExpenditures: {
    metric: 'CapitalExpenditures',
    type: 'flow',
    unit: 'USD',
    preferredConcepts: [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'PaymentsToAcquireProductiveAssets',
    ],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Cash outflow for property, plant, and equipment additions.',
  },

  // ─── Per-Share & Share Count ────────────────────────────────────────────────
  EPSDiluted: {
    metric: 'EPSDiluted',
    type: 'flow',
    unit: 'USD/shares',
    preferredConcepts: ['EarningsPerShareDiluted'],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Diluted earnings per common share.',
  },

  EPSBasic: {
    metric: 'EPSBasic',
    type: 'flow',
    unit: 'USD/shares',
    preferredConcepts: ['EarningsPerShareBasic'],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Basic earnings per common share.',
  },

  DilutedShares: {
    metric: 'DilutedShares',
    type: 'flow',
    unit: 'shares',
    preferredConcepts: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Weighted average diluted shares outstanding during the period.',
  },

  BasicShares: {
    metric: 'BasicShares',
    type: 'instant',
    unit: 'shares',
    preferredConcepts: [
      'CommonStockSharesOutstanding',
      'WeightedAverageNumberOfSharesOutstandingBasic',
    ],
    allowedFallbackConcepts: [],
    industry: 'ALL',
    description: 'Basic common shares outstanding at report date.',
  },
};

/**
 * Deterministic concept extractor.
 * Strictly checks item.concept === conceptName with exact string matching.
 * Never performs substring .includes() checks.
 */
export function extractExactMetric(
  items: Array<{ concept?: string; value?: any; label?: string }>,
  metricKey: keyof typeof CONCEPT_REGISTRY
): { value: number | null; matchedConcept: string | null } {
  const def = CONCEPT_REGISTRY[metricKey];
  if (!def) return { value: null, matchedConcept: null };

  const targetConcepts = [...def.preferredConcepts, ...def.allowedFallbackConcepts];

  for (const conceptName of targetConcepts) {
    const found = items.find((item) => {
      if (!item.concept || typeof item.value !== 'number' || isNaN(item.value)) return false;
      // Strip namespace prefix e.g. "us-gaap_", "dei_", "srt_"
      const cleanConcept = item.concept.replace(/^[a-z0-9\-_]+_/i, '');
      return cleanConcept === conceptName || item.concept === conceptName;
    });

    if (found) {
      return { value: found.value, matchedConcept: conceptName };
    }
  }

  return { value: null, matchedConcept: null };
}

/**
 * Resolves the primary Net Income to report for a company.
 * Prioritizes NetIncomeCommon if present; otherwise uses NetIncomeConsolidated.
 * Explicitly records which concept was selected.
 */
export function resolveNetIncome(items: Array<{ concept?: string; value?: any }>): {
  value: number | null;
  conceptUsed: string | null;
  isCommonStockholders: boolean;
  noncontrollingDeducted: boolean;
} {
  const common = extractExactMetric(items, 'NetIncomeCommon');
  if (common.value !== null) {
    return {
      value: common.value,
      conceptUsed: common.matchedConcept,
      isCommonStockholders: true,
      noncontrollingDeducted: true,
    };
  }

  const consolidated = extractExactMetric(items, 'NetIncomeConsolidated');
  return {
    value: consolidated.value,
    conceptUsed: consolidated.matchedConcept,
    isCommonStockholders: false,
    noncontrollingDeducted: false,
  };
}
