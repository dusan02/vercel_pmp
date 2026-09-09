export interface ScreenerResult {
    symbol: string;
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
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
    ticker: {
        name: string | null;
        sector: string | null;
        industry: string | null;
        logoUrl: string | null;
        lastPrice: number | null;
        lastMarketCap: number | null;
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

export const SORT_OPTIONS = [
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
    { value: 'debtRepaymentYears:desc', label: 'Debt Repay ↓ (slowest)' },
    { value: 'ticker.lastMarketCap:desc', label: 'Market Cap ↓' },
    { value: 'ticker.lastMarketCap:asc', label: 'Market Cap ↑' },
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
