import { XbrlPeriodType } from './SecXbrlContextClassifier';

export type CanonicalConcept =
    // Income Statement (Duration)
    | 'REVENUE'
    | 'COST_OF_REVENUE'
    | 'GROSS_PROFIT'
    | 'OPERATING_EXPENSES'
    | 'OPERATING_INCOME'
    | 'NET_INCOME'
    | 'EPS_DILUTED'
    | 'EPS_BASIC'
    | 'SHARES_DILUTED'
    | 'SHARES_BASIC'

    // Balance Sheet (Instant)
    | 'ASSETS'
    | 'ASSETS_CURRENT'
    | 'LIABILITIES'
    | 'LIABILITIES_CURRENT'
    | 'CASH_AND_EQUIVALENTS'
    | 'TOTAL_DEBT'
    | 'STOCKHOLDERS_EQUITY'

    // Cash Flow (Duration)
    | 'OPERATING_CASH_FLOW'
    | 'CAPITAL_EXPENDITURES'
    | 'FREE_CASH_FLOW_REPORTED';

export type TaxonomyNamespace = 'us-gaap' | 'dei' | 'ifrs-full';

export type FinancialStatement = 
    | 'INCOME_STATEMENT' 
    | 'BALANCE_SHEET' 
    | 'CASH_FLOW' 
    | 'DOCUMENT_ENTITY_INFO';

export type AccountingPolarity = 'DEBIT' | 'CREDIT' | 'NEUTRAL';

export type UnitFamily = 'CURRENCY' | 'SHARES' | 'PER_SHARE' | 'PURE';

export type ExpectedPeriodType = 'INSTANT' | 'DURATION';

export type ConceptMappingType = 
    | 'EXACT'              // Authoritative 1:1 GAAP standard tag
    | 'DERIVED_EQUIVALENT' // Legitimate accounting equivalent under specific provisions
    | 'ALIAS'              // Direct legacy or taxonomy rename
    | 'FALLBACK'           // Narrower or broader fallback tag used only when primary is absent
    | 'UNSUPPORTED'        // Known tag explicitly barred from substitution
    | 'CONFLICT';

export type MappingConfidence = 'DEFINITIVE' | 'STRONG' | 'INCONCLUSIVE';

export interface ConceptMappingEntry {
    canonicalConcept: CanonicalConcept;
    sourceTaxonomy: TaxonomyNamespace;
    sourceConcept: string;
    statement: FinancialStatement;
    polarity: AccountingPolarity;
    unitFamily: UnitFamily;
    expectedPeriodType: ExpectedPeriodType;
    mappingType: ConceptMappingType;
    confidence: MappingConfidence;
    priorityRank: number; // 1 = Highest priority (preferred primary tag)
    description: string;
    validFromYear?: number;
    validToYear?: number;
}

export interface FactCandidate {
    taxonomy: string;
    concept: string;
    value: number;
    unit: string;
    contextClassification: XbrlPeriodType;
    start?: string | null;
    end: string;
    accn?: string | null;
}

export interface ConceptResolutionResult {
    canonicalConcept: CanonicalConcept;
    resolvedFact: FactCandidate;
    mapping: ConceptMappingEntry;
    priorityRank: number;
    auditTrail: {
        totalCandidates: number;
        evaluatedCandidates: Array<{
            concept: string;
            rank: number;
            status: 'ACCEPTED' | 'SUPERSEDED_BY_HIGHER_RANK' | 'REJECTED_PERIOD_MISMATCH' | 'UNSUPPORTED';
            reason: string;
        }>;
    };
}

export class SecConceptDictionary {
    private static readonly MAPPINGS: Map<string, ConceptMappingEntry> = new Map();

    private static register(entry: ConceptMappingEntry) {
        const key = `${entry.sourceTaxonomy}:${entry.sourceConcept}`;
        this.MAPPINGS.set(key, entry);
    }

