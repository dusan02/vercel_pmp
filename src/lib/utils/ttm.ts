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
    // Use the FY whose fiscalYear = latestQ.fiscalYear - 1 (the correct one for TTM formula).
    // Falls back to most recent FY if the matching one doesn't exist.
    const matchingFY = latestQ?.fiscalYear != null
        ? annualStmts.find(s => s.fiscalYear === latestQ.fiscalYear! - 1) ?? null
        : null;
    const latestFY = matchingFY ?? annualStmts[0] ?? null;
    const prevYearSameQ = latestQ
        ? quarterlyStmts.find(s => s.fiscalPeriod === latestQ.fiscalPeriod && s.fiscalYear === latestQ.fiscalYear! - 1)
        : null;

    const canTtm = !!(latestQ && matchingFY && prevYearSameQ);

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
 * Primary formula: TTM = latestQ + matchingFY - prevYearSameQ
 * This works because Finnhub reports cumulative quarterly values
 * (Q1=3M, Q2=6M, Q3=9M, FY=12M), so Q + FY - prevYearSameQ gives
 * exactly 12 contiguous months — BUT only when FY is the fiscal year
 * that ends between prevYearSameQ and latestQ (i.e. FY.fiscalYear =
 * latestQ.fiscalYear - 1). Using a different FY produces non-contiguous
 * months and garbage results.
 *
 * Fallback: when the matching FY or prevYearSameQ is missing, use the
 * latest available FY value as TTM. This is slightly stale but correct
 * in magnitude.
 */
export function computeTTMAtDate(stmts: FinancialStatement[], date: Date): {
    netIncome: number | null;
    revenue: number | null;
} {
    // Sort descending by endDate to ensure latest-first ordering
    const sorted = [...stmts].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    const stmtsBeforeDate = sorted.filter(s => s.endDate.getTime() <= date.getTime());
    const quarterlyBeforeDate = stmtsBeforeDate.filter(s => s.fiscalPeriod !== 'FY');
    const annualBeforeDate = stmtsBeforeDate.filter(s => s.fiscalPeriod === 'FY');
    const latestQ = quarterlyBeforeDate[0] ?? null;

    // The correct FY for the TTM formula is the one whose fiscalYear =
    // latestQ.fiscalYear - 1 (the fiscal year that just ended).
    // Using any other FY produces non-contiguous months.
    const matchingFY = latestQ?.fiscalYear != null
        ? annualBeforeDate.find(s => s.fiscalYear === latestQ.fiscalYear! - 1) ?? null
        : null;

    const prevYearSameQ = latestQ
        ? quarterlyBeforeDate.find(s => s.fiscalPeriod === latestQ.fiscalPeriod && s.fiscalYear === latestQ.fiscalYear! - 1)
        : null;

    let netIncome: number | null = null;
    let revenue: number | null = null;

    if (latestQ && matchingFY && prevYearSameQ) {
        const qNI = latestQ.netIncome;
        const fyNI = matchingFY.netIncome;
        const prevQNI = prevYearSameQ.netIncome;
        if (qNI != null && fyNI != null && prevQNI != null) {
            netIncome = qNI + fyNI - prevQNI;
        }
        const qRev = latestQ.revenue;
        const fyRev = matchingFY.revenue;
        const prevQRev = prevYearSameQ.revenue;
        if (qRev != null && fyRev != null && prevQRev != null) {
            revenue = qRev + fyRev - prevQRev;
        }
    }

    // Fallback: use latest available FY value as TTM when primary formula
    // failed (missing matching FY or prevYearSameQ). This is slightly stale
    // but correct in magnitude.
    const fallbackFY = annualBeforeDate[0] ?? null;
    if (netIncome === null && fallbackFY?.netIncome != null) {
        netIncome = fallbackFY.netIncome;
    }
    if (revenue === null && fallbackFY?.revenue != null) {
        revenue = fallbackFY.revenue;
    }

    return { netIncome, revenue };
}
