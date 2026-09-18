/**
 * Financial flows section — Sankey visualizations of the income statement
 * (Revenue → COGS/GP → OpEx/EBIT → Interest+Tax/NI) and cash flow
 * (OCF → Capex/FCF → SBC/True FCF) built from FinancialStatement rows.
 *
 * The "True FCF" adjustment treats stock-based compensation as a real cost
 * — rarely shown on free financial sites.
 */

import { type FlowPeriod } from './FinancialFlowsClient';

export interface StatementRow {
    period: string | null;
    fiscalYear: number | null;
    fiscalPeriod: string | null;
    endDate: Date;
    revenue: number | null;
    grossProfit: number | null;
    ebit: number | null;
    netIncome: number | null;
    operatingCashFlow: number | null;
    capex: number | null;
    sbc: number | null;
    sharesOutstanding: number | null;
    totalAssets: number | null;
    totalLiabilities: number | null;
    currentAssets: number | null;
    currentLiabilities: number | null;
    retainedEarnings: number | null;
    totalEquity: number | null;
    totalDebt: number | null;
    cashAndEquivalents: number | null;
    netPPE: number | null;
}

function isFy(r: StatementRow): boolean {
    return r.period === 'FY' || r.fiscalPeriod === 'FY';
}

function num(v: number | null): number | null {
    return v != null && isFinite(v) ? v : null;
}

function toPeriod(r: StatementRow, label: string): FlowPeriod {
    return {
        label,
        revenue: num(r.revenue),
        grossProfit: num(r.grossProfit),
        ebit: num(r.ebit),
        netIncome: num(r.netIncome),
        ocf: num(r.operatingCashFlow),
        capex: num(r.capex),
        sbc: num(r.sbc),
        sharesOutstanding: num(r.sharesOutstanding),
        totalAssets: num(r.totalAssets),
        totalLiabilities: num(r.totalLiabilities),
        currentAssets: num(r.currentAssets),
        currentLiabilities: num(r.currentLiabilities),
        retainedEarnings: num(r.retainedEarnings),
        totalEquity: num(r.totalEquity),
        totalDebt: num(r.totalDebt),
        cashAndEquivalents: num(r.cashAndEquivalents),
        netPPE: num(r.netPPE),
    };
}

// Flow fields only — quarterly YTD rows are subtracted to derive the
// standalone quarter. Balance-sheet fields (and sharesOutstanding) are
// point-in-time values and must NOT be diffed.
const FLOW_FIELDS = ['revenue', 'grossProfit', 'ebit', 'netIncome', 'operatingCashFlow', 'capex', 'sbc'] as const;

/**
 * Statement rows for quarterly periods are YTD-cumulative (Q2 row = Q1+Q2).
 * Derive the standalone quarter by subtracting the previous YTD row of the
 * same fiscal year. Returns null when the pair isn't available.
 */
function deriveQuarter(latest: StatementRow, rows: StatementRow[]): StatementRow | null {
    const seq = ['Q1', 'Q2', 'Q3', 'Q4'];
    const p = latest.period ?? latest.fiscalPeriod ?? '';
    const idx = seq.indexOf(p);
    if (idx < 0) return null;
    if (idx === 0) return latest;
    const prev = rows.find(
        (r) => r !== latest && r.fiscalYear === latest.fiscalYear && (r.period ?? r.fiscalPeriod) === seq[idx - 1],
    );
    if (!prev) return null;
    const derived = { ...latest };
    for (const f of FLOW_FIELDS) {
        const a = latest[f];
        const b = prev[f];
        derived[f] = a != null && b != null ? a - b : a;
    }
    return derived;
}

export interface FlowPeriods {
    annual: FlowPeriod | null;
    quarterly: FlowPeriod | null;
}

/**
 * Latest FY + derived standalone quarter as FlowPeriods for the paired
 * history/sankey chart grid.
 */
export function buildFlowPeriods(statements: StatementRow[]): FlowPeriods | null {
    if (!statements.length) return null;

    const sorted = [...statements].sort(
        (a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime(),
    );

    const fyRow = sorted.find(isFy) ?? null;
    const latestYtd = sorted.find((r) => !isFy(r)) ?? null;
    const qRow = latestYtd ? deriveQuarter(latestYtd, sorted) : null;

    const annual = fyRow ? toPeriod(fyRow, `FY ${fyRow.fiscalYear ?? new Date(fyRow.endDate).getUTCFullYear()}`) : null;
    const qLabel = qRow
        ? `${qRow.period ?? qRow.fiscalPeriod} ${qRow.fiscalYear ?? new Date(qRow.endDate).getUTCFullYear()}`
        : '';
    const quarterly = qRow ? toPeriod(qRow, qLabel) : null;

    if (!annual && !quarterly) return null;
    return { annual, quarterly };
}
