/**
 * ScenarioLab — formatting helpers and normalization constants.
 * Extracted from ScenarioLab.tsx (pure functions, no React).
 */

// ── Normalization constants ──
export const GROWTH_CAP = 25;
export const GROWTH_FLOOR = -10;
export const PE_ABSOLUTE_CAP = 60;
export const PE_DERATING_THRESHOLD = 2.0;
export const PE_DERATING_PREMIUM = 1.5;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Format money with thousands separators: 1234.5 → "$1,234.50" */
export function fmtMoney(n: number | null | undefined, decimals = 2): string {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return '$' + n.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    });
}

/** Format compact money for chart axes: 1234 → "$1.2k", 1500000 → "$1.5M" */
export function fmtCompact(n: number): string {
    if (n >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return '$' + (n / 1_000).toFixed(1) + 'k';
    return '$' + n.toFixed(0);
}

/** Format percentage with sign: 12.3 → "+12.3%", -5 → "-5.0%" */
export function fmtPct(n: number | null | undefined, decimals = 1): string {
    if (n === null || n === undefined || isNaN(n)) return '—';
    const sign = n > 0 ? '+' : '';
    return sign + n.toFixed(decimals) + '%';
}

/** Format P/E multiple: 27.7 → "27.7×" */
export function fmtPe(n: number | null | undefined, decimals = 1): string {
    if (n === null || n === undefined || isNaN(n)) return '—';
    return n.toFixed(decimals) + '×';
}
