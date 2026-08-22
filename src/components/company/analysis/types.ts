/**
 * Shared types for the Analysis tab.
 *
 * Centralizing these here breaks circular dependencies between
 * AnalysisTab.tsx, useAnalysis.ts, AnalysisCharts.tsx, and sub-components.
 */

// ── Financial statement (shared across all chart components) ────────────────

export interface FinancialStatement {
    id: string;
    symbol: string;
    period: string;
    endDate: string;
    fiscalYear: number;
    fiscalPeriod: string;
    revenue: number | null;
    netIncome: number | null;
    ebit: number | null;
    grossProfit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    totalDebt: number | null;
    cashAndEquivalents: number | null;
    sharesOutstanding: number | null;
    sbc: number | null;
}

// ── Valuation percentile stats ──────────────────────────────────────────────

export interface RatioStats {
    avg: number;
    p10: number;
    p25: number;
    median: number;
    p75: number;
    p90: number;
    min: number;
    max: number;
    count: number;
}

// ── Computed analysis metrics ───────────────────────────────────────────────

export interface AnalysisMetrics {
    zScore: number | null;
    altmanZ: number | null;
    debtRepaymentTime: number | null;
    debtRepaymentYears: number | null;
    fcfYield: number | null;
    currentEps: number | null;
    currentPe: number | null;
    forwardPe: number | null;
    forwardEps: number | null;
    forwardImpliedGrowth: number | null;
    fcfMargin: number | null;
    fcfConversion: number | null;
}

// ── Valuation summary (undervaluation %) ────────────────────────────────────

export interface ValuationSummary {
    currentUndervaluation: number | null;
    avg5yUndervaluation: number | null;
    intrinsicCagr: number | null;
}

// ── Ticker info embedded in AnalysisData ────────────────────────────────────

export interface TickerInfo {
    name: string | null;
    description: string | null;
    websiteUrl: string | null;
    logoUrl: string | null;
    sector: string | null;
    industry: string | null;
    employees: number | null;
    lastPrice: number | null;
    lastMarketCap: number | null;
    lastChangePct: number | null;
    lastMarketCapDiff: number | null;
    headquarters: string | null;
    lastPriceUpdated: string | null;
    latestPrevClose: number | null;
}

// ── Balance sheet summary ───────────────────────────────────────────────────

export interface BalanceSheetSummary {
    totalDebt: number | null;
    cash: number | null;
    netDebt: number | null;
    totalEquity: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    currentAssets: number | null;
    currentLiabilities: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    assetToLiability: number | null;
    netDebtToEbit: number | null;
    sbc: number | null;
    sbcRatio: number | null;
    sharesOutstanding: number | null;
    dilution1y: number | null;
    dilution5y: number | null;
}

// ── TTM (Trailing Twelve Months) ────────────────────────────────────────────

export interface TTMData {
    netIncome: number | null;
    revenue: number | null;
    ebit: number | null;
    grossProfit: number | null;
}

// ── Correlation ─────────────────────────────────────────────────────────────

export interface CorrelationData {
    priceVsImpliedPS: number | null;
    priceVsImpliedPE: number | null;
}

// ── Finnhub pre-computed metrics ────────────────────────────────────────────

export interface FinnhubMetrics {
    peRatio: number | null;
    forwardPe: number | null;
    pbRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roe: number | null;
    roa: number | null;
    roic: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    debtEquityRatio: number | null;
    interestCoverage: number | null;
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    revenuePerShare: number | null;
    netIncomePerShare: number | null;
    bookValuePerShare: number | null;
    freeCashFlowPerShare: number | null;
    dividendYield: number | null;
    payoutRatio: number | null;
    beta: number | null;
    pegRatio: number | null;
    priceFreeCashFlow: number | null;
}

// ── Main AnalysisData payload ───────────────────────────────────────────────

export interface AnalysisData {
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    verdictText: string | null;
    updatedAt: string;
    metrics: AnalysisMetrics;
    statements?: FinancialStatement[];
    peers?: string[];
    piotroskiScore?: number | null;
    beneishScore?: number | null;
    interestCoverage?: number | null;
    revenueCagr?: number | null;
    netIncomeCagr?: number | null;
    humanDebtInfo?: string | null;
    humanPeInfo?: string | null;
    marginStability?: number | null;
    negativeNiYears?: number | null;
    ticker?: TickerInfo | null;
    balanceSheet?: BalanceSheetSummary | null;
    ttm?: TTMData | null;

    // Correlation / valuation extras (from /history endpoint)
    priceHistory?: { date: string; price: number }[];
    impliedPricePS?: { date: string; impliedPrice: number }[];
    impliedPricePE?: { date: string; impliedPrice: number }[];
    correlation?: CorrelationData;

    // Valuation history (intrinsic vs price)
    valuationHistory?: { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[];
    valuationHistoryPE?: { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[];
    valuationHistoryPS?: { date: string; price: number; intrinsic: number; undervaluationPct: number | null }[];
    valuationSummary?: ValuationSummary | null;
    valuationSummaryPE?: ValuationSummary | null;
    valuationSummaryPS?: ValuationSummary | null;
    valuationForecast?: { date: string; intrinsic: number }[];
    valuationForecastPE?: { date: string; intrinsic: number }[];
    valuationForecastPS?: { date: string; intrinsic: number }[];

    // Valuation charts (P/E & P/S bands)
    peHistory?: { date: string; value: number }[];
    psHistory?: { date: string; value: number }[];
    valuationCurrent?: { pe: number | null; ps: number | null } | null;
    valuationStats?: { pe: RatioStats | null; ps: RatioStats | null } | null;

    // EPS CAGR (historical, from per-share earnings history)
    epsCagr3y?: number | null;
    epsCagr5y?: number | null;

    // Finnhub pre-computed metrics (primary source for ratios)
    finnhub?: FinnhubMetrics | null;
}

// ── Component props ─────────────────────────────────────────────────────────

export interface AnalysisTabProps {
    ticker: string;
    hideSearch?: boolean;
}