    static {
        // =====================================================================
        // REVENUE (Income Statement - Duration)
        // =====================================================================
        // Rank 1: Primary ASC 606 Standard (2018+)
        this.register({
            canonicalConcept: 'REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'RevenueFromContractWithCustomerExcludingAssessedTax',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Authoritative GAAP revenue from contracts with customers, excluding sales taxes (ASC 606).'
        });
        // Rank 2: Legacy Sales Revenue
        this.register({
            canonicalConcept: 'REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'SalesRevenueNet',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'ALIAS',
            confidence: 'STRONG',
            priorityRank: 2,
            description: 'Net sales revenue after discounts, returns, and allowances (Legacy pre-ASC 606 or goods).'
        });
        // Rank 3: General Revenues
        this.register({
            canonicalConcept: 'REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'Revenues',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'ALIAS',
            confidence: 'STRONG',
            priorityRank: 3,
            description: 'General consolidated operating revenues.'
        });
        // Rank 4 & 5: Disaggregated Goods & Services
        this.register({
            canonicalConcept: 'REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'SalesRevenueGoodsNet',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'FALLBACK',
            confidence: 'STRONG',
            priorityRank: 4,
            description: 'Disaggregated net revenue from goods only.'
        });
        this.register({
            canonicalConcept: 'REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'SalesRevenueServicesNet',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'FALLBACK',
            confidence: 'STRONG',
            priorityRank: 5,
            description: 'Disaggregated net revenue from services only.'
        });
        // UNSUPPORTED for Net Revenue: Tax-Inclusive Revenue
        this.register({
            canonicalConcept: 'REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'RevenueFromContractWithCustomerIncludingAssessedTax',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'UNSUPPORTED',
            confidence: 'INCONCLUSIVE',
            priorityRank: 999,
            description: 'Gross revenue including sales/excise taxes collected. Strictly non-substitutable for net revenue.'
        });

        // =====================================================================
        // COST OF REVENUE & GROSS PROFIT (Duration)
        // =====================================================================
        this.register({
            canonicalConcept: 'COST_OF_REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'CostOfRevenue',
            statement: 'INCOME_STATEMENT',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Consolidated cost of revenue or cost of goods sold.'
        });
        this.register({
            canonicalConcept: 'COST_OF_REVENUE',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'CostOfGoodsAndServicesSold',
            statement: 'INCOME_STATEMENT',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'ALIAS',
            confidence: 'STRONG',
            priorityRank: 2,
            description: 'Direct cost of goods and services sold.'
        });
        this.register({
            canonicalConcept: 'GROSS_PROFIT',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'GrossProfit',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Revenue minus cost of goods sold.'
        });

        // =====================================================================
        // OPERATING INCOME & EXPENSES (Duration)
        // =====================================================================
        this.register({
            canonicalConcept: 'OPERATING_INCOME',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'OperatingIncomeLoss',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Operating income (loss) before non-operating items, interest, and taxes.'
        });
        this.register({
            canonicalConcept: 'OPERATING_EXPENSES',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'OperatingExpenses',
            statement: 'INCOME_STATEMENT',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Total operating expenses.'
        });

        // =====================================================================
        // NET INCOME (Duration)
        // =====================================================================
        this.register({
            canonicalConcept: 'NET_INCOME',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'NetIncomeLoss',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Consolidated net income (loss) attributable to the parent entity.'
        });
        this.register({
            canonicalConcept: 'NET_INCOME',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'ProfitLoss',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'DERIVED_EQUIVALENT',
            confidence: 'STRONG',
            priorityRank: 2,
            description: 'Consolidated profit (loss) before allocation between parent and non-controlling interest.'
        });
        this.register({
            canonicalConcept: 'NET_INCOME',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'NetIncomeLossAvailableToCommonStockholdersBasic',
            statement: 'INCOME_STATEMENT',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'FALLBACK',
            confidence: 'STRONG',
            priorityRank: 3,
            description: 'Net income available to common stockholders after preferred dividends.'
        });

        // =====================================================================
        // EPS & SHARES (Duration / Instant)
        // =====================================================================
        this.register({
            canonicalConcept: 'EPS_DILUTED',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'EarningsPerShareDiluted',
            statement: 'INCOME_STATEMENT',
            polarity: 'NEUTRAL',
            unitFamily: 'PER_SHARE',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Diluted earnings per share.'
        });
        this.register({
            canonicalConcept: 'EPS_BASIC',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'EarningsPerShareBasic',
            statement: 'INCOME_STATEMENT',
            polarity: 'NEUTRAL',
            unitFamily: 'PER_SHARE',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Basic earnings per share.'
        });
        this.register({
            canonicalConcept: 'SHARES_DILUTED',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'WeightedAverageNumberOfDilutedSharesOutstanding',
            statement: 'INCOME_STATEMENT',
            polarity: 'NEUTRAL',
            unitFamily: 'SHARES',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Weighted-average diluted common shares outstanding during the period.'
        });
        this.register({
            canonicalConcept: 'SHARES_BASIC',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'WeightedAverageNumberOfSharesOutstandingBasic',
            statement: 'INCOME_STATEMENT',
            polarity: 'NEUTRAL',
            unitFamily: 'SHARES',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Weighted-average basic common shares outstanding during the period.'
        });
        this.register({
            canonicalConcept: 'SHARES_BASIC',
            sourceTaxonomy: 'dei',
            sourceConcept: 'EntityCommonStockSharesOutstanding',
            statement: 'DOCUMENT_ENTITY_INFO',
            polarity: 'NEUTRAL',
            unitFamily: 'SHARES',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 2,
            description: 'Entity common stock shares outstanding as of document date.'
        });

        // =====================================================================
        // BALANCE SHEET ASSETS & LIABILITIES (Instant)
        // =====================================================================
        this.register({
            canonicalConcept: 'ASSETS',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'Assets',
            statement: 'BALANCE_SHEET',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Total assets at carrying value.'
        });
        this.register({
            canonicalConcept: 'ASSETS_CURRENT',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'AssetsCurrent',
            statement: 'BALANCE_SHEET',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Total current assets.'
        });
        this.register({
            canonicalConcept: 'LIABILITIES',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'Liabilities',
            statement: 'BALANCE_SHEET',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Total liabilities.'
        });
        this.register({
            canonicalConcept: 'LIABILITIES_CURRENT',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'LiabilitiesCurrent',
            statement: 'BALANCE_SHEET',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Total current liabilities.'
        });
        this.register({
            canonicalConcept: 'CASH_AND_EQUIVALENTS',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'CashAndCashEquivalentsAtCarryingValue',
            statement: 'BALANCE_SHEET',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Cash and cash equivalents at carrying value.'
        });
        this.register({
            canonicalConcept: 'CASH_AND_EQUIVALENTS',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
            statement: 'BALANCE_SHEET',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'FALLBACK',
            confidence: 'STRONG',
            priorityRank: 2,
            description: 'Cash, cash equivalents, and restricted cash combined.'
        });
        this.register({
            canonicalConcept: 'STOCKHOLDERS_EQUITY',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'StockholdersEquity',
            statement: 'BALANCE_SHEET',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Total stockholders equity attributable to parent.'
        });
        this.register({
            canonicalConcept: 'STOCKHOLDERS_EQUITY',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
            statement: 'BALANCE_SHEET',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'INSTANT',
            mappingType: 'FALLBACK',
            confidence: 'STRONG',
            priorityRank: 2,
            description: 'Total equity including non-controlling minority interest.'
        });

        // =====================================================================
        // CASH FLOW (Duration)
        // =====================================================================
        this.register({
            canonicalConcept: 'OPERATING_CASH_FLOW',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'NetCashProvidedByUsedInOperatingActivities',
            statement: 'CASH_FLOW',
            polarity: 'DEBIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Net cash provided by (used in) operating activities.'
        });
        this.register({
            canonicalConcept: 'CAPITAL_EXPENDITURES',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'PaymentsToAcquirePropertyPlantAndEquipment',
            statement: 'CASH_FLOW',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'EXACT',
            confidence: 'DEFINITIVE',
            priorityRank: 1,
            description: 'Capital expenditures: cash outflows for property, plant, and equipment.'
        });
        this.register({
            canonicalConcept: 'CAPITAL_EXPENDITURES',
            sourceTaxonomy: 'us-gaap',
            sourceConcept: 'PaymentsToAcquireProductiveAssets',
            statement: 'CASH_FLOW',
            polarity: 'CREDIT',
            unitFamily: 'CURRENCY',
            expectedPeriodType: 'DURATION',
            mappingType: 'ALIAS',
            confidence: 'STRONG',
            priorityRank: 2,
            description: 'Alternative cash outflows for productive assets.'
        });
    }

