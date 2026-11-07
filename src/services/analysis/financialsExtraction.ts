/**
 * Finnhub XBRL extraction module.
 * Extracts and normalizes financial statement metrics from Finnhub report objects.
 */

export const isValidValue = (v: any): boolean =>
    v !== undefined && v !== null && v !== 'N/A' && v !== '' && !Number.isNaN(v);

export function extract(report: any, section: string, concepts: string[]): number | null {
    if (!report || typeof report !== 'object') return null;
    const list = report[section] || [];
    if (!Array.isArray(list)) return null;

    for (const concept of concepts) {
        const found = list.find((item: any) => item && item.concept === concept);
        if (found && isValidValue(found.value)) return Number(found.value);
        const shortConcept = concept.replace(/^(us-gaap_|dei_)/, '');
        const foundShort = list.find((item: any) => item && item.concept === shortConcept);
        if (foundShort && isValidValue(foundShort.value)) return Number(foundShort.value);
        const foundGaap = list.find((item: any) => item && item.concept === `us-gaap_${shortConcept}`);
        if (foundGaap && isValidValue(foundGaap.value)) return Number(foundGaap.value);
        const foundDei = list.find((item: any) => item && item.concept === `dei_${shortConcept}`);
        if (foundDei && isValidValue(foundDei.value)) return Number(foundDei.value);
    }
    return null;
}

export function extractByConceptSuffix(report: any, section: string, suffixes: string[]): number | null {
    if (!report || typeof report !== 'object') return null;
    const list = report[section] || [];
    if (!Array.isArray(list)) return null;

    for (const suffix of suffixes) {
        const cleanSuffix = suffix.replace(/^(us-gaap_|dei_)/, '');
        const found = list.find((item: any) => {
            if (!item || !isValidValue(item.value)) return false;
            const c = item.concept;
            return typeof c === 'string' && (c === cleanSuffix || c.endsWith(`_${cleanSuffix}`) || c.endsWith(cleanSuffix));
        });
        if (found) return Number(found.value);
    }
    return null;
}

export function extractSum(report: any, section: string, concepts: string[]): number | null {
    if (!report || typeof report !== 'object') return null;
    const list = report[section] || [];
    if (!Array.isArray(list)) return null;

    let sum = 0;
    let found = false;
    for (const concept of concepts) {
        const item = list.find((i: any) => i && i.concept === concept);
        if (item && isValidValue(item.value)) {
            sum += Number(item.value);
            found = true;
            continue;
        }
        const shortConcept = concept.replace(/^(us-gaap_|dei_)/, '');
        const itemShort = list.find((i: any) => i && i.concept === shortConcept);
        if (itemShort && isValidValue(itemShort.value)) {
            sum += Number(itemShort.value);
            found = true;
            continue;
        }
        const itemGaap = list.find((i: any) => i && i.concept === `us-gaap_${shortConcept}`);
        if (itemGaap && isValidValue(itemGaap.value)) {
            sum += Number(itemGaap.value);
            found = true;
            continue;
        }
        const itemDei = list.find((i: any) => i && i.concept === `dei_${shortConcept}`);
        if (itemDei && isValidValue(itemDei.value)) {
            sum += Number(itemDei.value);
            found = true;
            continue;
        }
    }
    return found ? sum : null;
}

export function absOrNull(v: number | null): number | null {
    return v === null || v === undefined || Number.isNaN(v) ? null : Math.abs(v);
}

export type RevenueModel =
    | 'COMMERCIAL'
    | 'BANK_NET_INTEREST'
    | 'BANK_GROSS_MINUS_EXPENSE'
    | 'UNKNOWN';

export type NetIncomeCommonStatus =
    | 'REPORTED_COMMON'
    | 'COMPUTED_FROM_NCI'
    | 'REPORTED_CONSOLIDATED_ONLY'
    | 'NOT_AVAILABLE';

