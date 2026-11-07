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

export interface ExtractedFinancials {
    revenue: number | null;
    netIncome: number | null;
    grossProfit: number | null;
    ebit: number | null;
    ebitIsReported: boolean;
    operatingCashFlow: number | null;
    capex: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    currentAssets: number | null;
    currentLiabilities: number | null;
    retainedEarnings: number | null;
    totalEquity: number | null;
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
}

/**
 * Extracts and normalizes statement data from a Finnhub report object.
 */
export function extractFinancialsFromReport(report: any, options: ExtractionOptions = {}): ExtractedFinancials {
    if (!report || typeof report !== 'object') {
        return {
            revenue: null,
            netIncome: null,
            grossProfit: null,
            ebit: null,
            ebitIsReported: false,
            operatingCashFlow: null,
            capex: null,
            totalAssets: null,
            totalLiabilities: null,
            currentAssets: null,
            currentLiabilities: null,
            retainedEarnings: null,
            totalEquity: null,
            sharesOutstanding: null,
            sbc: null,
            interestExpense: null,
            interestExpenseAccrual: null,
            totalDebt: null,
            cashAndEquivalents: null,
            netPPE: null,
        };
    }

    // ── 1. Revenue ──
    let revenue = extract(report, 'ic', [
        'us-gaap_Revenues', 'us-gaap_SalesRevenueNet', 'us-gaap_RevenuesNetOfInterestExpense',
        'us-gaap_RevenueFromContractWithCustomerExcludingAssessedTax', 'us-gaap_HealthCareOrganizationRevenue',
        'us-gaap_RevenueFromContractWithCustomerIncludingAssessedTax',
        'us-gaap_SalesRevenueServicesNet', 'us-gaap_SalesRevenueGoodsNet',
        // Utility-specific
        'us-gaap_RegulatedAndUnregulatedOperatingRevenue', 'us-gaap_RegulatedOperatingRevenue',
        // Without us-gaap_ prefix (older filings)
        'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerExcludingAssessedTax',
        'RevenueFromContractWithCustomerIncludingAssessedTax',
        'RegulatedAndUnregulatedOperatingRevenue', 'RegulatedOperatingRevenue',
        'SalesRevenueServicesNet', 'SalesRevenueGoodsNet'
    ]);
    // Bank fallback: sum interest income + non-interest income
    if (revenue === null) {
        const interestIncome = extract(report, 'ic', [
            'us-gaap_InterestAndDividendIncomeOperating',
            'us-gaap_InterestIncomeExpenseNet',
            'us-gaap_InterestIncome',
            'InterestAndDividendIncomeOperating',
            'InterestIncomeExpenseNet',
            'InterestIncome',
        ]);
        const noninterestIncome = extract(report, 'ic', [
            'us-gaap_NoninterestIncome',
            'NoninterestIncome',
        ]);
        if (interestIncome !== null) {
            revenue = interestIncome + (noninterestIncome || 0);
        }
    }

    // ── 2. Net Income ──
    // Prioritize NetIncomeLossAvailableToCommonStockholdersBasic for companies with noncontrolling interests
    const netIncome = extract(report, 'ic', [
        'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic',
        'us-gaap_NetIncomeLoss',
        'us-gaap_ProfitLoss',
        'NetIncomeLossAvailableToCommonStockholdersBasic',
        'NetIncomeLoss',
        'ProfitLoss',
    ]);

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

    // ── 6. Capex (normalized to positive magnitude) ──
    const capexRaw = extract(report, 'cf', [
        'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment',
        'us-gaap_PaymentsToAcquireOtherPropertyPlantAndEquipment',
        'us-gaap_PaymentsToAcquireProductiveAssets',
        'us-gaap_PaymentsToAcquireOtherProductiveAssets',
        'us-gaap_PaymentsToAcquireOilAndGasPropertyAndEquipment',
        'us-gaap_PaymentsToAcquireOilAndGasProperty',
        'us-gaap_PaymentsToAcquireFurnitureAndFixtures',
        'us-gaap_PaymentsToDevelopRealEstateAssetsAndPaymentsForCapitalExpenditures',
        'us-gaap_PaymentsToAcquireFixedAssets',
        'us-gaap_CapitalExpenditureIncurredForPropertyPlantAndEquipment',
        'PaymentsToAcquirePropertyPlantAndEquipment',
        'PaymentsToAcquireProductiveAssets',
        'CapitalExpenditureIncurredForPropertyPlantAndEquipment',
    ]) ?? extractByConceptSuffix(report, 'cf', [
        'CapitalExpendituresAndInvestments',
        'PaymentsForCapitalImprovements',
    ]);
    const capex = absOrNull(capexRaw);

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

    // Balance sheet equilibrium (Assets = Liabilities + Equity)
    if (totalAssets === null && totalLiabilities !== null && totalEquity !== null) {
        totalAssets = totalLiabilities + totalEquity;
    } else if (totalLiabilities === null && totalAssets !== null && totalEquity !== null) {
        totalLiabilities = totalAssets - totalEquity;
    } else if (totalEquity === null && totalAssets !== null && totalLiabilities !== null) {
        totalEquity = totalAssets - totalLiabilities;
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
        netIncome,
        grossProfit,
        ebit,
        ebitIsReported,
        operatingCashFlow,
        capex,
        totalAssets,
        totalLiabilities,
        currentAssets,
        currentLiabilities,
        retainedEarnings,
        totalEquity,
        sharesOutstanding,
        sbc,
        interestExpense,
        interestExpenseAccrual,
        totalDebt,
        cashAndEquivalents,
        netPPE,
    };
}