    /**
     * Looks up an uncurated SEC concept tag in the dictionary.
     */
    public static lookup(taxonomy: string, concept: string): ConceptMappingEntry | null {
        const cleanTaxonomy = taxonomy.toLowerCase().trim();
        const cleanConcept = concept.trim();
        const key = `${cleanTaxonomy}:${cleanConcept}`;
        return this.MAPPINGS.get(key) ?? null;
    }

    /**
     * Validates whether a context's periodType matches the accounting concept expectation.
     */
    public static validatePeriodType(
        mapping: ConceptMappingEntry, 
        contextClassification: XbrlPeriodType
    ): { valid: boolean; reason?: string } {
        if (contextClassification === 'UNKNOWN') {
            return { valid: false, reason: "Context classification is UNKNOWN; cannot bind accounting concept." };
        }

        if (mapping.expectedPeriodType === 'INSTANT') {
            if (contextClassification !== 'INSTANT') {
                return {
                    valid: false,
                    reason: `PeriodType mismatch: concept '${mapping.sourceConcept}' expects INSTANT snapshot, but context was classified as '${contextClassification}'.`
                };
            }
            return { valid: true };
        }

        if (mapping.expectedPeriodType === 'DURATION') {
            if (contextClassification === 'INSTANT') {
                return {
                    valid: false,
                    reason: `PeriodType mismatch: concept '${mapping.sourceConcept}' expects DURATION flow (QUARTER/YTD/FY), but context was classified as 'INSTANT'.`
                };
            }
            return { valid: true };
        }

        return { valid: false, reason: "Unrecognized expectedPeriodType in mapping entry." };
    }

