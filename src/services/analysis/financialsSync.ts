import { prisma } from '@/lib/db/prisma';
import { isSuspiciousShareCount } from '@/lib/utils/shareCount';

// ─── stockanalysis.com fallback for ADR/foreign tickers ──────────────
const SA_BASE = 'https://stockanalysis.com/stocks';
const SA_HEADERS: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

export interface SAData {
    datekey: string[];
    fiscalYear: string[];
    fiscalQuarter: string[];
    currency?: string;
    [key: string]: any;
}

/**
 * Extracts statement arrays from a stockanalysis.com page.
 *
 * SA changed their page structure (2026): the income statement page no
 * longer embeds `financialData:{...}` (it is `void 0` there) and serves the
 * arrays under a new table payload with short keys (gp, opinc, netinccmn,
 * epsdil), while balance-sheet / cash-flow pages still embed
 * `financialData:{...}` but renamed several fields (retearn, netPPE,
 * currentLiabilities, ncfo, sbcomp).
 *
 * Instead of brace-matching one JSON object (fragile — chart config
 * strings contain braces), each array is pulled independently via a
 * `key:[...]` regex anchored on a word boundary. Scalar values inside
 * `ttm:{...}` / `prior:{...}` objects don't match because they are not
 * arrays.
 */
function extractSAArray(html: string, key: string): any[] | null {
    const re = new RegExp(`(?<![a-zA-Z0-9_])${key}:\\[([^\\]]*)\\]`);
    const m = html.match(re);
    if (!m) return null;
    try {
        // SvelteKit serializes decimals in (-1, 1) without a leading zero
        // (e.g. `.81993` or `-.25` in epsdil), which is invalid JSON.
        const normalized = m[1]!.replace(/(?<=^|,|-)\.(?=\d)/g, '0.');
        const parsed = JSON.parse(`[${normalized}]`);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

/** All statement arrays the SA fallback maps, across income/BS/CF pages. */
const SA_ARRAY_KEYS = [
    // income (new short keys + legacy)
    'revenue', 'gp', 'opinc', 'netinccmn', 'epsdil', 'netIncome', 'ebit', 'operatingIncome', 'grossProfit',
    'sharesDiluted', 'sharesBasic', 'sbc', 'income_statement_interest_expense', 'interestexpense',
    // balance sheet
    'assets', 'liabilities', 'assetsc', 'currentLiabilities', 'liabilitiesc',
    'retearn', 'balance_sheet_retained_earnings', 'equity', 'debt', 'totalcash', 'cashneq',
    'netPPE', 'balance_sheet_net_property_plant_and_equipment', 'sharesOutTotalCommon',
    // cash flow
    'ncfo', 'cfo', 'capex', 'cash_flow_statement_capital_expenditure', 'sbcomp',
];

function extractSACurrency(html: string): string | null {
    return html.match(/currency:"([A-Z]{3})"/)?.[1] ?? null;
}

function extractSAFinancialData(html: string): SAData | null {
    const datekey = extractSAArray(html, 'datekey');
    if (!datekey || datekey.length === 0) return null;
    const data: SAData = { datekey, fiscalYear: [], fiscalQuarter: [] };
    data.fiscalYear = extractSAArray(html, 'fiscalYear') ?? [];
    data.fiscalQuarter = extractSAArray(html, 'fiscalQuarter') ?? [];
    const saCurrency = extractSACurrency(html);
    if (saCurrency) data.currency = saCurrency;
    for (const key of SA_ARRAY_KEYS) {
        const arr = extractSAArray(html, key);
        if (arr) data[key] = arr;
    }
    return data;
}

async function fetchSAData(symbol: string, statement: string, quarterly = false): Promise<SAData | null> {
    const url = `${SA_BASE}/${symbol.toLowerCase()}/financials/${statement}/${quarterly ? '?p=quarterly' : ''}`;
    try {
        const resp = await fetch(url, { headers: SA_HEADERS });
        if (!resp.ok) {
            console.log(`[syncFinancials] SA ${symbol}/${statement || 'income'}: HTTP ${resp.status}`);
            return null;
        }
        const html = await resp.text();
        const data = extractSAFinancialData(html);
        if (!data) {
            console.log(`[syncFinancials] SA ${symbol}/${statement || 'income'}: no arrays extracted (${html.length} bytes)`);
        }
        return data;
    } catch (e: any) {
        console.log(`[syncFinancials] SA ${symbol}/${statement || 'income'}: fetch error: ${e?.message}`);
        return null;
    }
}

function saNumArr(data: SAData | null, key: string, i: number): number | null {
    if (!data?.[key] || i < 0) return null;
    const v = data[key][i];
    if (v === null || v === undefined || isNaN(v)) return null;
    return Number(v);
}

interface SaStmtData {
    endDate: Date;
    revenue: number | null;
    netIncome: number | null;
    ebit: number | null;
    grossProfit: number | null;
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
    totalDebt: number | null;
    cashAndEquivalents: number | null;
    netPPE: number | null;
}

function absOrNull(v: number | null): number | null {
    return v === null ? null : Math.abs(v);
}

function firstNum(data: SAData | null, keys: string[], i: number): number | null {
    if (!data) return null;
    for (const k of keys) {
        const v = saNumArr(data, k, i);
        if (v !== null) return v;
    }
    return null;
}

/** Index of a (datekey) inside an SA page payload, for cross-page joins. */
function saIndexByDate(data: SAData | null): Map<string, number> {
    const m = new Map<string, number>();
    if (!data) return m;
    data.datekey.forEach((d, i) => { if (d) m.set(String(d), i); });
    return m;
}

/** Sum a flow key over quarters Q1..q of one fiscal year (YTD conversion).
 *  Uses the page's own fiscalYear/fiscalQuarter arrays. */
function saYtdSum(data: SAData | null, keys: string[], upToQuarter: string, fiscalYear: number): number | null {
    if (!data) return null;
    const order = ['Q1', 'Q2', 'Q3'];
    const wanted = order.slice(0, order.indexOf(upToQuarter) + 1);
    let sum = 0;
    let found = false;
    for (let i = 0; i < data.datekey.length; i++) {
        if (parseInt(data.fiscalYear[i] ?? '', 10) !== fiscalYear) continue;
        if (!wanted.includes(data.fiscalQuarter[i] ?? '')) continue;
        for (const k of keys) {
            const v = saNumArr(data, k, i);
            if (v !== null) { sum += v; found = true; break; }
        }
    }
    return found ? sum : null;
}

export async function mergeSAPage(
    symbol: string,
    income: SAData,
    balance: SAData | null,
    cashflow: SAData | null,
    opts: { quarterly: boolean; gapfill: boolean; trustedShares?: number | null },
): Promise<{ inserted: number; updated: number }> {
    const balIdx = saIndexByDate(balance);
    const cfIdx = saIndexByDate(cashflow);
    let inserted = 0;
    let updated = 0;

    for (let i = 0; i < income.datekey.length; i++) {
        const dateStr = income.datekey[i]!;
        if (dateStr === 'TTM') continue;
        const fiscalYear = parseInt(income.fiscalYear[i] ?? '', 10);
        const fiscalQuarter = income.fiscalQuarter[i] ?? 'FY';
        if (!fiscalYear) continue;
        // Quarterly page Q4 rows would collide with the FY row convention —
        // annual page supplies FY periods instead.
        if (opts.quarterly && (fiscalQuarter === 'Q4' || fiscalQuarter === 'FY')) continue;
        const fiscalPeriod = (fiscalQuarter === 'Q4' || fiscalQuarter === 'FY') ? 'FY' : fiscalQuarter;
        const endDate = new Date(dateStr + 'T00:00:00Z');

        const bi = balIdx.get(dateStr);
        const ci = cfIdx.get(dateStr);
        // Discrete SA value on the row's own index (for shares derivation).
        const niDiscrete = saNumArr(income, 'netinccmn', i);
        const epsdil = saNumArr(income, 'epsdil', i);
        const sharesFromEps = niDiscrete !== null && epsdil !== null && epsdil > 0 ? niDiscrete / epsdil : null;
        const sharesDirect = saNumArr(income, 'sharesDiluted', i) ?? saNumArr(income, 'sharesBasic', i);

        const qd = opts.quarterly;
        const stmtData: SaStmtData = {
            endDate,
            revenue: qd ? saYtdSum(income, ['revenue'], fiscalQuarter, fiscalYear) : saNumArr(income, 'revenue', i),
            netIncome: qd ? saYtdSum(income, ['netinccmn'], fiscalQuarter, fiscalYear) : niDiscrete,
            ebit: qd ? saYtdSum(income, ['opinc'], fiscalQuarter, fiscalYear) : saNumArr(income, 'opinc', i),
            grossProfit: qd ? saYtdSum(income, ['gp'], fiscalQuarter, fiscalYear) : saNumArr(income, 'gp', i),
            operatingCashFlow: qd
                ? saYtdSum(cashflow, ['ncfo', 'cfo'], fiscalQuarter, fiscalYear)
                : firstNum(cashflow, ['ncfo', 'cfo'], ci ?? -1),
            // capex/sbc are stored as positive magnitudes (DB convention —
            // Finnhub XBRL tags are positive, SA raw values are negative
            // outflows). Mixed signs would collapse the TTM arithmetic.
            capex: absOrNull(qd
                ? saYtdSum(cashflow, ['capex', 'cash_flow_statement_capital_expenditure'], fiscalQuarter, fiscalYear)
                : firstNum(cashflow, ['capex', 'cash_flow_statement_capital_expenditure'], ci ?? -1)),
            sbc: absOrNull(qd
                ? saYtdSum(cashflow, ['sbcomp', 'sbc'], fiscalQuarter, fiscalYear)
                : firstNum(cashflow, ['sbcomp', 'sbc'], ci ?? -1)),
            interestExpense: qd ? saYtdSum(income, ['interestexpense'], fiscalQuarter, fiscalYear) : saNumArr(income, 'interestexpense', i),
            totalAssets: bi != null ? saNumArr(balance, 'assets', bi) : null,
            totalLiabilities: bi != null ? saNumArr(balance, 'liabilities', bi) : null,
            currentAssets: bi != null ? saNumArr(balance, 'assetsc', bi) : null,
            currentLiabilities: bi != null ? saNumArr(balance, 'currentLiabilities', bi) ?? saNumArr(balance, 'liabilitiesc', bi) : null,
            retainedEarnings: bi != null ? saNumArr(balance, 'retearn', bi) ?? saNumArr(balance, 'balance_sheet_retained_earnings', bi) : null,
            totalEquity: bi != null ? saNumArr(balance, 'equity', bi) : null,
            sharesOutstanding: sharesDirect ?? sharesFromEps ?? (bi != null ? saNumArr(balance, 'sharesOutTotalCommon', bi) : null),
            totalDebt: bi != null ? saNumArr(balance, 'debt', bi) : null,
            cashAndEquivalents: bi != null ? saNumArr(balance, 'totalcash', bi) ?? saNumArr(balance, 'cashneq', bi) : null,
            netPPE: bi != null ? saNumArr(balance, 'netPPE', bi) ?? saNumArr(balance, 'balance_sheet_net_property_plant_and_equipment', bi) : null,
        };

        if (!opts.gapfill) {
            // 'full' mode is still bound by the same rule as gapfill: an
            // existing non-null ebit is never rewritten by SA's adjusted
            // opinc. A ticker can transiently lose its revenue rows (which
            // is what makes 'full' mode reachable) without its previously
            // reported ebit ceasing to be valid — data protection must not
            // depend on how the caller was reached. Create + null-fill stay.
            const existing = await prisma.financialStatement.findUnique({
                where: { symbol_fiscalYear_fiscalPeriod: { symbol, fiscalYear, fiscalPeriod } },
                select: { ebit: true },
            });
            const updateData: Record<string, any> = { ...stmtData };
            if (existing?.ebit != null) delete updateData.ebit;
            await prisma.financialStatement.upsert({
                where: { symbol_fiscalYear_fiscalPeriod: { symbol, fiscalYear, fiscalPeriod } },
                update: updateData,
                create: { symbol, period: fiscalPeriod, fiscalYear, fiscalPeriod, ...stmtData },
            });
            inserted++;
            continue;
        }

        const existing = await prisma.financialStatement.findUnique({
            where: { symbol_fiscalYear_fiscalPeriod: { symbol, fiscalYear, fiscalPeriod } },
        });

        if (!existing) {
            await prisma.financialStatement.create({
                data: { symbol, period: fiscalPeriod, fiscalYear, fiscalPeriod, ...stmtData },
            });
            inserted++;
            continue;
        }

        // Existing row: fill null fields; also repair two known corruptions:
        // 1. capex < 0 (legacy SA scrape before datekey indexing — shifted
        //    the "TTM" BS/CF column into FY25 and stored negative capex)
        // 2. integer-EPS-derived sharesOutstanding (GOOGL FY22=ni/4, FY23=ni/5)
        const patch: Record<string, any> = {};
        const legacyShiftedRow = existing.capex !== null && existing.capex < 0;
        for (const [k, v] of Object.entries(stmtData)) {
            if (k === 'endDate' || k === 'ebit') continue;
            if (v !== null && ((existing as any)[k] === null || legacyShiftedRow)) {
                patch[k] = v;
            }
        }
        if (stmtData.sharesOutstanding !== null
            && existing.sharesOutstanding !== null
            && isSuspiciousShareCount(existing.sharesOutstanding, existing.netIncome, opts.trustedShares)) {
            patch.sharesOutstanding = stmtData.sharesOutstanding;
        }
        // ebit: NULL-FILL ONLY. The former >50% divergence repair is removed —
        // it could not distinguish a fabricated stored value from a REPORTED
        // XBRL OperatingIncomeLoss, and SA's opinc is an adjusted basis that
        // excludes one-time items (T FY2022: reported −4.59B incl. a $27.5B
        // goodwill impairment vs SA +28.35B adjusted — the repair swapped a
        // valid GAAP number for a different accounting concept). Without
        // persisted per-row provenance, an existing ebit is never rewritten.
        const saEbit = stmtData.ebit;
        if (saEbit !== null && existing.ebit === null) {
            patch.ebit = saEbit;
        }
        if (Object.keys(patch).length > 0) {
            await prisma.financialStatement.update({
                where: { symbol_fiscalYear_fiscalPeriod: { symbol, fiscalYear, fiscalPeriod } },
                data: patch,
            });
            updated++;
        }
    }
    return { inserted, updated };
}

type SaMode = 'full' | 'gapfill';

/**
 * stockanalysis.com merge.
 *  - mode 'full': Finnhub produced nothing → upsert every row (ADR/foreign path).
 *  - mode 'gapfill': Finnhub lags (latest quarterly stale) → insert only
 *    missing periods, fill null fields, and repair wildly divergent `ebit`.
 */
async function syncFromStockAnalysis(symbol: string, mode: SaMode = 'full', trustedShares: number | null = null): Promise<number> {
    const gapfill = mode === 'gapfill';
    const [incomeA, balanceA, cashflowA, incomeQ, balanceQ, cashflowQ] = await Promise.all([
        fetchSAData(symbol, ''),
        fetchSAData(symbol, 'balance-sheet'),
        fetchSAData(symbol, 'cash-flow-statement'),
        fetchSAData(symbol, '', true),
        fetchSAData(symbol, 'balance-sheet', true),
        fetchSAData(symbol, 'cash-flow-statement', true),
    ]);
    if (!incomeA && !incomeQ) return 0;

    // SA serves statements in the company's reporting currency (e.g. TSM in
    // TWD). FinancialStatement rows imply USD — skip non-USD companies
    // rather than store mislabeled numbers.
    const currency = incomeA?.currency ?? incomeQ?.currency;
    if (currency && currency !== 'USD') {
        console.log(`[syncFinancials] ${symbol}: SA statements are ${currency}, skipping (USD-only storage)`);
        return 0;
    }

    await prisma.ticker.upsert({
        where: { symbol },
        update: {},
        create: { symbol, name: symbol },
    });

    let touched = 0;
    if (incomeA) {
        const r = await mergeSAPage(symbol, incomeA, balanceA, cashflowA, { quarterly: false, gapfill, trustedShares });
        touched += r.inserted + r.updated;
    }
    if (incomeQ) {
        const r = await mergeSAPage(symbol, incomeQ, balanceQ, cashflowQ, { quarterly: true, gapfill, trustedShares });
        touched += r.inserted + r.updated;
    }
    return touched;
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

/** Match a concept by its suffix regardless of taxonomy prefix — catches
 *  company-specific tags like `psx_CapitalExpendituresAndInvestments`. */
function extractByConceptSuffix(report: any, section: string, suffixes: string[]): number | null {
    const list = report[section] || [];
    for (const suffix of suffixes) {
        const found = list.find((item: any) => item.concept?.endsWith(suffix) && isValidValue(item.value));
        if (found) return found.value;
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

    // Finnhub has no OperatingIncomeLoss tag for many reporters (PSX) —
    // their stored ebit is fabricated (GP−SGA etc.) and needs periodic
    // SA verification even after the quarterly gap closes.
    let ebitNeedsSaVerify = false;
    // Newest quarterly endDate Finnhub offered this run — persisted on
    // Ticker so the integrity check can flag "provider has newer than DB".
    let providerPeriodEnd: Date | null = null;
    // Rows where interestExpense was filled from cash InterestPaidNet
    // (no accrual tag) — logged after the loop for identification.
    const cashInterestFallbackRows: string[] = [];

    try {
        // Ensure Ticker row exists (FK requirement for FinancialStatement)
        await prisma.ticker.upsert({
            where: { symbol },
            update: {},
            create: { symbol, name: symbol },
        });

        // Corroboration baseline for the EPS-derived shares fallback: share
        // counts drift slowly, so a derived count >40% off the trusted current
        // count (Ticker.sharesOutstanding — Finnhub profile, not XBRL) means
        // the EPS came from a mismatched context (PM: Finnhub reports EPS=1
        // for Q1'26 → ni/1 = 2.44B garbage vs real ~1.56B). Null beats garbage.
        const tickerRow = await prisma.ticker.findUnique({
            where: { symbol },
            select: { sharesOutstanding: true, lastMarketCap: true, lastPrice: true },
        });
        const trustedShares = (tickerRow?.sharesOutstanding && tickerRow.sharesOutstanding > 0)
            ? tickerRow.sharesOutstanding
            : (tickerRow?.lastMarketCap && tickerRow.lastMarketCap > 0 && tickerRow?.lastPrice && tickerRow.lastPrice > 0
                ? tickerRow.lastMarketCap * 1e9 / tickerRow.lastPrice
                : null);

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
                if (timeframe === 'quarterly') {
                    const d = new Date(endDate);
                    if (!providerPeriodEnd || d > providerPeriodEnd) providerPeriodEnd = d;
                }

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
                
                // EBIT = OPERATING income only. The pretax-income XBRL tag
                // (IncomeLossFromContinuingOperationsBeforeIncomeTaxes…)
                // is deliberately NOT a fallback — it silently promoted
                // pretax income (incl. equity earnings, gains, interest
                // income) to "EBIT" (PSX FY25 stored 13.8B vs real opinc
                // ~3.8B → op margin 10.7% vs real ~4%).
                let ebit = extract(report, 'ic', [
                    'us-gaap_OperatingIncomeLoss',
                    'us-gaap_OperatingIncomeLossFromContinuingOperations',
                    // Without prefix
                    'OperatingIncomeLoss'
                ]);
                // True only when EBIT came from a real OperatingIncomeLoss
                // tag. Fabricated fallbacks (GP−RnD−SGA, revenue−costs) must
                // not clobber an existing SA-verified value on re-sync —
                // Finnhub often lacks the opinc tag entirely (PSX).
                const ebitIsReported = ebit !== null;
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
                    'us-gaap_PaymentsToAcquireOtherProductiveAssets',
                    'us-gaap_PaymentsToAcquireOilAndGasPropertyAndEquipment',
                    'us-gaap_PaymentsToAcquireOilAndGasProperty',
                    'us-gaap_PaymentsToAcquireFurnitureAndFixtures',
                    'us-gaap_PaymentsToDevelopRealEstateAssetsAndPaymentsForCapitalExpenditures',
                    'us-gaap_PaymentsToAcquireFixedAssets',
                    'us-gaap_CapitalExpenditureIncurredForPropertyPlantAndEquipment',
                    // Without prefix
                    'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets',
                    'CapitalExpenditureIncurredForPropertyPlantAndEquipment'
                ]) ?? extractByConceptSuffix(report, 'cf', [
                    // Company-specific taxonomy (PSX files capex as
                    // psx_CapitalExpendituresAndInvestments).
                    'CapitalExpendituresAndInvestments',
                    'PaymentsForCapitalImprovements',
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

                let sharesOutstandingRaw = extract(report, 'bs', ['dei_EntityCommonStockSharesOutstanding'])
                    ?? extract(report, 'ic', [
                        'us-gaap_WeightedAverageNumberOfDilutedSharesOutstanding', 'us-gaap_WeightedAverageNumberOfSharesOutstandingBasic'
                    ]);

                // Fallback: derive shares from NetIncome / EPS (e.g. GOOGL reports EPS but not shares count).
                // Skip integer-truncated EPS values (Finnhub rounds GOOGL FY22 EPS=4, FY23 EPS=5,
                // which fabricates ~15B shares vs real ~13B) and allow common split multiples so
                // pre-split filings (e.g. 20:1 split) aren't discarded against today's trustedShares.
                if (sharesOutstandingRaw === null || sharesOutstandingRaw <= 0) {
                    const eps = extract(report, 'ic', [
                        'us-gaap_EarningsPerShareDiluted', 'us-gaap_EarningsPerShareBasic'
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

                // Accrual interest expense first (ic section). Some issuers
                // report it under Nonoperating/Operating variants — KKR
                // switched tags between FY23 (us-gaap_InterestExpense) and
                // FY24-25 (us-gaap_InterestExpenseNonoperating), so a narrow
                // list silently wrote null for valid years. Last tier: cash
                // interest paid from the cf section — a DIFFERENT basis
                // (cash paid, not the accrual charge). It is written into the
                // same column only when no accrual tag exists, and the
                // affected rows are logged below so cash-basis values stay
                // separately identifiable (a real provenance column is a
                // Phase-2 schema decision).
                const interestExpenseAccrual = extract(report, 'ic', [
                    'us-gaap_InterestExpense', 'us-gaap_InterestExpenseDebt',
                    'us-gaap_InterestExpenseNonoperating', 'us-gaap_InterestExpenseOperating',
                ]);
                const interestExpense = interestExpenseAccrual
                    ?? extract(report, 'cf', ['us-gaap_InterestPaidNet']);
                if (interestExpenseAccrual === null && interestExpense !== null) {
                    cashInterestFallbackRows.push(`${fiscalPeriod}${fiscalYear}`);
                }
                
                const longTermDebt = extract(report, 'bs', [
                    'us-gaap_LongTermDebtNoncurrent', 'us-gaap_LongTermDebtAndCapitalLeaseObligations', 'us-gaap_LongTermDebt',
                    'us-gaap_LongTermDebtFairValue', 'us-gaap_LongTermLineOfCredit',
                    'us-gaap_LongTermNotesPayable', 'us-gaap_ConvertibleDebtNoncurrent',
                    'us-gaap_SeniorNotesNetOfDebtIssuanceCosts', 'us-gaap_SecuredDebt',
                    // Without prefix
                    'LongTermDebtNoncurrent', 'LongTermDebt'
                ]);
                const shortTermDebt = extract(report, 'bs', [
                    'us-gaap_DebtCurrent', 'us-gaap_ShortTermBorrowings', 'us-gaap_LongTermDebtAndCapitalLeaseObligationsCurrent',
                    'us-gaap_CommercialPaper', 'us-gaap_ShortTermDebt',
                    'us-gaap_NotesPayableCurrent',
                    // Without prefix
                    'DebtCurrent', 'ShortTermBorrowings'
                ]);
                let totalDebt = null;
                if (longTermDebt !== null || shortTermDebt !== null) {
                    totalDebt = (longTermDebt || 0) + (shortTermDebt || 0);
                }
                // Fallback: try direct total debt concept. Combined/tag-ambiguous
                // forms (NotesPayable, DebtInstrumentCarryingAmount) carry both
                // tranches for some filers (e.g. PCAR). They precede the legacy
                // LiabilitiesNoncurrent catch-all — which is NOT debt (it adds
                // deferred revenue/tax) but is kept last to preserve existing
                // semantics for tickers that previously resolved through it.
                if (totalDebt === null) {
                    totalDebt = extract(report, 'bs', [
                        'us-gaap_DebtLongtermAndShorttermCombined', 'us-gaap_DebtAndCapitalLeaseObligations',
                        'us-gaap_LongTermDebtAndShortTermDebt', 'us-gaap_DebtInstrumentCarryingAmount',
                        'us-gaap_NotesPayable', 'us-gaap_LiabilitiesNoncurrent',
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

                const existing = await prisma.financialStatement.findUnique({
                    where: { symbol_fiscalYear_fiscalPeriod: { symbol, fiscalYear, fiscalPeriod } },
                    select: { ebit: true },
                });
                // Fabricated ebit (not OperatingIncomeLoss) may not replace
                // an existing value — SA gapfill repairs would regress on
                // every re-sync. Reported ebit and null-fills still write.
                const writeEbit = ebitIsReported || existing?.ebit == null;
                if (ebit !== null && !ebitIsReported) ebitNeedsSaVerify = true;

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
                        revenue, netIncome, operatingCashFlow,
                        capex: absOrNull(capex),
                        totalAssets, totalLiabilities, currentAssets, currentLiabilities,
                        retainedEarnings, totalEquity, sharesOutstanding,
                        sbc: absOrNull(sbc), interestExpense, totalDebt, cashAndEquivalents, grossProfit, netPPE,
                        ...(writeEbit ? { ebit } : {}),
                    },
                    create: {
                        symbol, period: fiscalPeriod, endDate: new Date(endDate),
                        fiscalYear, fiscalPeriod,
                        revenue, netIncome, ebit, operatingCashFlow,
                        capex: absOrNull(capex),
                        totalAssets, totalLiabilities, currentAssets, currentLiabilities,
                        retainedEarnings, totalEquity, sharesOutstanding,
                        sbc: absOrNull(sbc), interestExpense, totalDebt, cashAndEquivalents, grossProfit, netPPE
                    }
                });
            }
        }
    } catch (error) {
        console.error(`Error syncing financials mapping via Finnhub for ${symbol}:`, error);
        throw error;
    }

    if (cashInterestFallbackRows.length > 0) {
        console.log(`[syncFinancials] ${symbol}: interestExpense cash-basis fallback (InterestPaidNet, not accrual) on: ${cashInterestFallbackRows.join(', ')}`);
    }

    // Fallback: if Finnhub produced no usable statements (ADR/foreign
    // tickers, or rows that exist but carry no revenue at all), scrape
    // stockanalysis.com fully. If Finnhub data EXISTS but is stale (its
    // reported filings lag ~1 quarter behind SEC — PSX Q2'26 filed Aug-5
    // still absent in Oct), gap-fill missing periods + null fields instead.
    const stmtsWithRevenue = await prisma.financialStatement.count({
        where: { symbol, revenue: { not: null } },
    });
    if (stmtsWithRevenue === 0) {
        const saCount = await syncFromStockAnalysis(symbol, 'full');
        console.log(`[syncFinancials] ${symbol}: SA fallback rows=${saCount}`);
        if (saCount > 0) {
            console.log(`[syncFinancials] ${symbol}: Finnhub had 0 statements, scraped ${saCount} from stockanalysis.com`);
        }
        await recordFundamentalsFreshness(symbol, providerPeriodEnd);
        return;
    }

    const latestQuarterly = await prisma.financialStatement.findFirst({
        where: { symbol, fiscalPeriod: { not: 'FY' } },
        orderBy: { endDate: 'desc' },
        select: { endDate: true, totalAssets: true, totalEquity: true },
    });
    const fyRows = await prisma.financialStatement.findMany({
        where: { symbol, fiscalPeriod: 'FY' },
        orderBy: { endDate: 'desc' },
        take: 6,
        select: { sharesOutstanding: true, netIncome: true, capex: true },
    });
    const tickerSharesRow = await prisma.ticker.findUnique({
        where: { symbol },
        select: { sharesOutstanding: true },
    });
    const trustedForGap = tickerSharesRow?.sharesOutstanding ?? null;
    const STALE_MS = 100 * 24 * 60 * 60 * 1000; // ~1 quarter + reporting lag
    // Missing quarterly rows also count as stale — Finnhub can carry annuals
    // but only pre-history quarterlies (GOOG: 2011-12 filings, pre-Alphabet),
    // leaving TTM on stale FY data while a sibling class (GOOGL) computes a
    // real TTM. Also gapfill when the latest quarter lacks a balance sheet
    // (GOOGL Q1/Q2'26 in Finnhub) or FY rows have missing/corrupt shares or
    // legacy negative capex.
    const staleQuarterly = !latestQuarterly || Date.now() - latestQuarterly.endDate.getTime() > STALE_MS;
    const missingQuarterlyBs = !!latestQuarterly && latestQuarterly.totalAssets == null && latestQuarterly.totalEquity == null;
    const fyNeedsRepair = fyRows.some(r =>
        r.sharesOutstanding == null
        || (r.capex !== null && r.capex < 0)
        || isSuspiciousShareCount(r.sharesOutstanding, r.netIncome, trustedForGap)
    );
    if (staleQuarterly || missingQuarterlyBs || fyNeedsRepair || ebitNeedsSaVerify) {
        const saCount = await syncFromStockAnalysis(symbol, 'gapfill', trustedForGap);
        if (saCount > 0) {
            console.log(`[syncFinancials] ${symbol}: SA gapfill touched ${saCount} rows (staleQ=${staleQuarterly}, missingBs=${missingQuarterlyBs}, fyRepair=${fyNeedsRepair}, ebitVerify=${ebitNeedsSaVerify})`);
        }
    }
    await recordFundamentalsFreshness(symbol, providerPeriodEnd);
}

/** Persist the freshness bookkeeping columns — runs on every syncFinancials
 *  exit path. providerPeriodEnd = newest quarterly period known to be
 *  available to us (Finnhub offer ∪ post-sync DB latest, which reflects the
 *  SA scrape when gapfill/full ran). The daily integrity check derives
 *  fresh/stale/no-newer-filing from it. */
async function recordFundamentalsFreshness(symbol: string, providerEnd: Date | null): Promise<void> {
    try {
        const latestQ = await prisma.financialStatement.findFirst({
            where: { symbol, fiscalPeriod: { not: 'FY' } },
            orderBy: { endDate: 'desc' },
            select: { endDate: true },
        });
        const candidates = [providerEnd, latestQ?.endDate ?? null].filter((d): d is Date => d instanceof Date);
        const best = candidates.length ? new Date(Math.max(...candidates.map(d => d.getTime()))) : null;
        await prisma.ticker.update({
            where: { symbol },
            data: {
                providerPeriodEnd: best,
                fundamentalsCheckedAt: new Date(),
            },
        });
    } catch (e) {
        console.warn(`[syncFinancials] ${symbol}: freshness bookkeeping failed:`, e instanceof Error ? e.message : e);
    }
}
