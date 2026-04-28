import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { StatusType } from '../shared/MetricCard';

interface Props {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

interface MetricDef {
    label: string;
    value: string;
    statusType: StatusType;
    hint: string;
    secondary?: string | undefined;
}

const VALUE_COLOR: Record<StatusType, string> = {
    good: 'text-green-600 dark:text-green-400',
    warn: 'text-amber-600 dark:text-amber-400',
    bad: 'text-red-500 dark:text-red-400',
    neutral: 'text-gray-700 dark:text-gray-300',
};

// ── Section divider row ──────────────────────────────────────────────────────
function SectionRow({ title }: { title: string }) {
    return (
        <tr className="border-t border-gray-100 dark:border-gray-700/60">
            <td colSpan={6} className="px-3 pt-3 pb-1">
                <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">
                    {title}
                </span>
            </td>
        </tr>
    );
}

// ── One row: up to 3 metric pairs ────────────────────────────────────────────
function MetricRow({
    metrics, compareWith, shade,
}: {
    metrics: (MetricDef | null)[];
    compareWith: string;
    shade: boolean;
}) {
    const bg = shade ? 'bg-gray-50/60 dark:bg-gray-800/40' : '';
    return (
        <tr className={bg}>
            {[0, 1, 2].map(i => {
                const m = metrics[i] ?? null;
                if (!m) {
                    return (
                        <React.Fragment key={i}>
                            <td className="px-3 py-[5px] border-r border-gray-100 dark:border-gray-700/40" />
                            <td className={`px-3 py-[5px] ${i < 2 ? 'border-r border-gray-100 dark:border-gray-700/40' : ''}`} />
                        </React.Fragment>
                    );
                }
                return (
                    <React.Fragment key={i}>
                        <td
                            className="px-3 py-[5px] text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap border-r border-gray-100 dark:border-gray-700/40 cursor-default select-none"
                            title={m.hint}
                        >
                            {m.label}
                        </td>
                        <td
                            className={`px-3 py-[5px] text-[12px] font-semibold tabular-nums cursor-default select-none ${VALUE_COLOR[m.statusType]} ${i < 2 ? 'border-r border-gray-100 dark:border-gray-700/40' : ''}`}
                            title={m.hint}
                        >
                            {m.value}
                            {compareWith && m.secondary && (
                                <span className="ml-1 text-[10px] font-normal text-gray-400">
                                    / {m.secondary}
                                </span>
                            )}
                        </td>
                    </React.Fragment>
                );
            })}
        </tr>
    );
}

// ── Build all metrics ────────────────────────────────────────────────────────
function buildMetrics(data: AnalysisData, sec: AnalysisData | null, cw: string) {
    const m = data.metrics;
    const sm = sec?.metrics;
    const bs = data.balanceSheet;
    const sbs = sec?.balanceSheet;
    const fy = data.statements?.find(s => s.fiscalPeriod === 'FY');
    const sfy = sec?.statements?.find(s => s.fiscalPeriod === 'FY');
    const mcap = data.ticker?.lastMarketCap ? data.ticker.lastMarketCap * 1e9 : null;
    const smcap = sec?.ticker?.lastMarketCap ? sec.ticker.lastMarketCap * 1e9 : null;

    const pct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';
    const yr  = (v: number | null | undefined) => v != null ? (v === 0 ? 'Net Cash' : `${v.toFixed(1)}y`) : 'N/A';
    const mul = (v: number | null | undefined, d = 2) => v != null ? `${v.toFixed(d)}x` : 'N/A';
    const s   = (v: string | undefined) => cw ? v : undefined;

    const roe      = (fy?.netIncome && bs?.totalEquity && bs.totalEquity > 0) ? fy.netIncome / bs.totalEquity : null;
    const sroe     = (sfy?.netIncome && sbs?.totalEquity && sbs.totalEquity > 0) ? sfy.netIncome / sbs.totalEquity : null;
    const netMar   = (fy?.netIncome != null && fy?.revenue && fy.revenue > 0) ? fy.netIncome / fy.revenue : null;
    const sNetMar  = (sfy?.netIncome != null && sfy?.revenue && sfy.revenue > 0) ? sfy.netIncome / sfy.revenue : null;
    const grossMar = (fy?.grossProfit != null && fy?.revenue && fy.revenue > 0) ? fy.grossProfit / fy.revenue : null;
    const sGrossMar= (sfy?.grossProfit != null && sfy?.revenue && sfy.revenue > 0) ? sfy.grossProfit / sfy.revenue : null;
    const pbRatio  = (mcap && bs?.totalEquity && bs.totalEquity > 0) ? mcap / bs.totalEquity : null;
    const spbRatio = (smcap && sbs?.totalEquity && sbs.totalEquity > 0) ? smcap / sbs.totalEquity : null;

    const altZ   = m?.altmanZ ?? m?.zScore ?? null;
    const saltZ  = sm?.altmanZ ?? sm?.zScore ?? null;
    const debtRp = m?.debtRepaymentYears ?? m?.debtRepaymentTime ?? null;
    const sDebtRp= sm?.debtRepaymentYears ?? sm?.debtRepaymentTime ?? null;
    const intCov = data.interestCoverage ?? null;
    const sIntCov= sec?.interestCoverage ?? null;
    const cr     = bs?.currentRatio ?? null;
    const scr    = sbs?.currentRatio ?? null;
    const nde    = bs?.netDebtToEbit ?? null;
    const snde   = sbs?.netDebtToEbit ?? null;
    const dte    = bs?.debtToEquity ?? null;
    const sdte   = sbs?.debtToEquity ?? null;
    const fcfMar = m?.fcfMargin ?? null;
    const sfcfMar= sm?.fcfMargin ?? null;
    const fcfCon = m?.fcfConversion ?? null;
    const sfcfCon= sm?.fcfConversion ?? null;
    const rCagr  = data.revenueCagr ?? null;
    const srCagr = sec?.revenueCagr ?? null;
    const niCagr = data.netIncomeCagr ?? null;
    const sniCagr= sec?.netIncomeCagr ?? null;
    const pe     = m?.currentPe ?? null;
    const spe    = sm?.currentPe ?? null;
    const fcfY   = m?.fcfYield ?? null;
    const sfcfY  = sm?.fcfYield ?? null;
    const pio    = data.piotroskiScore ?? null;
    const spio   = sec?.piotroskiScore ?? null;
    const ben    = data.beneishScore ?? null;
    const sben   = sec?.beneishScore ?? null;
    const mv     = data.marginStability ?? null;
    const smv    = sec?.marginStability ?? null;
    const niYrs  = data.negativeNiYears ?? 0;
    const sNiYrs = sec?.negativeNiYears ?? 0;
    const dil    = bs?.dilution5y;
    const sdil   = sbs?.dilution5y;
    const sbc    = bs?.sbcRatio;
    const ssbc   = sbs?.sbcRatio;

    const def = (
        label: string, value: string, secondary: string | undefined,
        statusLabel: StatusType, hint: string,
    ): MetricDef => ({ label, value, statusType: statusLabel, hint, secondary });

    const solvency: MetricDef[] = [
        def('Altman Z-Score', altZ != null ? altZ.toFixed(2) : 'N/A', s(altZ != null ? altZ.toFixed(2) : 'N/A'), altZ == null ? 'neutral' : altZ > 3 ? 'good' : altZ < 1.8 ? 'bad' : 'warn', '>3 Safe · 1.8–3 Grey · <1.8 Distress'),
        def('Debt Repayment', yr(debtRp), s(yr(sDebtRp)), debtRp == null ? 'neutral' : debtRp <= 3 ? 'good' : debtRp > 10 ? 'bad' : 'warn', 'Years to repay net debt via FCF'),
        def('Interest Coverage', intCov != null ? `${intCov.toFixed(1)}x` : 'N/A', s(intCov != null ? `${intCov.toFixed(1)}x` : 'N/A'), intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad', 'EBIT/Interest. >10 Strong · <3 Risky'),
        def('Current Ratio', mul(cr), s(mul(scr)), cr == null ? 'neutral' : cr > 2 ? 'good' : cr > 1 ? 'warn' : 'bad', 'Current Assets/Liabilities. >2 Strong'),
        def('Net Debt/EBIT', nde != null ? (nde < 0 ? 'Net Cash' : `${nde.toFixed(1)}x`) : 'N/A', s(snde != null ? (snde < 0 ? 'Net Cash' : `${snde.toFixed(1)}x`) : 'N/A'), nde == null ? 'neutral' : nde < 0 ? 'good' : nde < 2 ? 'good' : nde < 4 ? 'warn' : 'bad', 'Leverage. <2x Low · 4x+ High'),
        def('Debt/Equity', dte != null ? `${dte.toFixed(2)}x` : 'N/A', s(sdte != null ? `${sdte.toFixed(2)}x` : 'N/A'), dte == null ? 'neutral' : dte < 1 ? 'good' : dte < 2 ? 'warn' : 'bad', '<1 Conservative · >3 Risky'),
    ];

    const profitability: MetricDef[] = [
        def('ROE', pct(roe), s(pct(sroe)), roe == null ? 'neutral' : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad', 'Return on Equity. >20% Strong'),
        def('Net Margin', pct(netMar), s(pct(sNetMar)), netMar == null ? 'neutral' : netMar > 0.10 ? 'good' : netMar > 0.05 ? 'warn' : 'bad', '>20% Excellent · <5% Thin'),
        def('Gross Margin', pct(grossMar), s(pct(sGrossMar)), grossMar == null ? 'neutral' : grossMar > 0.50 ? 'good' : grossMar > 0.30 ? 'good' : grossMar > 0.15 ? 'warn' : 'bad', '>50% Premium · <20% Commodity'),
        def('FCF Margin', pct(fcfMar), s(pct(sfcfMar)), fcfMar == null ? 'neutral' : fcfMar > 0.15 ? 'good' : fcfMar > 0.08 ? 'warn' : 'bad', 'FCF/Revenue. >15% Excellent'),
        def('FCF Conversion', pct(fcfCon), s(pct(sfcfCon)), fcfCon == null ? 'neutral' : fcfCon > 0.80 ? 'good' : fcfCon > 0.50 ? 'warn' : 'bad', 'FCF/Net Income. >80% Efficient'),
        def('Revenue CAGR', rCagr != null ? `${(rCagr * 100).toFixed(1)}%` : 'N/A', s(srCagr != null ? `${(srCagr * 100).toFixed(1)}%` : 'N/A'), rCagr == null ? 'neutral' : rCagr > 0.15 ? 'good' : rCagr > 0.05 ? 'warn' : 'bad', 'Compound annual revenue growth'),
        def('NI CAGR', niCagr != null ? `${(niCagr * 100).toFixed(1)}%` : 'N/A', s(sniCagr != null ? `${(sniCagr * 100).toFixed(1)}%` : 'N/A'), niCagr == null ? 'neutral' : niCagr > 0.15 ? 'good' : niCagr > 0.05 ? 'warn' : 'bad', 'Net income CAGR'),
    ];

    const valuation: MetricDef[] = [
        def('P/E (TTM)', pe != null ? `${pe.toFixed(1)}x` : 'N/A', s(spe != null ? `${spe.toFixed(1)}x` : 'N/A'), pe == null ? 'neutral' : pe < 15 ? 'good' : pe <= 25 ? 'good' : pe <= 35 ? 'warn' : 'bad', '<15 Cheap · 15–25 Fair · >30 Expensive'),
        def('P/B Ratio', mul(pbRatio), s(mul(spbRatio)), pbRatio == null ? 'neutral' : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad', 'Price/Book. <3 Fair · >10 Expensive'),
        def('FCF Yield', pct(fcfY), s(pct(sfcfY)), fcfY == null ? 'neutral' : fcfY > 0.05 ? 'good' : fcfY < 0 ? 'bad' : 'warn', 'FCF/Market Cap. >5% Value · <2% Expensive'),
    ];

    const quality: MetricDef[] = [
        def('Piotroski F', pio != null ? `${pio}/9` : 'N/A', s(spio != null ? `${spio}/9` : 'N/A'), pio == null ? 'neutral' : pio >= 7 ? 'good' : pio >= 4 ? 'warn' : 'bad', 'Financial strength 0–9. >7 Strong'),
        def('Beneish M', ben != null ? ben.toFixed(2) : 'N/A', s(sben != null ? sben.toFixed(2) : 'N/A'), ben == null ? 'neutral' : ben < -2.22 ? 'good' : ben < -1.78 ? 'warn' : 'bad', 'Earnings manipulation risk. < -2.22 Safe'),
        def('Margin Volatility', mv != null ? `${(mv * 100).toFixed(1)}%` : 'N/A', s(smv != null ? `${(smv * 100).toFixed(1)}%` : 'N/A'), mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad', 'EBIT margin std deviation. Lower = stable'),
        def('Loss Years (10Y)', `${niYrs}y`, s(`${sNiYrs}y`), niYrs === 0 ? 'good' : niYrs <= 2 ? 'good' : niYrs <= 4 ? 'warn' : 'bad', 'Years with net loss in last 10 years'),
        def('Dilution (5Y)', dil != null ? `${dil > 0 ? '+' : ''}${dil.toFixed(1)}%` : 'N/A', s(sdil != null ? `${sdil > 0 ? '+' : ''}${sdil.toFixed(1)}%` : 'N/A'), dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'good' : dil <= 10 ? 'warn' : 'bad', 'Share count change 5Y. Negative = buybacks'),
        def('SBC/Net Income', sbc != null ? `${sbc.toFixed(1)}%` : 'N/A', s(ssbc != null ? `${ssbc.toFixed(1)}%` : 'N/A'), sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad', 'Stock-based comp/Net income. >30% = dilution risk'),
    ];

    return { solvency, profitability, valuation, quality };
}

// ── Chunk array into rows of N ───────────────────────────────────────────────
function chunk<T>(arr: T[], n: number): (T | null)[][] {
    const rows: (T | null)[][] = [];
    for (let i = 0; i < arr.length; i += n) {
        const row = arr.slice(i, i + n) as (T | null)[];
        while (row.length < n) row.push(null);
        rows.push(row);
    }
    return rows;
}

// ── Main export ──────────────────────────────────────────────────────────────
export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: Props) {
    const { solvency, profitability, valuation, quality } = buildMetrics(data, secondaryData, compareWith);

    const solvRows  = chunk(solvency, 3);
    const profRows  = chunk(profitability, 3);
    const valRows   = chunk(valuation, 3);
    const qualRows  = chunk(quality, 3);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Key Financial Metrics</h4>
                        <p className="text-[10px] text-gray-400">Solvency · Profitability · Valuation · Quality & Growth</p>
                    </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full hidden sm:inline-flex">
                    Finnhub + Computed
                </span>
            </div>

            {/* Finviz-style table */}
            <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                    <colgroup>
                        <col className="w-[17%]" /><col className="w-[16%]" />
                        <col className="w-[17%]" /><col className="w-[16%]" />
                        <col className="w-[17%]" /><col className="w-[17%]" />
                    </colgroup>
                    <tbody>
                        <SectionRow title="Solvency & Debt" />
                        {solvRows.map((row, i) => (
                            <MetricRow key={`solv-${i}`} metrics={row} compareWith={compareWith} shade={i % 2 === 1} />
                        ))}

                        <SectionRow title="Profitability" />
                        {profRows.map((row, i) => (
                            <MetricRow key={`prof-${i}`} metrics={row} compareWith={compareWith} shade={i % 2 === 1} />
                        ))}

                        <SectionRow title="Valuation" />
                        {valRows.map((row, i) => (
                            <MetricRow key={`val-${i}`} metrics={row} compareWith={compareWith} shade={i % 2 === 1} />
                        ))}

                        <SectionRow title="Quality & Growth" />
                        {qualRows.map((row, i) => (
                            <MetricRow key={`qual-${i}`} metrics={row} compareWith={compareWith} shade={i % 2 === 1} />
                        ))}

                        {/* bottom padding row */}
                        <tr><td colSpan={6} className="py-2" /></tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
