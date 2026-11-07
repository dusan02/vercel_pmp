import { FinancialStatement } from '@prisma/client';

/**
 * Shared TTM (Trailing Twelve Months) calculation.
 * Finnhub reports cumulative quarterly values (Q1=3M, Q2=6M, Q3=9M). Q4 is embedded in FY.
 * Standard formula: TTM = latest_quarter + FY - same_quarter_previous_year
 * This gives 12 contiguous months regardless of which quarter is latest.
 */

export interface TTMResult {
    netIncome: number | null;
    netIncomeCommon?: number | null;
    revenue: number | null;
    ebit: number | null;
    grossProfit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    sbc: number | null;
}

/**
 * Statement periods whose stored flows span ~12 months — the only rows a
 * sub-TTM fallback may draw from. 'H2' doubles as the annual report for
 * semiannual filers (BHP, DEO: H1 rows carry no flows, H2 holds the full
 * year). Quarterly rows are cumulative-YTD (<12M), so a lone quarter must
 * never stand in for TTM (GOOG Oct'21: P/E ≈ 107 off one quarter's NI).
 * 'Q4' is deliberately excluded — never stored and ambiguous
 * (cumulative-12M vs a discrete quarter).
 */
export const isAnnualPeriod = (p: string | null): boolean => p === 'FY' || p === 'H2';

/**
 * Compute TTM values from a set of financial statements.
 * @param stmts Financial statements sorted by endDate desc (most recent first)
 * @returns TTMResult with all TTM fields, or null values if TTM can't be computed
 */
