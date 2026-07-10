import type { FinancialStatement } from '@/components/company/FinancialChart';

export function filterStatementsByViewMode(
    statements: FinancialStatement[],
    viewMode: 'annual' | 'quarterly'
): FinancialStatement[] {
    if (viewMode === 'annual') {
        let filtered = statements.filter(s =>
            s.fiscalPeriod === 'FY' ||
            s.period === 'annual' ||
            (s.fiscalPeriod && s.fiscalPeriod.startsWith('FY'))
        ); // TTM excluded: it's rolling 12M, not a fiscal year-end — would create a duplicate inflated bar
        if (filtered.length === 0) {
            const yearlyData = new Map<number, FinancialStatement>();
            statements.forEach(s => {
                if (s.fiscalPeriod && s.fiscalPeriod.includes('Q4')) {
                    const year = s.fiscalYear;
                    const existing = yearlyData.get(year);
                    if (!existing || new Date(s.endDate) > new Date(existing.endDate)) {
                        yearlyData.set(year, s);
                    }
                }
            });
            filtered = Array.from(yearlyData.values());
        }
        return filtered;
    }

    // Quarterly mode: filter to quarterly statements and de-cumulate YTD values
    const quarterly = statements.filter(s =>
        s.fiscalPeriod !== 'FY' &&
        s.fiscalPeriod !== 'TTM' &&
        s.period !== 'annual'
    );

    // Group by fiscal year, sort each year's quarters ascending
    const byYear = new Map<number, FinancialStatement[]>();
    for (const s of quarterly) {
        const year = s.fiscalYear;
        if (!byYear.has(year)) byYear.set(year, []);
        byYear.get(year)!.push(s);
    }

    const result: FinancialStatement[] = [];

    for (const [year, quarters] of byYear) {
        // Sort by quarter number ascending (Q1, Q2, Q3, Q4)
        quarters.sort((a, b) => {
            const qa = parseInt(a.fiscalPeriod?.replace('Q', '') || '0');
            const qb = parseInt(b.fiscalPeriod?.replace('Q', '') || '0');
            return qa - qb;
        });

        // Find the FY statement for this year (to derive Q4 = FY - Q3_YTD)
        const fyStmt = statements.find(s => s.fiscalPeriod === 'FY' && s.fiscalYear === year);

        for (let i = 0; i < quarters.length; i++) {
            const q = quarters[i]!;
            const qNum = parseInt(q.fiscalPeriod?.replace('Q', '') || '0');

            if (qNum === 1) {
                // Q1 is already standalone (3 months)
                result.push(q);
            } else {
                // Q2 = Q2_YTD - Q1, Q3 = Q3_YTD - Q2_YTD
                const prevQ = quarters[i - 1];
                if (!prevQ) {
                    result.push(q);
                    continue;
                }
                const deCumulated: FinancialStatement = {
                    ...q,
                    id: q.id,
                    revenue: deCumulate(q.revenue, prevQ.revenue),
                    netIncome: deCumulate(q.netIncome, prevQ.netIncome),
                    ebit: deCumulate(q.ebit, prevQ.ebit),
                    grossProfit: deCumulate(q.grossProfit, prevQ.grossProfit),
                    operatingCashFlow: deCumulate(q.operatingCashFlow, prevQ.operatingCashFlow),
                    capex: deCumulate(q.capex, prevQ.capex),
                    sbc: deCumulate(q.sbc, prevQ.sbc),
                };
                result.push(deCumulated);
            }
        }

        // If we have FY but no Q4, derive Q4 = FY - Q3_YTD
        if (fyStmt && !quarters.some(q => q!.fiscalPeriod === 'Q4')) {
            const q3 = quarters.find(q => q!.fiscalPeriod === 'Q3');
            if (q3) {
                const q4: FinancialStatement = {
                    ...fyStmt,
                    id: fyStmt.id,
                    fiscalPeriod: 'Q4',
                    period: 'Q4',
                    revenue: deCumulate(fyStmt.revenue, q3.revenue),
                    netIncome: deCumulate(fyStmt.netIncome, q3.netIncome),
                    ebit: deCumulate(fyStmt.ebit, q3.ebit),
                    grossProfit: deCumulate(fyStmt.grossProfit, q3.grossProfit),
                    operatingCashFlow: deCumulate(fyStmt.operatingCashFlow, q3.operatingCashFlow),
                    capex: deCumulate(fyStmt.capex, q3.capex),
                    sbc: deCumulate(fyStmt.sbc, q3.sbc),
                };
                result.push(q4);
            }
        }
    }

    return result;
}

function deCumulate(current: number | null, prev: number | null): number | null {
    if (current == null) return null;
    if (prev == null) return current;
    return current - prev;
}

export function formatChartYAxis(value: number): string {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs >= 1000) return `$${(value / 1000).toFixed(1)}B`;
    if (abs >= 1) return `$${value.toFixed(0)}M`;
    return `$${value.toFixed(1)}M`;
}

export function buildPeriodLabel(fiscalPeriod: string | undefined, fiscalYear: number): string {
    const qMatch = fiscalPeriod?.match(/Q(\d)/);
    const shortYear = `'${String(fiscalYear).slice(2)}`;
    return qMatch ? `Q${qMatch[1]}${shortYear}` : shortYear;
}
