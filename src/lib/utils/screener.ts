export interface ScreenerResult {
    symbol: string;
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    altmanZ: number | null;
    debtRepaymentYears: number | null;
    fcfYield: number | null;
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
    'Energy', 'Utilities', 'Real Estate', 'Basic Materials',
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

export function formatScreenerMarketCap(mc: number | null | undefined): string {
    if (!mc || mc <= 0) return '-';
    if (mc >= 1e12) return `$${(mc / 1e12).toFixed(1)}T`;
    if (mc >= 1e9) return `$${(mc / 1e9).toFixed(1)}B`;
    if (mc >= 1e6) return `$${(mc / 1e6).toFixed(1)}M`;
    return `$${mc.toFixed(0)}`;
}