export function computeTTM(stmts: FinancialStatement[]): TTMResult {
    const quarterlyStmts = stmts.filter(s => !isAnnualPeriod(s.fiscalPeriod));
    const annualStmts = stmts.filter(s => isAnnualPeriod(s.fiscalPeriod));

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

    function ttmVal(field: keyof FinancialStatement, absFields = false): number | null {
        if (canTtm && latestQ && latestFY && prevYearSameQ) {
            const qVal = latestQ[field] as number | null;
            const fyVal = latestFY[field] as number | null;
            const prevQVal = prevYearSameQ[field] as number | null;
            if (qVal != null && fyVal != null && prevQVal != null) {
                // capex/sbc sign conventions differ between providers (Finnhub
                // positive outflow vs SimFin raw negative) — use magnitudes.
                if (absFields) return Math.abs(qVal) + Math.abs(fyVal) - Math.abs(prevQVal);
                return qVal + fyVal - prevQVal;
            }
        }
        const fb = (latestFY as any)?.[field] as number | null;
        return fb != null && absFields ? Math.abs(fb) : fb ?? null;
    }

    return {
        netIncome: ttmVal('netIncome'),
        netIncomeCommon: ttmVal('netIncomeCommon'),
        revenue: ttmVal('revenue'),
        ebit: ttmVal('ebit'),
        grossProfit: ttmVal('grossProfit'),
        operatingCashFlow: ttmVal('operatingCashFlow'),
        capex: ttmVal('capex', true),
        sbc: ttmVal('sbc', true),
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
    netIncomeCommon: number | null;
    revenue: number | null;
    ebit: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
} {
    // Sort descending by endDate to ensure latest-first ordering
    const sorted = [...stmts].sort((a, b) => b.endDate.getTime() - a.endDate.getTime());
    const stmtsBeforeDate = sorted.filter(s => s.endDate.getTime() <= date.getTime());
    const quarterlyBeforeDate = stmtsBeforeDate.filter(s => !isAnnualPeriod(s.fiscalPeriod));
    const annualBeforeDate = stmtsBeforeDate.filter(s => isAnnualPeriod(s.fiscalPeriod));
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

    // Fallback: latest available FY value when the primary formula can't run
    // (missing matching FY or prevYearSameQ). Slightly stale, correct magnitude.
    const fallbackFY = annualBeforeDate[0] ?? null;

    function field(name: 'netIncome' | 'netIncomeCommon' | 'revenue' | 'ebit' | 'operatingCashFlow' | 'capex', absField = false): number | null {
        if (latestQ && matchingFY && prevYearSameQ) {
            const q = latestQ[name];
            const fy = matchingFY[name];
            const pq = prevYearSameQ[name];
            if (q != null && fy != null && pq != null) {
                if (absField) return Math.abs(q) + Math.abs(fy) - Math.abs(pq);
                return q + fy - pq;
            }
        }
        const fb = fallbackFY?.[name];
        return fb != null && absField ? Math.abs(fb) : fb ?? null;
    }

    return {
        netIncome: field('netIncome'),
        netIncomeCommon: field('netIncomeCommon'),
        revenue: field('revenue'),
        ebit: field('ebit'),
        operatingCashFlow: field('operatingCashFlow'),
        capex: field('capex', true),
    };
}

/**
 * Normalizes cumulative quarterly statements into discrete quarters (Q1, Q2, Q3, Q4).
 * Finnhub reports cumulative YTD flows: Q1 = 3M, Q2 = 6M, Q3 = 9M, FY = 12M.
 * Returns an object of discrete quarterly values or null if a contiguous link is missing.
 */
export function computeDiscreteQuarter(
    currentStmt: FinancialStatement,
    allStmts: FinancialStatement[]
): {
    discreteRevenue: number | null;
    discreteNetIncome: number | null;
    discreteOperatingCashFlow: number | null;
    discreteCapex: number | null;
    isContiguous: boolean;
} {
    const p = currentStmt.fiscalPeriod;
    const y = currentStmt.fiscalYear;

    // Q1 is inherently discrete (first 3 months of fiscal year)
    if (p === 'Q1') {
        return {
            discreteRevenue: currentStmt.revenue,
            discreteNetIncome: currentStmt.netIncome,
            discreteOperatingCashFlow: currentStmt.operatingCashFlow,
            discreteCapex: currentStmt.capex != null ? Math.abs(currentStmt.capex) : null,
            isContiguous: true,
        };
    }

    // For Q2: need Q1 of same fiscal year -> Q2_discrete = Q2_cum - Q1_cum
    if (p === 'Q2') {
        const q1 = allStmts.find(s => s.fiscalYear === y && s.fiscalPeriod === 'Q1');
        if (!q1) {
            return { discreteRevenue: null, discreteNetIncome: null, discreteOperatingCashFlow: null, discreteCapex: null, isContiguous: false };
        }
        return {
            discreteRevenue: currentStmt.revenue != null && q1.revenue != null ? currentStmt.revenue - q1.revenue : null,
            discreteNetIncome: currentStmt.netIncome != null && q1.netIncome != null ? currentStmt.netIncome - q1.netIncome : null,
            discreteOperatingCashFlow: currentStmt.operatingCashFlow != null && q1.operatingCashFlow != null ? currentStmt.operatingCashFlow - q1.operatingCashFlow : null,
            discreteCapex: currentStmt.capex != null && q1.capex != null ? Math.abs(currentStmt.capex) - Math.abs(q1.capex) : null,
            isContiguous: true,
        };
    }

    // For Q3: need Q2 of same fiscal year -> Q3_discrete = Q3_cum - Q2_cum
    if (p === 'Q3') {
        const q2 = allStmts.find(s => s.fiscalYear === y && s.fiscalPeriod === 'Q2');
        if (!q2) {
            return { discreteRevenue: null, discreteNetIncome: null, discreteOperatingCashFlow: null, discreteCapex: null, isContiguous: false };
        }
        return {
            discreteRevenue: currentStmt.revenue != null && q2.revenue != null ? currentStmt.revenue - q2.revenue : null,
            discreteNetIncome: currentStmt.netIncome != null && q2.netIncome != null ? currentStmt.netIncome - q2.netIncome : null,
            discreteOperatingCashFlow: currentStmt.operatingCashFlow != null && q2.operatingCashFlow != null ? currentStmt.operatingCashFlow - q2.operatingCashFlow : null,
            discreteCapex: currentStmt.capex != null && q2.capex != null ? Math.abs(currentStmt.capex) - Math.abs(q2.capex) : null,
            isContiguous: true,
        };
    }

    // For Q4 (embedded in FY): need FY and Q3 of same fiscal year -> Q4_discrete = FY - Q3_cum
    if (p === 'FY') {
        const q3 = allStmts.find(s => s.fiscalYear === y && s.fiscalPeriod === 'Q3');
        if (!q3) {
            return { discreteRevenue: null, discreteNetIncome: null, discreteOperatingCashFlow: null, discreteCapex: null, isContiguous: false };
        }
        return {
            discreteRevenue: currentStmt.revenue != null && q3.revenue != null ? currentStmt.revenue - q3.revenue : null,
            discreteNetIncome: currentStmt.netIncome != null && q3.netIncome != null ? currentStmt.netIncome - q3.netIncome : null,
            discreteOperatingCashFlow: currentStmt.operatingCashFlow != null && q3.operatingCashFlow != null ? currentStmt.operatingCashFlow - q3.operatingCashFlow : null,
            discreteCapex: currentStmt.capex != null && q3.capex != null ? Math.abs(currentStmt.capex) - Math.abs(q3.capex) : null,
            isContiguous: true,
        };
    }

    return { discreteRevenue: null, discreteNetIncome: null, discreteOperatingCashFlow: null, discreteCapex: null, isContiguous: false };
}
