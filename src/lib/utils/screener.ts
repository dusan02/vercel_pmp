export interface ScreenerResult {
    symbol: string;
    /** 1Y closes downsampled to ~52 weekly points (null = no history). */
    sparkline: number[] | null;
    /** FinnhubMetrics fundamentals used by metric filters (null = no data). */
    metrics: {
        roe: number | null;
        roa: number | null;
        peRatio: number | null;
        forwardPe: number | null;
        psRatio: number | null;
        pbRatio: number | null;
        pegRatio: number | null;
        evEbitda: number | null;
        evSales: number | null;
        priceFreeCashFlow: number | null;
        grossMargin: number | null;
        operatingMargin: number | null;
        netMargin: number | null;
        revenueGrowth: number | null;
        earningsGrowth: number | null;
        dividendYield: number | null;
        payoutRatio: number | null;
        beta: number | null;
        currentRatio: number | null;
        quickRatio: number | null;
        debtEquityRatio: number | null;
        interestCoverage: number | null;
    } | null;
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    growthScore: number | null;
    qualityScore: number | null;
    overallScore: number | null;
    altmanZ: number | null;
    piotroskiScore: number | null;
    beneishScore: number | null;
    fcfMargin: number | null;
    fcfConversion: number | null;
    debtRepaymentYears: number | null;
    interestCoverage: number | null;
    revenueCagr: number | null;
    netIncomeCagr: number | null;
    marginStability: number | null;
    lastQualitySignalAt: string | null;
    // Insider activity aggregates (90d P/S window; null = no insider data)
    insiderNetBuyPct90d: number | null;
    insiderNetBuyValue90d: number | null;
    insiderLargestBuyValue90d: number | null;
    insiderLargestSellValue90d: number | null;
    insiderUniqueBuyers14d: number | null;
    insiderUniqueSellers14d: number | null;
    ticker: {
        name: string | null;
        sector: string | null;
        industry: string | null;
        logoUrl: string | null;
        lastPrice: number | null;
        lastChangePct: number | null;
        lastMarketCap: number | null;
        marketCapDiff: number | null;
    } | null;
}

// Market Cap filter presets (in billions)
export const MARKET_CAP_PRESETS = [
    { id: 'all',       label: 'All',         min: undefined, max: undefined },
    { id: 'mega',      label: 'Mega >$200B', min: 200,       max: undefined },
    { id: 'large',     label: 'Large $10-200B', min: 10,     max: 200 },
    { id: 'mid',       label: 'Mid $2-10B',  min: 2,         max: 10 },
    { id: 'small',     label: 'Small <$2B',  min: undefined, max: 2 },
] as const;

