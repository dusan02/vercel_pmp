import { prisma } from '@/lib/db/prisma';

// ─── stockanalysis.com fallback for ADR/foreign tickers ──────────────
const SA_BASE = 'https://stockanalysis.com/stocks';
const SA_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

interface SAData {
    datekey: string[];
    fiscalYear: string[];
    fiscalQuarter: string[];
    [key: string]: any;
}

function extractSAFinancialData(html: string): SAData | null {
    const idx = html.indexOf('financialData:{');
    if (idx < 0) return null;
    const start = idx + 'financialData:'.length;
    let depth = 0;
    for (let i = start; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}') depth--;
        if (depth === 0) {
            const objStr = html[start] + html.slice(start + 1, i + 1);
            let jsonStr = objStr.replace(/([{,])([a-zA-Z_][a-zA-Z0-9_]*):/g, '$1"$2":');
            jsonStr = jsonStr.replace(/void 0/g, 'null');
            jsonStr = jsonStr.replace(/([\[:,\[])(-?)\.(\d)/g, '$1$20.$3');
            try {
                return JSON.parse(jsonStr);
            } catch {
                return null;
            }
        }
    }
    return null;
}

async function fetchSAData(symbol: string, statement: string): Promise<SAData | null> {
    const url = `${SA_BASE}/${symbol.toLowerCase()}/financials/${statement}/`;
    try {
        const resp = await fetch(url, { headers: SA_HEADERS });
        if (!resp.ok) return null;
        const html = await resp.text();
        return extractSAFinancialData(html);
    } catch {
        return null;
    }
}

function saNumArr(data: SAData, key: string, i: number): number | null {
    if (!data[key]) return null;
    const v = data[key][i];
    if (v === null || v === undefined || isNaN(v)) return null;
    return Number(v);
}

async function syncFromStockAnalysis(symbol: string): Promise<number> {
    const [income, balance, cashflow] = await Promise.all([
        fetchSAData(symbol, ''),
        fetchSAData(symbol, 'balance-sheet'),
        fetchSAData(symbol, 'cash-flow-statement'),
    ]);
    if (!income) return 0;

    await prisma.ticker.upsert({
        where: { symbol },
        update: {},
        create: { symbol, name: symbol },
    });

    let upserted = 0;
    for (let i = 0; i < income.datekey.length; i++) {
        const dateStr = income.datekey[i]!;
        if (dateStr === 'TTM') continue;
        const fiscalYear = parseInt(income.fiscalYear[i]!, 10);
        const fiscalQuarter = income.fiscalQuarter[i]!;
        const fiscalPeriod = (fiscalQuarter === 'Q4' || fiscalQuarter === 'FY') ? 'FY' : fiscalQuarter;
        const endDate = new Date(dateStr + 'T00:00:00Z');

        const stmtData = {
            endDate,
            revenue: saNumArr(income, 'revenue', i),
            netIncome: saNumArr(income, 'netIncome', i),
            ebit: saNumArr(income, 'ebit', i) ?? saNumArr(income, 'operatingIncome', i),
            grossProfit: saNumArr(income, 'grossProfit', i),
            operatingCashFlow: cashflow ? (saNumArr(cashflow, 'cash_flow_statement_net_cash_from_operating_activities', i) ?? saNumArr(cashflow, 'cfo', i)) : null,
            capex: cashflow ? (saNumArr(cashflow, 'cash_flow_statement_capital_expenditure', i) ?? saNumArr(cashflow, 'capex', i)) : null,
            totalAssets: balance ? saNumArr(balance, 'assets', i) : null,
            totalLiabilities: balance ? saNumArr(balance, 'liabilities', i) : null,
            currentAssets: balance ? saNumArr(balance, 'assetsc', i) : null,
            currentLiabilities: balance ? saNumArr(balance, 'liabilitiesc', i) : null,
            retainedEarnings: balance ? saNumArr(balance, 'balance_sheet_retained_earnings', i) : null,
            totalEquity: balance ? saNumArr(balance, 'equity', i) : null,
            sharesOutstanding: saNumArr(income, 'sharesDiluted', i) ?? saNumArr(income, 'sharesBasic', i),
            sbc: saNumArr(income, 'sbc', i),
            interestExpense: saNumArr(income, 'income_statement_interest_expense', i),
            totalDebt: balance ? saNumArr(balance, 'debt', i) : null,
            cashAndEquivalents: balance ? (saNumArr(balance, 'totalcash', i) ?? saNumArr(balance, 'cashneq', i)) : null,
            netPPE: balance ? saNumArr(balance, 'balance_sheet_net_property_plant_and_equipment', i) : null,
        };

        await prisma.financialStatement.upsert({
            where: { symbol_fiscalYear_fiscalPeriod: { symbol, fiscalYear, fiscalPeriod } },
            update: stmtData,
            create: { symbol, period: fiscalPeriod, fiscalYear, fiscalPeriod, ...stmtData },
        });
        upserted++;
    }
    return upserted;
}

// ─── XBRL extraction helpers (module-level for reusability) ──────────

const isValidValue = (v: any) => v !== undefined && v !== null && v !== 'N/A' && v !== '';

function extract(report: any, section: string, concepts: string[]): number | null {
    const list = report[section] || [];
    for (const concept of concepts) {
        const found = list.find((item: any) => item.concept === concept);
        if (found && isValidValue(found.value)) return found.value;
        const shortConcept = concept.replace(/^us-gaap_/, '');
        const foundShort = list.find((item: any) => item.concept === shortConcept);
        if (foundShort && isValidValue(foundShort.value)) return foundShort.value;
    }
    return null;
}

function extractSum(report: any, section: string, concepts: string[]): number | null {
    const list = report[section] || [];
    let sum = 0;
    let found = false;
    for (const concept of concepts) {
        const item = list.find((i: any) => i.concept === concept);
        if (item && isValidValue(item.value)) {
            sum += item.value;
            found = true;
            continue;
        }
        const shortConcept = concept.replace(/^us-gaap_/, '');
        const itemShort = list.find((i: any) => i.concept === shortConcept);
        if (itemShort && isValidValue(itemShort.value)) {
            sum += itemShort.value;
            found = true;
        }
    }
    return found ? sum : null;
}

/**
 * Sync financial statements from Finnhub XBRL API.
 * Falls back to stockanalysis.com scraper for ADR/foreign tickers not in Finnhub.
 * Extracts revenue, net income, EBIT, cash flow, balance sheet items, etc.
 */
export async function syncFinancials(symbol: string): Promise<void> {
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
    if (!FINNHUB_API_KEY) throw new Error('Chýba Finnhub API Key pre Financials');

    const timeframes = ['annual', 'quarterly'];

    try {
        // Ensure Ticker row exists (FK requirement for FinancialStatement)
        await prisma.ticker.upsert({
            where: { symbol },
            update: {},
            create: { symbol, name: symbol },
        });

        for (const timeframe of timeframes) {
            const url = `https://finnhub.io/api/v1/stock/financials-reported?symbol=${symbol}&freq=${timeframe}&token=${FINNHUB_API_KEY}`;
            
            const res: Response = await fetch(url);
            if (!res.ok) {
                // Don't throw for 429/404 — fall through to stockanalysis.com fallback
                if (res.status === 429 || res.status === 404) continue;
                throw new Error(`Finnhub API chyba: ${res.status} ${res.statusText}`);
            }
            const data: any = await res.json();
            
            const results = data.data || [];

            for (const item of results) {
                const { year, quarter, endDate, report } = item;
                if (!year || !endDate || !report) continue;
                if (year < 2016) continue; // Only keep 2016+ data (10 year window)

                // Určenie obdobia
                const fiscalYear = year;
                const fiscalPeriod = timeframe === 'annual' ? 'FY' : `Q${quarter}`;
                if (timeframe === 'quarterly' && !quarter) continue; // Skip invalid quarterly

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
                        'us-gaap_InterestIncome'
                    ]);
                    const noninterestIncome = extract(report, 'ic', ['us-gaap_NoninterestIncome']);
                    if (interestIncome !== null) {
                        revenue = interestIncome + (noninterestIncome || 0);
                    }
                }
                const netIncome = extract(report, 'ic', [
                    'us-gaap_NetIncomeLoss', 'us-gaap_NetIncomeLossAvailableToCommonStockholdersBasic', 'us-gaap_ProfitLoss'
                ]);
                let grossProfit = extract(report, 'ic', [
                    'us-gaap_GrossProfit',
                    // Without prefix
                    'GrossProfit'
                ]);
                // Fallback 1: compute from Revenue - COGS
                if (grossProfit === null && revenue !== null) {
                    const cogs = extract(report, 'ic', [
                        'us-gaap_CostOfGoodsAndServicesSold', 'us-gaap_CostOfRevenue', 'us-gaap_CostOfGoodsSold',
                        'us-gaap_CostOfServices', 'us-gaap_CostOfGoodsSoldExcludingDepreciationDepletionAndAmortization',
                        // Without prefix
                        'CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold', 'CostOfServices'
                    ]);
                    if (cogs !== null) {
                        grossProfit = revenue - cogs;
                    }
                }
                // Fallback 2: Revenue - COGS - SGA (some companies bundle costs)
                if (grossProfit === null && revenue !== null) {
                    const costsAndExpenses = extract(report, 'ic', ['us-gaap_CostsAndExpenses', 'CostsAndExpenses']);
                    if (costsAndExpenses !== null) {
                        grossProfit = revenue - costsAndExpenses;
                    }
                }
                
                let ebit = extract(report, 'ic', [
                    'us-gaap_OperatingIncomeLoss',
                    'us-gaap_IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
                    'us-gaap_OperatingIncomeLossFromContinuingOperations',
                    // Without prefix
                    'OperatingIncomeLoss',
                    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest'
                ]);
                if (ebit === null && grossProfit !== null) {
                    const rnde = extract(report, 'ic', ['us-gaap_ResearchAndDevelopmentExpense']) || 0;
                    const sgae = extract(report, 'ic', ['us-gaap_SellingGeneralAndAdministrativeExpense']) || 0;
                    ebit = grossProfit - rnde - sgae;
                }
                // Fallback: revenue - total costs and expenses
                if (ebit === null && revenue !== null) {
                    const costsAndExpenses = extract(report, 'ic', [
                        'us-gaap_CostsAndExpenses', 'us-gaap_CostOfRevenue',
                        'us-gaap_CostOfGoodsAndServicesSold', 'us-gaap_CostOfGoodsSold'
                    ]);
                    if (costsAndExpenses !== null) {
                        ebit = revenue - costsAndExpenses;
                    }
                }

                const operatingCashFlow = extract(report, 'cf', [
                    'us-gaap_NetCashProvidedByUsedInOperatingActivities', 'us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuing',
                    'us-gaap_NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'
                ]);
                const capex = extract(report, 'cf', [
                    'us-gaap_PaymentsToAcquirePropertyPlantAndEquipment', 'us-gaap_PaymentsToAcquireOtherPropertyPlantAndEquipment',
                    'us-gaap_PaymentsToAcquireProductiveAssets',
                    'us-gaap_PaymentsToAcquireFixedAssets',
                    'us-gaap_CapitalExpenditureIncurredForPropertyPlantAndEquipment',
                    // Without prefix
                    'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets',
                    'CapitalExpenditureIncurredForPropertyPlantAndEquipment'
                ]);
                
                const totalAssets = extract(report, 'bs', ['us-gaap_Assets']);
                let totalLiabilities = extract(report, 'bs', ['us-gaap_Liabilities']);
                // Fallback: compute from accounting equation (Assets = Liabilities + Equity)
                // Needed for companies like MCD that don't report us-gaap_Liabilities directly
                if (totalLiabilities === null && totalAssets !== null) {
                    const eq = extract(report, 'bs', [
                        'us-gaap_StockholdersEquity', 'us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'us-gaap_PartnerCapital'
                    ]);
                    if (eq !== null) {
                        totalLiabilities = totalAssets - eq;
                    }
                }
                const currentAssets = extract(report, 'bs', ['us-gaap_AssetsCurrent']);
                const currentLiabilities = extract(report, 'bs', ['us-gaap_LiabilitiesCurrent']);
                const retainedEarnings = extract(report, 'bs', ['us-gaap_RetainedEarningsAccumulatedDeficit']);
                const totalEquity = extract(report, 'bs', [
                    'us-gaap_StockholdersEquity', 'us-gaap_StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest', 'us-gaap_PartnerCapital'
                ]);

                let sharesOutstandingRaw = extract(report, 'ic', [
                    'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', 'us-gaap_WeightedAverageNumberOfSharesOutstandingBasic'
                ]) ?? extract(report, 'bs', ['dei_EntityCommonStockSharesOutstanding']);

                // Fallback: derive shares from NetIncome / EPS (e.g. GOOGL reports EPS but not shares count)
                if (sharesOutstandingRaw === null || sharesOutstandingRaw <= 0) {
                    const eps = extract(report, 'ic', [
                        'us-gaap_EarningsPerShareDiluted', 'us-gaap_EarningsPerShareBasic'
                    ]);
                    if (eps && eps !== 0 && netIncome !== null && netIncome !== 0) {
                        sharesOutstandingRaw = Math.abs(netIncome / eps);
                    }
                }

                // Some companies (e.g. MCD) report shares in millions (710 = 710M)
                // If value < 10000, assume millions and convert to absolute
                const sharesOutstanding = (sharesOutstandingRaw !== null && sharesOutstandingRaw > 0)
                    ? (sharesOutstandingRaw < 10000 ? sharesOutstandingRaw * 1_000_000 : sharesOutstandingRaw)
                    : null;

                const sbc = extract(report, 'cf', [
                    'us-gaap_ShareBasedCompensation',
                    'us-gaap_AllocatedShareBasedCompensationExpense',
                    'us-gaap_ShareBasedCompensationArrangementByShareBasedPaymentAwardOptionsGrantsInPeriodGross'
                ]) ?? extract(report, 'ic', [
                    'us-gaap_AllocatedShareBasedCompensationExpense',
                    'us-gaap_ShareBasedCompensation'
                ]);

                const interestExpense = extract(report, 'ic', ['us-gaap_InterestExpense', 'us-gaap_InterestExpenseDebt']);
                
                const longTermDebt = extract(report, 'bs', [
                    'us-gaap_LongTermDebtNoncurrent', 'us-gaap_LongTermDebtAndCapitalLeaseObligations', 'us-gaap_LongTermDebt',
                    'us-gaap_LongTermDebtFairValue', 'us-gaap_LongTermLineOfCredit',
                    // Without prefix
                    'LongTermDebtNoncurrent', 'LongTermDebt'
                ]);
                const shortTermDebt = extract(report, 'bs', [
                    'us-gaap_DebtCurrent', 'us-gaap_ShortTermBorrowings', 'us-gaap_LongTermDebtAndCapitalLeaseObligationsCurrent',
                    'us-gaap_CommercialPaper', 'us-gaap_ShortTermDebt',
                    // Without prefix
                    'DebtCurrent', 'ShortTermBorrowings'
                ]);
                let totalDebt = null;
                if (longTermDebt !== null || shortTermDebt !== null) {
                    totalDebt = (longTermDebt || 0) + (shortTermDebt || 0);
                }
                // Fallback: try direct total debt concept
                if (totalDebt === null) {
                    totalDebt = extract(report, 'bs', [
                        'us-gaap_DebtLongtermAndShorttermCombined', 'us-gaap_LiabilitiesNoncurrent',
                        'us-gaap_LongTermDebtAndShortTermDebt'
                    ]);
                }

                // Cash extraction — multi-strategy for maximum coverage
                // Strategy 1: Single combined concept (MSFT, GOOGL style)
                let cashAndEquivalents = extract(report, 'bs', [
                    'us-gaap_CashCashEquivalentsAndMarketableSecuritiesCurrent',
                    'us-gaap_CashCashEquivalentsAndMarketableSecurities',
                    'us-gaap_CashCashEquivalentsAndShortTermInvestments',
                    'us-gaap_CashAndShortTermInvestments',
                ]);
                // Strategy 2: Sum cash + marketable securities (META, AAPL, NVDA split reporting)
                if (cashAndEquivalents === null) {
                    cashAndEquivalents = extractSum(report, 'bs', [
                        'us-gaap_CashAndCashEquivalentsAtCarryingValue',
                        'us-gaap_MarketableSecuritiesCurrent',
                        'us-gaap_ShortTermInvestments',
                        'us-gaap_AvailableForSaleSecuritiesDebtSecuritiesCurrent',
                        'us-gaap_OtherShortTermInvestments',
                    ]);
                }
                // Strategy 3: Individual cash-only concepts (last resort)
                if (cashAndEquivalents === null) {
                    cashAndEquivalents = extract(report, 'bs', [
                        'us-gaap_Cash',
                        'us-gaap_CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
                        'us-gaap_CashEquivalentsAtCarryingValue',
                    ]);
                }

                const netPPE = extract(report, 'bs', ['us-gaap_PropertyPlantAndEquipmentNet']);

                await prisma.financialStatement.upsert({
                    where: {
                        symbol_fiscalYear_fiscalPeriod: {
                            symbol,
                            fiscalYear,
                            fiscalPeriod,
                        }
                    },
                    update: {
                        endDate: new Date(endDate),
                        revenue, netIncome, ebit, operatingCashFlow, capex,
                        totalAssets, totalLiabilities, currentAssets, currentLiabilities,
                        retainedEarnings, totalEquity, sharesOutstanding,
                        sbc, interestExpense, totalDebt, cashAndEquivalents, grossProfit, netPPE
                    },
                    create: {
                        symbol, period: fiscalPeriod, endDate: new Date(endDate),
                        fiscalYear, fiscalPeriod,
                        revenue, netIncome, ebit, operatingCashFlow, capex,
                        totalAssets, totalLiabilities, currentAssets, currentLiabilities,
                        retainedEarnings, totalEquity, sharesOutstanding,
                        sbc, interestExpense, totalDebt, cashAndEquivalents, grossProfit, netPPE
                    }
                });
            }
        }
    } catch (error) {
        console.error(`Error syncing financials mapping via Finnhub for ${symbol}:`, error);
        throw error;
    }

    // Fallback: if Finnhub returned 0 statements (ADR/foreign tickers),
    // try stockanalysis.com scraper
    const stmtCount = await prisma.financialStatement.count({ where: { symbol } });
    if (stmtCount === 0) {
        const saCount = await syncFromStockAnalysis(symbol);
        if (saCount > 0) {
            console.log(`[syncFinancials] ${symbol}: Finnhub had 0 statements, scraped ${saCount} from stockanalysis.com`);
        }
    }
}