export type BalanceStatus =
    | 'VALID_CONSISTENT'
    | 'DERIVED_LIABILITIES'
    | 'DERIVED_EQUITY'
    | 'DERIVED_ASSETS'
    | 'INCONSISTENT'
    | 'INCOMPLETE';

export type CapexSignTransformation =
    | 'REPORTED_POSITIVE'
    | 'INVERTED_FROM_OUTFLOW'
    | 'NULL';

export interface ExtractedFinancials {
    revenue: number | null;
    revenueModel: RevenueModel;
    netIncome: number | null; // Consolidated group profit/loss
    netIncomeCommon: number | null; // Profit/loss attributable specifically to common shareholders
    noncontrollingInterest: number | null;
    netIncomeCommonStatus: NetIncomeCommonStatus;
    grossProfit: number | null;
    ebit: number | null;
    ebitIsReported: boolean;
    operatingCashFlow: number | null;
    capex: number | null; // Normalized positive expenditure convention for FCF = OCF - Capex
    capexRaw: number | null;
    capexSignTransformation: CapexSignTransformation;
    totalAssets: number | null;
    totalLiabilities: number | null;
    currentAssets: number | null;
    currentLiabilities: number | null;
    retainedEarnings: number | null;
    totalEquity: number | null;
    balanceStatus: BalanceStatus;
    balanceDerived: boolean;
    balanceDiff: number;
    sharesOutstanding: number | null;
    sbc: number | null;
    interestExpense: number | null;
    interestExpenseAccrual: number | null;
    totalDebt: number | null;
    cashAndEquivalents: number | null;
    netPPE: number | null;
}

export interface ExtractionOptions {
    trustedShares?: number | null;
    /**
     * Set to true ONLY when caller has verified compatible dates, units, contexts, and dimensions.
     * Raw Finnhub report payloads lack contextRef/dimension metadata, so automatic derivation
     * is disabled by default to strictly preserve reported values and prevent false derivations.
     */
    allowDerivation?: boolean;
}

/**
 * Extracts and normalizes statement data from a Finnhub report object.
 */
