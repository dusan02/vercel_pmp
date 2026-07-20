import { FinancialStatement } from '@prisma/client';

/**
 * Shared TTM (Trailing Twelve Months) calculation.
 * Finnhub reports cumulative quarterly values (Q1=3M, Q2=6M, Q3=9M). Q4 is embedded in FY.
 * Standard formula: TTM = latest_quarter + FY - same_quarter_previous_year
 * This gives 12 contiguous months regardless of which quarter is latest.
 */

export interface TTMResult {
    netIncome: number | null;
    revenue: number | null;
    ebit: number | null;
    grossProfit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    sbc: number | null;
}

/**
 * Compute TTM values from a set of financial statements.
 * @param stmts Financial statements sorted by endDate desc (most recent first)
 * @returns TTMResult with all TTM fields, or null values if TTM can't be computed
 */
export function computeTTM(stmts: FinancialStatement[]): TTMResult {
    const quarterlyStmts = stmts.filter(s => s.fiscalPeriod !== 'FY');
    const annualStmts = stmts.filter(s => s.fiscalPeriod === 'FY');

    const latestQ = quarterlyStmts[0] ?? null;
    const latestFY = annualStmts[0] ?? null;
    const prevYearSameQ = latestQ
        ? quarterlyStmts.find(s => s.fiscalPeriod === latestQ.fiscalPeriod && s.fiscalYear === latestQ.fiscalYear! - 1)
        : null;

    const canTtm = !!(latestQ && latestFY && prevYearSameQ);

    function ttmVal(field: keyof FinancialStatement): number | null {
        if (canTtm && latestQ && latestFY && prevYearSameQ) {
            const qVal = latestQ[field] as number | null;
            const fyVal = latestFY[field] as number | null;
            const prevQVal = prevYearSameQ[field] as number | null;
            if (qVal != null && fyVal != null && prevQVal != null) {
                return qVal + fyVal - prevQVal;
            }
        }
        return (latestFY as any)?.[field] as number | null ?? null;
    }

    return {
        netIncome: ttmVal('netIncome'),
        revenue: ttmVal('revenue'),
        ebit: ttmVal('ebit'),
        grossProfit: ttmVal('grossProfit'),
        operatingCashFlow: ttmVal('operatingCashFlow'),
        capex: ttmVal('capex'),
        sbc: ttmVal('sbc'),
    };
}

/**
 * Compute TTM for a point-in-time (for historical valuation).
 * Only uses statements with endDate <= the given date.
 *
 * Two methods are computed and cross-validated:
 * 1. Primary formula: TTM = latestQ + latestFY - prevYearSameQ
 * 2. 4-quarter sum: sum of last 4 distinct quarterly statements
 *
 * The 4-quarter sum is preferred when the two differ by more than 50%,
 * as this typically indicates the primary formula is using a stale FY
 * (e.g. FY 2025 not yet in DB, so it falls back to FY 2024).
 */
export function computeTTMAtDate(stmts: FinancialStatement[], date: Date): {
    netIncome: number | null;
    revenue: number | null;
} {
    // Sort descending by endDate to ensure latest-first ordering
    const sorted = [...stmts].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    const stmtsBeforeDate = sorted.filter(s => s.endDate.getTime() <= date.getTime());
    const quarterlyBeforeDate = stmtsBeforeDate.filter(s => s.fiscalPeriod !== 'FY');
    const latestQ = quarterlyBeforeDate[0] ?? null;
    const latestFY = stmtsBeforeDate.find(s => s.fiscalPeriod === 'FY') ?? null;
    const prevYearSameQ = latestQ
        ? quarterlyBeforeDate.find(s => s.fiscalPeriod === latestQ.fiscalPeriod && s.fiscalYear === latestQ.fiscalYear! - 1)
        : null;

    let primaryNI: number | null = null;
    let primaryRev: number | null = null;

    if (latestQ && latestFY && prevYearSameQ) {
        const qNI = latestQ.netIncome;
        const fyNI = latestFY.netIncome;
        const prevQNI = prevYearSameQ.netIncome;
        if (qNI != null && fyNI != null && prevQNI != null) {
            primaryNI = qNI + fyNI - prevQNI;
        }
        const qRev = latestQ.revenue;
        const fyRev = latestFY.revenue;
        const prevQRev = prevYearSameQ.revenue;
        if (qRev != null && fyRev != null && prevQRev != null) {
            primaryRev = qRev + fyRev - prevQRev;
        }
    }

    const fourQ = sumLast4Quarters(quarterlyBeforeDate);

    // Cross-validate: prefer 4-quarter sum when primary formula result
    // differs by more than 50% (indicates stale FY in primary formula)
    function pickBetter(primary: number | null, fallback: number | null): number | null {
        if (primary === null) return fallback;
        if (fallback === null) return primary;
        const diff = Math.abs(primary - fallback) / Math.max(Math.abs(primary), Math.abs(fallback));
        return diff > 0.5 ? fallback : primary;
    }

    return {
        netIncome: pickBetter(primaryNI, fourQ.netIncome),
        revenue: pickBetter(primaryRev, fourQ.revenue),
    };
}

/**
 * Sum the last 4 distinct quarterly statements (by fiscalPeriod + fiscalYear)
 * to approximate TTM when the standard formula is unavailable.
 */
function sumLast4Quarters(quarterlyStmts: FinancialStatement[]): {
    netIncome: number | null;
    revenue: number | null;
} {
    // Deduplicate by fiscalPeriod + fiscalYear, keeping the most recent
    const seen = new Set<string>();
    const distinct: FinancialStatement[] = [];
    for (const s of quarterlyStmts) {
        const key = `${s.fiscalYear}-${s.fiscalPeriod}`;
        if (!seen.has(key)) {
            seen.add(key);
            distinct.push(s);
        }
        if (distinct.length >= 4) break;
    }

    if (distinct.length < 4) return { netIncome: null, revenue: null };

    let netIncome = 0;
    let revenue = 0;
    let niValid = true;
    let revValid = true;

    for (const s of distinct) {
        if (s.netIncome != null) {
            netIncome += s.netIncome;
        } else {
            niValid = false;
        }
        if (s.revenue != null) {
            revenue += s.revenue;
        } else {
            revValid = false;
        }
    }

    return {
        netIncome: niValid ? netIncome : null,
        revenue: revValid ? revenue : null,
    };
}