export interface ScreenerPagination {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface ScreenerResponse {
    results: ScreenerResult[];
    pagination: ScreenerPagination;
}

export const SECTORS = [
    'Technology', 'Healthcare', 'Financial Services', 'Consumer Cyclical',
    'Industrials', 'Communication Services', 'Consumer Defensive',
    'Energy', 'Utilities', 'Real Estate', 'Basic Materials', 'Other',
];

/**
 * FinnhubMetrics-backed range filters shown under "Metric filters".
 * bounds = slider range (UI), not data range — the API accepts any value.
 * DB coverage on prod (999 tickers): roe 988, pe 926, fpe 953, ps 991,
 * pb 987, peg 869, evEbitda 884, grossM 874, netM 991, revG 977, earnG 796,
 * divY 707 (null = non-payer), beta 998, curR 933, de 994, intCov 910.
 */
export const METRIC_FILTERS = [
    // Valuation
    { key: 'peRatio', label: 'P/E', min: 0, max: 100, step: 1, group: 'Valuation' },
    { key: 'forwardPe', label: 'Fwd P/E', min: 0, max: 80, step: 1, group: 'Valuation' },
    { key: 'psRatio', label: 'P/S', min: 0, max: 30, step: 1, group: 'Valuation' },
    { key: 'pbRatio', label: 'P/B', min: 0, max: 20, step: 1, group: 'Valuation' },
    { key: 'pegRatio', label: 'PEG', min: 0, max: 5, step: 0.1, group: 'Valuation' },
    { key: 'evEbitda', label: 'EV/EBITDA', min: 0, max: 60, step: 1, group: 'Valuation' },
    { key: 'evSales', label: 'EV/Sales', min: 0, max: 20, step: 0.5, group: 'Valuation' },
    { key: 'priceFreeCashFlow', label: 'P/FCF', min: 0, max: 100, step: 1, group: 'Valuation' },
    // Profitability
    { key: 'roe', label: 'ROE %', min: -50, max: 100, step: 1, group: 'Profitability' },
    { key: 'roa', label: 'ROA %', min: -30, max: 50, step: 1, group: 'Profitability' },
    { key: 'grossMargin', label: 'Gross Margin %', min: 0, max: 100, step: 1, group: 'Profitability' },
    { key: 'operatingMargin', label: 'Op Margin %', min: -50, max: 60, step: 1, group: 'Profitability' },
    { key: 'netMargin', label: 'Net Margin %', min: -50, max: 60, step: 1, group: 'Profitability' },
    // Growth
    { key: 'revenueGrowth', label: 'Rev Growth %', min: -50, max: 100, step: 1, group: 'Growth' },
    { key: 'earningsGrowth', label: 'EPS Growth %', min: -50, max: 100, step: 1, group: 'Growth' },
    // Dividends
    { key: 'dividendYield', label: 'Div Yield %', min: 0, max: 10, step: 0.1, group: 'Dividends' },
    { key: 'payoutRatio', label: 'Payout %', min: 0, max: 100, step: 1, group: 'Dividends' },
    // Balance sheet
    { key: 'debtEquityRatio', label: 'D/E', min: 0, max: 5, step: 0.1, group: 'Balance Sheet' },
    { key: 'currentRatio', label: 'Current Ratio', min: 0, max: 10, step: 0.1, group: 'Balance Sheet' },
    { key: 'quickRatio', label: 'Quick Ratio', min: 0, max: 5, step: 0.1, group: 'Balance Sheet' },
    { key: 'interestCoverage', label: 'Int. Coverage', min: 0, max: 50, step: 1, group: 'Balance Sheet' },
    // Risk
    { key: 'beta', label: 'Beta', min: 0, max: 4, step: 0.1, group: 'Risk' },
] as const;

export type MetricFilterKey = (typeof METRIC_FILTERS)[number]['key'];

/** Ordered group names for rendering METRIC_FILTERS by category. */
export const METRIC_GROUPS = [...new Set(METRIC_FILTERS.map((d) => d.group))];

/**
 * Insider-activity range filters (InsiderAggregate relation). Not rendered
 * as sliders — netBuyValue90d is in dollars (awkward slider bounds) — but
 * valid as preset/URL keys (net insider buying is a classic turnaround
 * tell: Turnarounds preset uses netBuyValue90d ≥ 0).
 */
export const INSIDER_RANGE_FILTERS = [
    { key: 'netBuyValue90d', label: 'Insider Net Buy $ (90d)', min: 0, max: 100_000_000, step: 1_000_000 },
    { key: 'netBuyPct90d', label: 'Insider Net Buy % (90d)', min: 0, max: 0.05, step: 0.001 },
] as const;

/**
 * Ticker-backed range filters (price / day change) — rendered in the main
 * filter grid, stored in the same metricRanges map. Param convention
 * matches the metric params (minPrice/maxPrice/minChangePct/maxChangePct).
 */
export const MARKET_RANGE_FILTERS = [
    { key: 'price', label: 'Price $', min: 0, max: 1000, step: 10 },
    { key: 'changePct', label: 'Day Change %', min: -20, max: 20, step: 0.5 },
] as const;

export type RangeFilterKey =
    | MetricFilterKey
    | (typeof MARKET_RANGE_FILTERS)[number]['key']
    | (typeof INSIDER_RANGE_FILTERS)[number]['key'];

export type RangeFilterSource = 'ticker' | 'finnhub' | 'insider';

/**
 * Unified range-filter registry — the single source of truth for which
 * min<Cap>/max<Cap> params the screener API accepts and which DB field each
 * maps to. `field` = DB column (defaults to key when omitted).
 * Route builds `{ tickerField | finnhubMetrics.is | insiderAggregate.is }`
 * filters by bucketing parsed ranges on `source`.
 */
export const RANGE_FILTERS: {
    key: RangeFilterKey; label: string;
    min: number; max: number; step: number;
    source: RangeFilterSource; field?: string;
}[] = [
    ...MARKET_RANGE_FILTERS.map((d) => ({
        ...d,
        source: 'ticker' as const,
        field: d.key === 'price' ? 'lastPrice' : 'lastChangePct',
    })),
    ...METRIC_FILTERS.map((d) => ({ ...d, source: 'finnhub' as const })),
    ...INSIDER_RANGE_FILTERS.map((d) => ({ ...d, source: 'insider' as const })),
];

/**
 * Stride-downsample a price series to at most `maxPoints` points.
 * Always keeps the first and last point (trend endpoints matter most for
 * a sparkline). Input is assumed oldest → newest.
 */
export function downsampleSeries(values: number[], maxPoints = 52): number[] {
    if (values.length <= maxPoints) return values.slice();
    const stride = Math.ceil(values.length / maxPoints);
    const pts = values.filter((_, i) => i % stride === 0);
    const last = values[values.length - 1]!;
    if (pts[pts.length - 1] !== last) pts.push(last);
    return pts;
}

/**
 * Quick-screen preset — score defaults + optional metric/market ranges.
 * `ranges` keys are RangeFilterKey (metric keys → FinnhubMetrics, plus
 * `price`/`changePct` → Ticker columns).
 */
export interface ScreenerPreset {
    minValue?: number; minGrowth?: number; minProfit?: number;
    minHealth?: number; minQuality?: number; minOverall?: number;
    minAltman?: number; minFcfMargin?: number;
    marketCapPreset?: string;
    sort?: string;
    ranges?: Partial<Record<RangeFilterKey, { min?: number; max?: number }>>;
}

/**
 * One-click screens. First group = score-based (AnalysisCache). Second group
 * = classic literature categories mapped onto our metric filters:
 *
 * - Value (Graham): P/E≤15, P/B≤1.5 (Graham's 15×1.5 rule), current
 *   ratio ≥1.5, positive earnings growth (Intelligent Investor ch.14).
 * - Dividend Growth: yield 1.5–6% (upper cap avoids yield traps), ROE≥12%,
 *   D/E≤1, EPS growth ≥5% (consensus dividend-growth screens).
 * - Fast Growers (Lynch): EPS growth ≥20%, revenue growth ≥15%, PEG≤2
 *   (One Up on Wall Street — 20–25% growers at a sane price).
 * - GARP: PEG≤1 (Lynch's signature ratio), EPS growth ≥10%, P/E 1–40.
 * - Asset Plays: P/B 0.1–1, P/S≤1.5, current ratio ≥1 — trading below book
 *   with enough liquidity to not be distressed.
 * - Turnarounds: P/S≤1 (beaten down), forward P/E 1–25 (market expects
 *   profits back), current ratio ≥1.5 (survivable), ranked by 90d insider
 *   buying — management buying the trough is the classic tell.
 * - Stalwarts (Lynch): EPS growth 8–20%, ROE≥12%, net margin ≥10% —
 *   large steady compounders, not explosive.
 */
export const QUICK_SCREENS: { label: string; tip?: string; group: 'score' | 'strategy'; preset: ScreenerPreset }[] = [
    { label: 'Quality Compounders', tip: 'Quality ≥80 · Profit ≥75 · Growth ≥60', group: 'score', preset: { minQuality: 80, minProfit: 75, minGrowth: 60, sort: 'qualityScore:desc' } },
    { label: 'Quality at Reasonable Price', tip: 'Quality ≥75 · Valuation ≥60', group: 'score', preset: { minQuality: 75, minValue: 60, sort: 'overallScore:desc' } },
    { label: 'Growth at Reasonable Price', tip: 'Growth ≥75 · Valuation ≥60', group: 'score', preset: { minGrowth: 75, minValue: 60, sort: 'growthScore:desc' } },
    { label: 'Strong Balance Sheets', tip: 'Health ≥80 · Altman Z ≥3', group: 'score', preset: { minHealth: 80, minAltman: 3, sort: 'healthScore:desc' } },
    { label: 'Cash Machines', tip: 'FCF margin ≥15% · Profit ≥60 · P/FCF ≤30 (cheap FCF)', group: 'score', preset: { minFcfMargin: 0.15, minProfit: 60, sort: 'overallScore:desc', ranges: { priceFreeCashFlow: { min: 0.1, max: 30 } } } },
    { label: 'Top Overall', tip: 'Overall score ≥75', group: 'score', preset: { minOverall: 75, sort: 'overallScore:desc' } },
    // Strategy screens — classic investor categories on raw fundamentals.
    // Floors (`min`) on valuation ratios exclude negative/nonsense values
    // (negative P/E = loss-maker, negative P/B = negative equity).
    { label: 'Value (Graham)', tip: 'P/E 1–15 · P/B 0.1–1.5 · Current ≥1.5 · EPS growth >0 · pays dividend', group: 'strategy', preset: { sort: 'valuationScore:desc', ranges: { peRatio: { min: 1, max: 15 }, pbRatio: { min: 0.1, max: 1.5 }, currentRatio: { min: 1.5 }, earningsGrowth: { min: 0 }, dividendYield: { min: 0.1 } } } },
    { label: 'Dividend Growth', tip: 'Yield 1.5–6% · Payout 0–75% · ROE ≥12% · D/E 0–1 · EPS growth ≥5%', group: 'strategy', preset: { sort: 'metrics.dividendYield:desc', ranges: { dividendYield: { min: 1.5, max: 6 }, payoutRatio: { min: 0, max: 75 }, roe: { min: 12 }, debtEquityRatio: { min: 0, max: 1 }, earningsGrowth: { min: 5 } } } },
    { label: 'Fast Growers (Lynch)', tip: 'EPS ≥20% · Rev ≥15% · PEG ≤2 · profitable · D/E ≤2', group: 'strategy', preset: { sort: 'metrics.earningsGrowth:desc', ranges: { earningsGrowth: { min: 20 }, revenueGrowth: { min: 15 }, pegRatio: { min: 0.1, max: 2 }, netMargin: { min: 0 }, debtEquityRatio: { min: 0, max: 2 } } } },
    { label: 'GARP (PEG<1)', tip: 'PEG 0–1 · EPS growth ≥10% · P/E 1–40', group: 'strategy', preset: { sort: 'metrics.pegRatio:asc', ranges: { pegRatio: { min: 0.01, max: 1 }, earningsGrowth: { min: 10 }, peRatio: { min: 1, max: 40 } } } },
    { label: 'Asset Plays', tip: 'P/B 0.1–1 · P/S ≤1.5 · Current ≥1 · D/E ≤3 (assets not buried in debt)', group: 'strategy', preset: { sort: 'metrics.pbRatio:asc', ranges: { pbRatio: { min: 0.1, max: 1 }, psRatio: { min: 0, max: 1.5 }, currentRatio: { min: 1 }, debtEquityRatio: { min: 0, max: 3 } } } },
    { label: 'Turnarounds', tip: 'P/S ≤1 · Fwd P/E 1–25 · Current ≥1.5 · insiders net-buying', group: 'strategy', preset: { sort: 'insider.netBuyValue90d:desc', ranges: { psRatio: { min: 0, max: 1 }, forwardPe: { min: 1, max: 25 }, currentRatio: { min: 1.5 }, netBuyValue90d: { min: 0 } } } },
    { label: 'Stalwarts (Lynch)', tip: 'EPS growth 8–20% · ROE ≥12% · Net margin ≥10% · Beta ≤1.4', group: 'strategy', preset: { sort: 'overallScore:desc', ranges: { earningsGrowth: { min: 8, max: 20 }, roe: { min: 12 }, netMargin: { min: 10 }, beta: { min: 0, max: 1.4 } } } },
    { label: 'Slow Growers (Lynch)', tip: 'Yield 2–9% · EPS growth 0–8% · Beta ≤1.2 — dividend payers', group: 'strategy', preset: { sort: 'metrics.dividendYield:desc', ranges: { dividendYield: { min: 2, max: 9 }, earningsGrowth: { min: 0, max: 8 }, beta: { min: 0, max: 1.2 } } } },
];

/**
 * Serialize a quick-screen preset to the /screener query string. Same
 * serialization the hook produces (min<Cap>/max<Cap> convention) — used for
 * leaderboard → screener deep links and tests.
 */
// ─── Saved-screen param validation (shared: API route + tests) ────────────

const SCORE_PARAMS = new Set([
    'minHealth', 'maxHealth', 'minProfit', 'maxProfit', 'minValue', 'maxValue',
    'minGrowth', 'maxGrowth', 'minQuality', 'maxQuality', 'minOverall', 'maxOverall',
    'minAltman', 'minPiotroski', 'maxBeneish', 'minFcfMargin', 'maxDebtRepayment',
]);
const RANGE_PARAMS = new Set(
    RANGE_FILTERS.flatMap((f) => {
        const cap = f.key[0]!.toUpperCase() + f.key.slice(1);
        return [`min${cap}`, `max${cap}`];
    })
);
const STRING_PARAMS = new Set(['sector', 'industry', 'q', 'mcap', 'sort']);
const SORT_RE = /^[a-zA-Z0-9.]+:(asc|desc)$/;

/**
 * Validate a serialized screener query string for storage. Every key must be
 * a known filter param, numeric values must parse finite, string params are
 * length-capped — saved params feed straight into URLSearchParams on restore.
 */
export function isValidScreenParams(qs: string): boolean {
    if (qs.length === 0 || qs.length > 2000) return false;
    let sp: URLSearchParams;
    try {
        sp = new URLSearchParams(qs);
    } catch {
        return false;
    }
    for (const [key, value] of sp) {
        if (SCORE_PARAMS.has(key) || RANGE_PARAMS.has(key)) {
            if (value === '' || !Number.isFinite(Number(value))) return false;
        } else if (key === 'sort') {
            if (!SORT_RE.test(value)) return false;
        } else if (STRING_PARAMS.has(key)) {
            if (value.length > 100) return false;
        } else {
            return false;
        }
    }
    return true;
}

export function presetToQueryString(p: ScreenerPreset): string {
    const sp = new URLSearchParams();
    const set = (k: string, v: number | undefined, def: number) => {
        if (v !== undefined && v !== def) sp.set(k, String(v));
    };
    set('minValue', p.minValue, 0);
    set('minGrowth', p.minGrowth, 0);
    set('minProfit', p.minProfit, 0);
    set('minHealth', p.minHealth, 0);
    set('minQuality', p.minQuality, 0);
    set('minOverall', p.minOverall, 0);
    if (p.minAltman != null && p.minAltman > 0) sp.set('minAltman', String(p.minAltman));
    if (p.minFcfMargin != null && p.minFcfMargin > -100) sp.set('minFcfMargin', String(p.minFcfMargin));
    if (p.marketCapPreset && p.marketCapPreset !== 'all') sp.set('mcap', p.marketCapPreset);
    for (const [key, r] of Object.entries(p.ranges ?? {})) {
        const cap = key[0]!.toUpperCase() + key.slice(1);
        if (r?.min !== undefined) sp.set(`min${cap}`, String(r.min));
        if (r?.max !== undefined) sp.set(`max${cap}`, String(r.max));
    }
    if (p.sort && p.sort !== 'healthScore:desc') sp.set('sort', p.sort);
    return sp.toString();
}

export const SORT_OPTIONS = [
    { value: 'overallScore:desc', label: 'Overall Score ↓' },
    { value: 'overallScore:asc', label: 'Overall Score ↑' },
    { value: 'growthScore:desc', label: 'Growth ↓' },
    { value: 'growthScore:asc', label: 'Growth ↑' },
    { value: 'qualityScore:desc', label: 'Quality ↓' },
    { value: 'qualityScore:asc', label: 'Quality ↑' },
    { value: 'healthScore:desc', label: 'Health Score ↓' },
    { value: 'healthScore:asc', label: 'Health Score ↑' },
    { value: 'profitabilityScore:desc', label: 'Profitability ↓' },
    { value: 'profitabilityScore:asc', label: 'Profitability ↑' },
    { value: 'valuationScore:desc', label: 'Valuation ↓' },
    { value: 'valuationScore:asc', label: 'Valuation ↑' },
    { value: 'altmanZ:desc', label: 'Altman Z ↓' },
    { value: 'altmanZ:asc', label: 'Altman Z ↑' },
    { value: 'piotroskiScore:desc', label: 'Piotroski F ↓' },
    { value: 'piotroskiScore:asc', label: 'Piotroski F ↑' },
    { value: 'beneishScore:asc', label: 'Beneish M ↑ (safest)' },
    { value: 'beneishScore:desc', label: 'Beneish M ↓ (riskiest)' },
    { value: 'fcfMargin:desc', label: 'FCF Margin ↓' },
    { value: 'fcfMargin:asc', label: 'FCF Margin ↑' },
    { value: 'debtRepaymentYears:asc', label: 'Debt Repay ↑ (fastest)' },
    { value: 'insider.netBuyPct90d:desc', label: 'Insider Net Buy % ↓ (90D)' },
    { value: 'insider.netBuyPct90d:asc', label: 'Insider Net Sell % ↓ (90D)' },
    { value: 'insider.netBuyValue90d:desc', label: 'Insider Net Buy $ ↓ (90D)' },
    { value: 'insider.netBuyValue90d:asc', label: 'Insider Net Sell $ ↓ (90D)' },
    { value: 'insider.largestBuyValue90d:desc', label: 'Largest Insider Buy ↓' },
    { value: 'insider.largestSellValue90d:desc', label: 'Largest Insider Sell ↓' },
    { value: 'insider.uniqueBuyers14d:desc', label: 'Insider Buyer Cluster ↓ (14D)' },
    { value: 'insider.uniqueSellers14d:desc', label: 'Insider Seller Cluster ↓ (14D)' },
    { value: 'debtRepaymentYears:desc', label: 'Debt Repay ↓ (slowest)' },
    { value: 'metrics.roe:desc', label: 'ROE ↓' },
    { value: 'metrics.netMargin:desc', label: 'Net Margin ↓' },
    { value: 'metrics.revenueGrowth:desc', label: 'Rev Growth ↓' },
    { value: 'metrics.peRatio:asc', label: 'P/E ↑ (cheapest)' },
    { value: 'metrics.dividendYield:desc', label: 'Div Yield ↓' },
    { value: 'metrics.beta:asc', label: 'Beta ↑ (lowest)' },
    { value: 'ticker.lastPrice:desc', label: 'Price ↓' },
    { value: 'ticker.lastPrice:asc', label: 'Price ↑' },
    { value: 'ticker.lastChangePct:desc', label: 'Day Change ↓ (gainers)' },
    { value: 'ticker.lastChangePct:asc', label: 'Day Change ↑ (losers)' },
    { value: 'ticker.lastMarketCap:desc', label: 'Market Cap ↓' },
    { value: 'ticker.lastMarketCap:asc', label: 'Market Cap ↑' },
    { value: 'ticker.lastMarketCapDiff:desc', label: 'MCap Δ ↓ (biggest gain)' },
    { value: 'ticker.lastMarketCapDiff:asc', label: 'MCap Δ ↑ (biggest loss)' },
    { value: 'ticker.name:desc', label: 'Company Name ↓' },
    { value: 'ticker.name:asc', label: 'Company Name ↑' },
];

export function scoreColor(score: number | null): string {
    if (score === null) return 'text-gray-400';
    if (score >= 75) return 'text-green-600 dark:text-green-400 font-semibold';
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400 font-medium';
    return 'text-red-600 dark:text-red-400 font-medium';
}

export function scoreBgColor(score: number | null): string {
    if (score === null) return 'text-gray-400';
    if (score >= 75) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
}

export function altmanZLabel(z: number | null): { color: string; label: string } {
    if (z === null) return { color: 'text-gray-400', label: 'N/A' };
    if (z > 3) return { color: 'text-green-500', label: 'Safe' };
    if (z > 1.8) return { color: 'text-yellow-500', label: 'Grey' };
    return { color: 'text-red-500', label: 'Risk' };
}

export function piotroskiLabel(score: number | null): { color: string; label: string } {
    if (score === null) return { color: 'text-gray-400', label: 'N/A' };
    if (score >= 7) return { color: 'text-green-500', label: 'Strong' };
    if (score >= 4) return { color: 'text-yellow-500', label: 'Avg' };
    return { color: 'text-red-500', label: 'Weak' };
}

export function beneishLabel(score: number | null): { color: string; label: string } {
    if (score === null) return { color: 'text-gray-400', label: 'N/A' };
    if (score < -2.22) return { color: 'text-green-500', label: 'Safe' };
    if (score < -1.78) return { color: 'text-yellow-500', label: 'Grey' };
    return { color: 'text-red-500', label: 'Risky' };
}

export function fcfMarginLabel(margin: number | null): { color: string; label: string } {
    if (margin === null) return { color: 'text-gray-400', label: 'N/A' };
    const pct = margin * 100;
    if (pct >= 15) return { color: 'text-green-500', label: 'High' };
    if (pct >= 5) return { color: 'text-green-500', label: 'Good' };
    if (pct >= 0) return { color: 'text-yellow-500', label: 'Low' };
    return { color: 'text-red-500', label: 'Neg' };
}

export function debtRepayLabel(years: number | null): { color: string; label: string } {
    if (years === null) return { color: 'text-gray-400', label: 'N/A' };
    if (years === 0) return { color: 'text-green-500', label: 'None' };
    if (years <= 3) return { color: 'text-green-500', label: 'Fast' };
    if (years <= 5) return { color: 'text-yellow-500', label: 'OK' };
    return { color: 'text-red-500', label: 'Slow' };
}