export function extractFinancialsFromReport(report: any, options: ExtractionOptions = {}): ExtractedFinancials {
    if (!report || typeof report !== 'object') {
        return {
            revenue: null,
            revenueModel: 'UNKNOWN',
            netIncome: null,
            netIncomeCommon: null,
            noncontrollingInterest: null,
            netIncomeCommonStatus: 'NOT_AVAILABLE',
            grossProfit: null,
            ebit: null,
            ebitIsReported: false,
            operatingCashFlow: null,
            capex: null,
            capexRaw: null,
            capexSignTransformation: 'NULL',
            totalAssets: null,
            totalLiabilities: null,
            currentAssets: null,
            currentLiabilities: null,
            retainedEarnings: null,
            totalEquity: null,
            balanceStatus: 'INCOMPLETE',
            balanceDerived: false,
            balanceDiff: 0,
            sharesOutstanding: null,
            sbc: null,
            interestExpense: null,
            interestExpenseAccrual: null,
            totalDebt: null,
            cashAndEquivalents: null,
            netPPE: null,
        };
    }

    // ── 1. Revenue: Commercial Sales vs. Bank Net/Gross Protection ──
    let revenue = extract(report, 'ic', [
        'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax',
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'us-gaap_SalesRevenueNet',
        'SalesRevenueNet',
        'us-gaap_Revenues',
        'Revenues',
        'us-gaap_TotalRevenuesAndOtherIncome',
        'TotalRevenuesAndOtherIncome',
        'us-gaap_RevenuesNetOfInterestExpense',
        'RevenuesNetOfInterestExpense',
        'us-gaap_HealthCareOrganizationRevenue',
        'HealthCareOrganizationRevenue',
        'us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax',
        'RevenueFromContractWithCustomerIncludingAssessedTax',
        'us-gaap_SalesRevenueServicesNet',
        'SalesRevenueServicesNet',
        'us-gaap_SalesRevenueGoodsNet',
        'SalesRevenueGoodsNet',
        // Utility-specific
        'us-gaap_RegulatedAndUnregulatedOperatingRevenue',
        'RegulatedAndUnregulatedOperatingRevenue',
        'us-gaap_RegulatedOperatingRevenue',
        'RegulatedOperatingRevenue',
    ]);

    let revenueModel: RevenueModel = revenue !== null ? 'COMMERCIAL' : 'UNKNOWN';

    // Bank fallback: Strictly prevent double counting of gross interest income!
    if (revenue === null) {
        // Preferred bank formula: Net Interest Income (NII) + Noninterest Income
        // CRITICAL: InterestIncomeExpenseAfterProvisionForLoanLoss is strictly EXCLUDED.
        // Provision for loan losses is a credit reserve expense, NOT a top-line revenue deduction.
        const netInterestIncome = extract(report, 'ic', [
            'us-gaap_InterestIncomeExpenseNet',
            'InterestIncomeExpenseNet',
        ]);
        const noninterestIncome = extract(report, 'ic', [
            'us-gaap_NoninterestIncome',
            'NoninterestIncome',
        ]);

        if (netInterestIncome !== null) {
            revenue = netInterestIncome + (noninterestIncome || 0);
            revenueModel = 'BANK_NET_INTEREST';
        } else {
            // Secondary fallback: Gross interest income MINUS interest expense + noninterest income
            const grossInterestIncome = extract(report, 'ic', [
                'us-gaap_InterestAndDividendIncomeOperating',
                'InterestAndDividendIncomeOperating',
                'us-gaap_InterestIncome',
                'InterestIncome',
            ]);
            const interestExpense = extract(report, 'ic', [
                'us-gaap_InterestExpense',
                'InterestExpense',
                'us-gaap_InterestExpenseDebt',
                'InterestExpenseDebt',
            ]);

            if (grossInterestIncome !== null && interestExpense !== null) {
                revenue = (grossInterestIncome - interestExpense) + (noninterestIncome || 0);
                revenueModel = 'BANK_GROSS_MINUS_EXPENSE';
            }
            // CRITICAL: We NEVER sum gross interest without deducting interest expense!
        }
    }

    // ── 2. Net Income: Consolidated vs. Common Shareholders Distinction ──
    const netIncomeCommonReported = extract(report, 'ic', [
        'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic',
        'NetIncomeLossAvailableToCommonStockholdersBasic',
    ]);
    const netIncomeConsolidatedReported = extract(report, 'ic', [
        'us-gaap_NetIncomeLoss',
        'NetIncomeLoss',
        'us-gaap_ProfitLoss',
        'ProfitLoss',
    ]);
    const noncontrollingInterest = extract(report, 'ic', [
        'us-gaap_NetIncomeLossAttributableToNoncontrollingInterest',
        'NetIncomeLossAttributableToNoncontrollingInterest',
    ]);

    let netIncome: number | null = netIncomeConsolidatedReported;
    let netIncomeCommon: number | null = netIncomeCommonReported;
    let netIncomeCommonStatus: NetIncomeCommonStatus;

    if (netIncomeCommonReported !== null) {
        netIncomeCommonStatus = 'REPORTED_COMMON';
        if (netIncome === null && noncontrollingInterest !== null) {
            netIncome = netIncomeCommonReported + noncontrollingInterest;
        }
        // MANDATORY RULE: Never assume NCI = 0! If consolidated net income was not
        // reported and NCI is null, do NOT substitute common income into consolidated netIncome.
    } else if (netIncomeConsolidatedReported !== null && noncontrollingInterest !== null) {
        netIncomeCommon = netIncomeConsolidatedReported - noncontrollingInterest;
        netIncomeCommonStatus = 'COMPUTED_FROM_NCI';
    } else if (netIncomeConsolidatedReported !== null) {
        // MANDATORY RULE: Never assume missing NCI means zero!
        // Do not silently substitute consolidated Net Income for common Net Income.
        netIncomeCommon = null;
        netIncomeCommonStatus = 'REPORTED_CONSOLIDATED_ONLY';
    } else {
        netIncomeCommonStatus = 'NOT_AVAILABLE';
    }

    // ── 3. Gross Profit ──
    let grossProfit = extract(report, 'ic', [
        'us-gaap_GrossProfit',
        'GrossProfit',
    ]);
    if (grossProfit === null && revenue !== null) {
        const cogs = extract(report, 'ic', [
            'us-gaap_CostOfGoodsAndServicesSold', 'us-gaap_CostOfRevenue', 'us-gaap_CostOfGoodsSold',
            'us-gaap_CostOfServices', 'us-gaap_CostOfGoodsSoldExcludingDepreciationDepletionAndAmortization',
            'CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfServices',
        ]);
        if (cogs !== null) {
            grossProfit = revenue - cogs;
        }
    }
    if (grossProfit === null && revenue !== null) {
        const costsAndExpenses = extract(report, 'ic', [
            'us-gaap_CostsAndExpenses',
            'CostsAndExpenses',
        ]);
        if (costsAndExpenses !== null) {
            grossProfit = revenue - costsAndExpenses;
        }
    }

    // ── 4. EBIT ──
    let ebit = extract(report, 'ic', [
        'us-gaap_OperatingIncomeLoss',
        'us-gaap_OperatingIncomeLossFromContinuingOperations',
        'OperatingIncomeLoss',
    ]);
    const ebitIsReported = ebit !== null;
    if (ebit === null && grossProfit !== null) {
        const rnde = extract(report, 'ic', [
            'us-gaap_ResearchAndDevelopmentExpense',
            'ResearchAndDevelopmentExpense',
        ]) || 0;
        const sgae = extract(report, 'ic', [
            'us-gaap_SellingGeneralAndAdministrativeExpense',
            'SellingGeneralAndAdministrativeExpense',
        ]) || 0;
        ebit = grossProfit - rnde - sgae;
    }
    if (ebit === null && revenue !== null) {
        const costsAndExpenses = extract(report, 'ic', [
            'us-gaap_CostsAndExpenses', 'us-gaap_CostOfRevenue',
            'us-gaap_CostOfGoodsAndServicesSold', 'us-gaap_CostOfGoodsSold',
            'CostsAndExpenses', 'CostOfRevenue',
            'CostOfGoodsAndServicesSold', 'CostOfGoodsSold',
        ]);
        if (costsAndExpenses !== null) {
            ebit = revenue - costsAndExpenses;
        }
    }

    // ── 5. Operating Cash Flow ──
    const operatingCashFlow = extract(report, 'cf', [
        'us-gaap_NetCashProvidedByUsedInOperatingActivities',
        'us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuing',
        'us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
        'NetCashProvidedByUsedInOperatingActivities',
        'NetCashProvidedByUsedInOperatingActivitiesContinuing',
        'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ]) ?? extractByConceptSuffix(report, 'cf', [
        'NetCashProvidedByUsedInOperatingActivities',
        'NetCashProvidedByUsedInOperatingActivitiesContinuing',
        'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    ]);

    // ── 6. Capex (normalized to positive expenditure convention) ──
    const capexRaw = extract(report, 'cf', [
        'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment',
        'PaymentsToAcquirePropertyPlantAndEquipment',
        'us-gaap_PaymentsToAcquireProductiveAssets',
        'PaymentsToAcquireProductiveAssets',
        'us-gaap_PaymentsToAcquireOtherPropertyPlantAndEquipment',
        'us-gaap_PaymentsToAcquireOtherProductiveAssets',
        'us-gaap_PaymentsToAcquireOilAndGasPropertyAndEquipment',
        'us-gaap_PaymentsToAcquireOilAndGasProperty',
        'us-gaap_PaymentsToAcquireFurnitureAndFixtures',
        'us-gaap_PaymentsToDevelopRealEstateAssetsAndPaymentsForCapitalExpenditures',
        'us-gaap_PaymentsToAcquireFixedAssets',
        'us-gaap_CapitalExpenditureIncurredForPropertyPlantAndEquipment',
        'CapitalExpenditureIncurredForPropertyPlantAndEquipment',
    ]) ?? extractByConceptSuffix(report, 'cf', [
        'CapitalExpendituresAndInvestments',
        'PaymentsForCapitalImprovements',
    ]);

    let capex: number | null = null;
    let capexSignTransformation: CapexSignTransformation = 'NULL';

    if (capexRaw !== null) {
        if (capexRaw > 0) {
            capex = capexRaw;
            capexSignTransformation = 'REPORTED_POSITIVE';
        } else if (capexRaw < 0) {
            capex = Math.abs(capexRaw);
            capexSignTransformation = 'INVERTED_FROM_OUTFLOW';
        } else {
            capex = 0;
            capexSignTransformation = 'REPORTED_POSITIVE';
        }
    }

    // ── 7. Balance Sheet Assets, Liabilities, Equity ──
    let totalAssets = extract(report, 'bs', [
        'us-gaap_Assets',
        'Assets',
    ]);
    let totalLiabilities = extract(report, 'bs', [
        'us-gaap_Liabilities',
        'Liabilities',
    ]);
    let totalEquity = extract(report, 'bs', [
        'us-gaap_StockholdersEquity',
        'StockholdersEquity',
        'us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
        'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
        'us-gaap_PartnerCapital',
        'PartnerCapital',
        'us-gaap_CommonStockholdersEquity',
        'CommonStockholdersEquity',
    ]);

    let balanceStatus: BalanceStatus = 'INCOMPLETE';
    let balanceDerived = false;
    let balanceDiff = 0;

    // Validate Assets = Liabilities + Equity
    // Note: Legitimate negative equity (MCD, PM) is fully preserved!
    if (totalAssets !== null && totalLiabilities !== null && totalEquity !== null) {
        balanceDiff = Math.abs(totalAssets - (totalLiabilities + totalEquity));
        const tolerance = Math.max(1000, Math.abs(totalAssets) * 0.01); // 1% or $1,000 rounding
        if (balanceDiff <= tolerance) {
            balanceStatus = 'VALID_CONSISTENT';
        } else {
            balanceStatus = 'INCONSISTENT';
            // Do NOT silently overwrite or derive inconsistent source values!
        }
    } else if (options.allowDerivation) {
        // Derivation permitted ONLY across verified compatible dates, units, contexts, and dimensions
        if (totalAssets !== null && totalEquity !== null && totalLiabilities === null) {
            totalLiabilities = totalAssets - totalEquity;
            balanceStatus = 'DERIVED_LIABILITIES';
            balanceDerived = true;
        } else if (totalAssets !== null && totalLiabilities !== null && totalEquity === null) {
            totalEquity = totalAssets - totalLiabilities;
            balanceStatus = 'DERIVED_EQUITY';
            balanceDerived = true;
        } else if (totalLiabilities !== null && totalEquity !== null && totalAssets === null) {
            totalAssets = totalLiabilities + totalEquity;
            balanceStatus = 'DERIVED_ASSETS';
            balanceDerived = true;
        } else {
            balanceStatus = 'INCOMPLETE';
        }
    } else {
        // Finnhub report objects lack XBRL contextRef, dimensions, and unit metadata across concepts.
        // Automatic derivation is DISABLED to strictly preserve reported values.
        balanceStatus = 'INCOMPLETE';
        balanceDerived = false;
    }

    const currentAssets = extract(report, 'bs', [
        'us-gaap_AssetsCurrent',
        'AssetsCurrent',
    ]);
    const currentLiabilities = extract(report, 'bs', [
        'us-gaap_LiabilitiesCurrent',
        'LiabilitiesCurrent',
    ]);
    const retainedEarnings = extract(report, 'bs', [
        'us-gaap_RetainedEarningsAccumulatedDeficit',
        'RetainedEarningsAccumulatedDeficit',
    ]);

    // ── 8. Shares Outstanding ──
    let sharesOutstandingRaw = extract(report, 'bs', [
        'dei_EntityCommonStockSharesOutstanding',
        'EntityCommonStockSharesOutstanding',
    ]) ?? extract(report, 'ic', [
        'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding',
        'us-gaap_WeightedAverageNumberOfSharesOutstandingBasic',
        'WeightedAverageNumberOfDilutedSharesOutstanding',
        'WeightedAverageNumberOfSharesOutstandingBasic',
    ]);

    const trustedShares = options.trustedShares ?? null;
    if (sharesOutstandingRaw === null || sharesOutstandingRaw <= 0) {
        const eps = extract(report, 'ic', [
            'us-gaap_EarningsPerShareDiluted',
            'us-gaap_EarningsPerShareBasic',
            'EarningsPerShareDiluted',
            'EarningsPerShareBasic',
        ]);
        const isTruncatedIntEps = eps !== null && Number.isInteger(eps) && Math.abs(eps) <= 20;
        if (eps && eps !== 0 && !isTruncatedIntEps && netIncome !== null && netIncome !== 0) {
            const derived = Math.abs(netIncome / eps);
            const SPLIT_MULTS = [1, 2, 3, 4, 5, 7, 8, 10, 15, 20, 25, 50];
            const matchesTrusted = trustedShares == null
                || SPLIT_MULTS.some(m => Math.abs((derived * m) / trustedShares - 1) <= 0.4);
            sharesOutstandingRaw = matchesTrusted ? derived : null;
        }
    }

    const sharesOutstanding = (sharesOutstandingRaw !== null && sharesOutstandingRaw > 0)
        ? (sharesOutstandingRaw < 10000 ? sharesOutstandingRaw * 1_000_000 : sharesOutstandingRaw)
        : null;

    // ── 9. SBC (normalized to positive magnitude) ──
    const sbcRaw = extract(report, 'cf', [
        'us-gaap_ShareBasedCompensation',
        'us-gaap_AllocatedShareBasedCompensationExpense',
        'us-gaap_ShareBasedCompensationArrangementByShareBasedPaymentAwardOptionsGrantsInPeriodGross',
        'ShareBasedCompensation',
        'AllocatedShareBasedCompensationExpense',
    ]) ?? extract(report, 'ic', [
        'us-gaap_AllocatedShareBasedCompensationExpense',
        'us-gaap_ShareBasedCompensation',
        'AllocatedShareBasedCompensationExpense',
        'ShareBasedCompensation',
    ]);
    const sbc = absOrNull(sbcRaw);

    // ── 10. Interest Expense ──
    const interestExpenseAccrual = extract(report, 'ic', [
        'us-gaap_InterestExpense', 'us-gaap_InterestExpenseDebt',
        'us-gaap_InterestExpenseNonoperating', 'us-gaap_InterestExpenseOperating',
        'InterestExpense', 'InterestExpenseDebt',
        'InterestExpenseNonoperating', 'InterestExpenseOperating',
    ]);
    const interestExpense = interestExpenseAccrual
        ?? extract(report, 'cf', ['us-gaap_InterestPaidNet', 'InterestPaidNet']);

    // ── 11. Total Debt ──
    const longTermDebt = extract(report, 'bs', [
        'us-gaap_LongTermDebtNoncurrent', 'us-gaap_LongTermDebtAndCapitalLeaseObligations', 'us-gaap_LongTermDebt',
        'us-gaap_LongTermDebtFairValue', 'us-gaap_LongTermLineOfCredit',
        'us-gaap_LongTermNotesPayable', 'us-gaap_ConvertibleDebtNoncurrent',
        'us-gaap_SeniorNotesNetOfDebtIssuanceCosts', 'us-gaap_SecuredDebt',
        'LongTermDebtNoncurrent', 'LongTermDebt',
    ]);
    const shortTermDebt = extract(report, 'bs', [
        'us-gaap_DebtCurrent', 'us-gaap_ShortTermBorrowings', 'us-gaap_LongTermDebtAndCapitalLeaseObligationsCurrent',
        'us-gaap_CommercialPaper', 'us-gaap_ShortTermDebt',
        'us-gaap_NotesPayableCurrent',
        'DebtCurrent', 'ShortTermBorrowings',
    ]);
    let totalDebt: number | null = null;
    if (longTermDebt !== null || shortTermDebt !== null) {
        totalDebt = (longTermDebt || 0) + (shortTermDebt || 0);
    }
    if (totalDebt === null) {
        totalDebt = extract(report, 'bs', [
            'us-gaap_DebtLongtermAndShorttermCombined', 'us-gaap_DebtAndCapitalLeaseObligations',
            'us-gaap_LongTermDebtAndShortTermDebt', 'us-gaap_DebtInstrumentCarryingAmount',
            'us-gaap_NotesPayable', 'us-gaap_LiabilitiesNoncurrent',
            'DebtLongtermAndShorttermCombined', 'DebtAndCapitalLeaseObligations',
            'LongTermDebtAndShortTermDebt', 'DebtInstrumentCarryingAmount',
            'NotesPayable', 'LiabilitiesNoncurrent',
        ]);
    }

    // ── 12. Cash and Equivalents ──
    let cashAndEquivalents = extract(report, 'bs', [
        'us-gaap_CashCashEquivalentsAndMarketableSecuritiesCurrent',
        'us-gaap_CashCashEquivalentsAndMarketableSecurities',
        'us-gaap_CashCashEquivalentsAndShortTermInvestments',
        'us-gaap_CashAndShortTermInvestments',
        'CashCashEquivalentsAndMarketableSecuritiesCurrent',
        'CashCashEquivalentsAndMarketableSecurities',
        'CashCashEquivalentsAndShortTermInvestments',
        'CashAndShortTermInvestments',
    ]);
    if (cashAndEquivalents === null) {
        cashAndEquivalents = extractSum(report, 'bs', [
            'us-gaap_CashAndCashEquivalentsAtCarryingValue',
            'us-gaap_MarketableSecuritiesCurrent',
            'us-gaap_ShortTermInvestments',
            'us-gaap_AvailableForSaleSecuritiesDebtSecuritiesCurrent',
            'us-gaap_OtherShortTermInvestments',
            'CashAndCashEquivalentsAtCarryingValue',
            'MarketableSecuritiesCurrent',
            'ShortTermInvestments',
            'AvailableForSaleSecuritiesDebtSecuritiesCurrent',
            'OtherShortTermInvestments',
        ]);
    }
    if (cashAndEquivalents === null) {
        cashAndEquivalents = extract(report, 'bs', [
            'us-gaap_Cash',
            'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
            'us-gaap_CashEquivalentsAtCarryingValue',
            'Cash',
            'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
            'CashEquivalentsAtCarryingValue',
        ]);
    }

    // ── 13. Net PPE ──
    const netPPE = extract(report, 'bs', [
        'us-gaap_PropertyPlantAndEquipmentNet',
        'PropertyPlantAndEquipmentNet',
    ]);

    return {
        revenue,
        revenueModel,
        netIncome,
        netIncomeCommon,
        noncontrollingInterest,
        netIncomeCommonStatus,
        grossProfit,
        ebit,
        ebitIsReported,
        operatingCashFlow,
        capex,
        capexRaw,
        capexSignTransformation,
        totalAssets,
        totalLiabilities,
        currentAssets,
        currentLiabilities,
        retainedEarnings,
        totalEquity,
        balanceStatus,
        balanceDerived,
        balanceDiff,
        sharesOutstanding,
        sbc,
        interestExpense,
        interestExpenseAccrual,
        totalDebt,
        cashAndEquivalents,
        netPPE,
    };
}
