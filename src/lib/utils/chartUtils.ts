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
    return statements.filter(s =>
        s.fiscalPeriod !== 'FY' &&
        s.fiscalPeriod !== 'TTM' &&
        s.period !== 'annual'
    );
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