    /**
     * Deterministically resolves the single preferred canonical fact from a list of candidate facts.
     * Enforces:
     * 1. Exact canonical concept match
     * 2. Strict periodType alignment
     * 3. Rejection of UNSUPPORTED tags
     * 4. Priority ranking (Rank 1 wins over Rank 2/3)
     * 5. Full audit trail of rejected or superseded candidates
     */
    public static resolvePreferredFact(
        candidates: FactCandidate[],
        targetCanonical: CanonicalConcept
    ): ConceptResolutionResult | null {
        if (!candidates || candidates.length === 0) return null;

        const evaluatedCandidates: ConceptResolutionResult['auditTrail']['evaluatedCandidates'] = [];
        const validCandidates: Array<{ candidate: FactCandidate; mapping: ConceptMappingEntry }> = [];

        for (const cand of candidates) {
            const mapping = this.lookup(cand.taxonomy, cand.concept);

            if (!mapping) {
                evaluatedCandidates.push({
                    concept: cand.concept,
                    rank: 9999,
                    status: 'UNSUPPORTED',
                    reason: `Unregistered concept tag '${cand.taxonomy}:${cand.concept}'.`
                });
                continue;
            }

            if (mapping.canonicalConcept !== targetCanonical) {
                evaluatedCandidates.push({
                    concept: cand.concept,
                    rank: mapping.priorityRank,
                    status: 'UNSUPPORTED',
                    reason: `Concept maps to '${mapping.canonicalConcept}', not requested target '${targetCanonical}'.`
                });
                continue;
            }

            if (mapping.mappingType === 'UNSUPPORTED') {
                evaluatedCandidates.push({
                    concept: cand.concept,
                    rank: mapping.priorityRank,
                    status: 'UNSUPPORTED',
                    reason: `Concept is explicitly marked UNSUPPORTED for '${targetCanonical}': ${mapping.description}`
                });
                continue;
            }

            // PeriodType validation guard
            const periodValidation = this.validatePeriodType(mapping, cand.contextClassification);
            if (!periodValidation.valid) {
                evaluatedCandidates.push({
                    concept: cand.concept,
                    rank: mapping.priorityRank,
                    status: 'REJECTED_PERIOD_MISMATCH',
                    reason: periodValidation.reason!
                });
                continue;
            }

            validCandidates.push({ candidate: cand, mapping });
        }

        if (validCandidates.length === 0) return null;

        // Deterministic sort by priorityRank ASC, then concept name ASC
        validCandidates.sort((a, b) => {
            const rankDiff = a.mapping.priorityRank - b.mapping.priorityRank;
            if (rankDiff !== 0) return rankDiff;
            return a.candidate.concept.localeCompare(b.candidate.concept);
        });

        const winner = validCandidates[0];

        // Audit the superseded candidates
        for (let i = 1; i < validCandidates.length; i++) {
            const item = validCandidates[i];
            evaluatedCandidates.push({
                concept: item.candidate.concept,
                rank: item.mapping.priorityRank,
                status: 'SUPERSEDED_BY_HIGHER_RANK',
                reason: `Superseded by preferred Rank ${winner.mapping.priorityRank} concept '${winner.candidate.concept}'.`
            });
        }

        evaluatedCandidates.push({
            concept: winner.candidate.concept,
            rank: winner.mapping.priorityRank,
            status: 'ACCEPTED',
            reason: `Selected as highest-priority canonical representation (Rank ${winner.mapping.priorityRank}, ${winner.mapping.mappingType}).`
        });

        return {
            canonicalConcept: targetCanonical,
            resolvedFact: winner.candidate,
            mapping: winner.mapping,
            priorityRank: winner.mapping.priorityRank,
            auditTrail: {
                totalCandidates: candidates.length,
                evaluatedCandidates
            }
        };
    }
}
