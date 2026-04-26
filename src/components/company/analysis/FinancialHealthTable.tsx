import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { StatusType, STATUS_CLASSES } from '../shared/MetricCard';

interface Props {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

// ── Compact row ─────────────────────────────────────────────────────────────
function Row({
    label, value, statusLabel, statusType, hint, secondary, compareWith,
}: {
    label: string; value: string; statusLabel: string; statusType: StatusType;
    hint: string; secondary?: string; compareWith?: string;
}) {
    return (
        <div
            className="flex items-center justify-between py-[7px] px-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/40 transition-colors cursor-default group"
            title={hint}
        >
            <span className="text-[11px] text-gray-500 dark:text-gray-400 font-medium truncate pr-2 group-hover:text-gray-700 dark:group-hover:text-gray-300">
                {label}
            </span>
            <div className="flex items-center gap-1.5 flex-shrink-0">
                {compareWith && secondary && (
                    <span className="text-[11px] text-gray-400 font-medium hidden sm:block">{secondary}</span>
                )}
                <span className="text-[13px] font-bold text-gray-900 dark:text-white min-w-[52px] text-right tabular-nums">
                    {value}
                </span>
                <span className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[9px] font-bold border min-w-[54px] ${STATUS_CLASSES[statusType]}`}>
                    {statusLabel}
                </span>
            </div>
        </div>
    );
}

// ── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-100 dark:border-gray-700/50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/50">
                <span className="text-[9px] uppercase tracking-widest font-bold text-gray-400 dark:text-gray-500">
                    {title}
                </span>
            </div>
            <div className="p-1.5 space-y-0.5">{children}</div>
        </div>
    );
}

// ── Build metrics ────────────────────────────────────────────────────────────
function buildMetrics(data: AnalysisData, sec: AnalysisData | null, cw: string) {
    const m = data.metrics;
    const sm = sec?.metrics;
    const bs = data.balanceSheet;
    const sbs = sec?.balanceSheet;
    const fy = data.statements?.find(s => s.fiscalPeriod === 'FY');
    const sfy = sec?.statements?.find(s => s.fiscalPeriod === 'FY');

    const mcap = data.ticker?.lastMarketCap ? data.ticker.lastMarketCap * 1e9 : null;
    const smcap = sec?.ticker?.lastMarketCap ? sec.ticker.lastMarketCap * 1e9 : null;

    // helpers
    const pct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';
    const mul = (v: number | null | undefined, d = 2) => v != null ? `${v.toFixed(d)}x` : 'N/A';
    const yr  = (v: number | null | undefined) => v != null ? (v === 0 ? 'Net Cash' : `${v.toFixed(1)}y`) : 'N/A';
    const num = (v: number | null | undefined, d = 2) => v != null ? v.toFixed(d) : 'N/A';

    // derived
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
    const pe     = m?.currentPe ?? null;
    const spe    = sm?.currentPe ?? null;
    const fcfY   = m?.fcfYield ?? null;
    const sfcfY  = sm?.fcfYield ?? null;
    const pio    = data.piotroskiScore ?? null;
    const spio   = sec?.piotroskiScore ?? null;
    const ben    = data.beneishScore ?? null;
    const sben   = sec?.beneishScore ?? null;
    const rCagr  = data.revenueCagr ?? null;
    const srCagr = sec?.revenueCagr ?? null;
    const niCagr = data.netIncomeCagr ?? null;
    const sniCagr= sec?.netIncomeCagr ?? null;
    const mv     = data.marginStability ?? null;
    const smv    = sec?.marginStability ?? null;
    const niYrs  = data.negativeNiYears ?? 0;
    const sNiYrs = sec?.negativeNiYears ?? 0;
    const dil    = bs?.dilution5y;
    const sdil   = sbs?.dilution5y;
    const sbc    = bs?.sbcRatio;
    const ssbc   = sbs?.sbcRatio;
    const cr     = bs?.currentRatio ?? null;
    const scr    = sbs?.currentRatio ?? null;
    const dte    = bs?.debtToEquity ?? null;
    const sdte   = sbs?.debtToEquity ?? null;
    const nde    = bs?.netDebtToEbitda ?? null;
    const snde   = sbs?.netDebtToEbitda ?? null;
    const fcfMar = m?.fcfMargin ?? null;
    const sfcfMar= sm?.fcfMargin ?? null;
    const fcfCon = m?.fcfConversion ?? null;
    const sfcfCon= sm?.fcfConversion ?? null;

    const s = (v: string | undefined) => cw ? v : undefined;

    return {
        solvency: [
            { label: 'Altman Z-Score', value: num(altZ), secondary: s(num(saltZ)), hint: '>3 Safe · 1.8–3 Grey · <1.8 Distress', statusLabel: altZ == null ? 'N/A' : altZ > 3 ? 'Safe' : altZ < 1.8 ? 'Distress' : 'Grey Zone', statusType: (altZ == null ? 'neutral' : altZ > 3 ? 'good' : altZ < 1.8 ? 'bad' : 'warn') as StatusType },
            { label: 'Debt Repayment', value: yr(debtRp), secondary: s(yr(sDebtRp)), hint: 'Years to repay net debt from FCF. 0=Net Cash', statusLabel: debtRp == null ? 'N/A' : debtRp === 0 ? 'Excellent' : debtRp < 3 ? 'Strong' : debtRp > 10 ? 'Weak' : 'Adequate', statusType: (debtRp == null ? 'neutral' : debtRp <= 3 ? 'good' : debtRp > 10 ? 'bad' : 'warn') as StatusType },
            { label: 'Interest Coverage', value: intCov != null ? `${intCov.toFixed(1)}x` : 'N/A', secondary: s(intCov != null ? `${intCov.toFixed(1)}x` : 'N/A'), hint: 'EBIT/Interest. >10 Strong · 3–10 OK · <3 Risk', statusLabel: intCov == null ? 'N/A' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Adequate' : intCov > 0 ? 'Weak' : 'None', statusType: (intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad') as StatusType },
            { label: 'Current Ratio', value: mul(cr, 2), secondary: s(mul(scr, 2)), hint: 'Current Assets/Liabilities. >2 Strong · 1–2 OK · <1 Risk', statusLabel: cr == null ? 'N/A' : cr > 2 ? 'Strong' : cr > 1 ? 'Adequate' : 'Weak', statusType: (cr == null ? 'neutral' : cr > 2 ? 'good' : cr > 1 ? 'warn' : 'bad') as StatusType },
            { label: 'Net Debt / EBITDA', value: nde != null ? (nde < 0 ? 'Net Cash' : `${nde.toFixed(1)}x`) : 'N/A', secondary: s(snde != null ? (snde < 0 ? 'Net Cash' : `${snde.toFixed(1)}x`) : 'N/A'), hint: 'Leverage ratio. <2x Good · 4x+ High risk', statusLabel: nde == null ? 'N/A' : nde < 0 ? 'Net Cash' : nde < 2 ? 'Low' : nde < 4 ? 'Moderate' : 'High', statusType: (nde == null ? 'neutral' : nde < 0 ? 'good' : nde < 2 ? 'good' : nde < 4 ? 'warn' : 'bad') as StatusType },
            { label: 'Debt / Equity', value: dte != null ? `${dte.toFixed(2)}x` : 'N/A', secondary: s(sdte != null ? `${sdte.toFixed(2)}x` : 'N/A'), hint: '<1 Conservative · 1–2 Moderate · >3 Risky', statusLabel: dte == null ? 'N/A' : dte < 1 ? 'Low' : dte < 2 ? 'Moderate' : 'High', statusType: (dte == null ? 'neutral' : dte < 1 ? 'good' : dte < 2 ? 'warn' : 'bad') as StatusType },
        ],
        profitability: [
            { label: 'ROE (TTM)', value: pct(roe), secondary: s(pct(sroe)), hint: 'Return on Equity. >20% Strong · 10–20% Good', statusLabel: roe == null ? 'N/A' : roe > 0.20 ? 'Strong' : roe > 0.10 ? 'Good' : roe > 0 ? 'Weak' : 'Negative', statusType: (roe == null ? 'neutral' : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad') as StatusType },
            { label: 'Net Margin', value: pct(netMar), secondary: s(pct(sNetMar)), hint: 'Net Income/Revenue. >20% Excellent · <5% Thin', statusLabel: netMar == null ? 'N/A' : netMar > 0.20 ? 'Strong' : netMar > 0.10 ? 'Good' : netMar > 0.05 ? 'Fair' : netMar > 0 ? 'Thin' : 'Loss', statusType: (netMar == null ? 'neutral' : netMar > 0.10 ? 'good' : netMar > 0.05 ? 'warn' : 'bad') as StatusType },
            { label: 'Gross Margin', value: pct(grossMar), secondary: s(pct(sGrossMar)), hint: 'Gross Profit/Revenue. >50% Premium · <20% Commodity', statusLabel: grossMar == null ? 'N/A' : grossMar > 0.50 ? 'Premium' : grossMar > 0.30 ? 'Healthy' : grossMar > 0.15 ? 'Fair' : 'Thin', statusType: (grossMar == null ? 'neutral' : grossMar > 0.50 ? 'good' : grossMar > 0.30 ? 'good' : grossMar > 0.15 ? 'warn' : 'bad') as StatusType },
            { label: 'FCF Margin', value: pct(fcfMar), secondary: s(pct(sfcfMar)), hint: 'Free Cash Flow/Revenue. >15% Excellent', statusLabel: fcfMar == null ? 'N/A' : fcfMar > 0.15 ? 'Strong' : fcfMar > 0.08 ? 'Good' : fcfMar > 0 ? 'Thin' : 'Negative', statusType: (fcfMar == null ? 'neutral' : fcfMar > 0.15 ? 'good' : fcfMar > 0.08 ? 'warn' : 'bad') as StatusType },
            { label: 'FCF Conversion', value: pct(fcfCon), secondary: s(pct(sfcfCon)), hint: 'FCF/Net Income. >80% Efficient earnings quality', statusLabel: fcfCon == null ? 'N/A' : fcfCon > 0.80 ? 'Efficient' : fcfCon > 0.50 ? 'Steady' : fcfCon > 0 ? 'Low' : 'Negative', statusType: (fcfCon == null ? 'neutral' : fcfCon > 0.80 ? 'good' : fcfCon > 0.50 ? 'warn' : 'bad') as StatusType },
        ],
        valuation: [
            { label: 'P/E Ratio (TTM)', value: pe != null ? `${pe.toFixed(1)}x` : 'N/A', secondary: s(spe != null ? `${spe.toFixed(1)}x` : 'N/A'), hint: '<15 Cheap · 15–25 Fair · >30 Expensive', statusLabel: pe == null ? 'N/A' : pe < 15 ? 'Cheap' : pe <= 25 ? 'Fair' : pe <= 35 ? 'Rich' : 'Expensive', statusType: (pe == null ? 'neutral' : pe < 15 ? 'good' : pe <= 25 ? 'good' : pe <= 35 ? 'warn' : 'bad') as StatusType },
            { label: 'P/B Ratio', value: mul(pbRatio), secondary: s(mul(spbRatio)), hint: 'Price/Book. <3 Fair · >10 Expensive', statusLabel: pbRatio == null ? 'N/A' : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Moderate' : 'High', statusType: (pbRatio == null ? 'neutral' : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad') as StatusType },
            { label: 'FCF Yield', value: pct(fcfY), secondary: s(pct(sfcfY)), hint: 'FCF/Market Cap. >5% Good value · <2% Expensive', statusLabel: fcfY == null ? 'N/A' : fcfY > 0.05 ? 'High' : fcfY < 0 ? 'Negative' : fcfY > 0.03 ? 'Moderate' : 'Low', statusType: (fcfY == null ? 'neutral' : fcfY > 0.05 ? 'good' : fcfY < 0 ? 'bad' : 'warn') as StatusType },
        ],
        quality: [
            { label: 'Piotroski F-Score', value: pio != null ? `${pio}/9` : 'N/A', secondary: s(spio != null ? `${spio}/9` : 'N/A'), hint: 'Financial strength (0–9). >7 Strong · 3–7 Average · <3 Weak', statusLabel: pio == null ? 'N/A' : pio >= 7 ? 'Strong' : pio >= 4 ? 'Average' : 'Weak', statusType: (pio == null ? 'neutral' : pio >= 7 ? 'good' : pio >= 4 ? 'warn' : 'bad') as StatusType },
            { label: 'Beneish M-Score', value: ben != null ? ben.toFixed(2) : 'N/A', secondary: s(sben != null ? sben.toFixed(2) : 'N/A'), hint: 'Earnings manipulation risk. < -2.22 Low risk · > -1.78 Manipulator', statusLabel: ben == null ? 'N/A' : ben < -2.22 ? 'Low Risk' : ben < -1.78 ? 'Watch' : 'High Risk', statusType: (ben == null ? 'neutral' : ben < -2.22 ? 'good' : ben < -1.78 ? 'warn' : 'bad') as StatusType },
            { label: 'Revenue CAGR', value: rCagr != null ? `${(rCagr * 100).toFixed(1)}%` : 'N/A', secondary: s(srCagr != null ? `${(srCagr * 100).toFixed(1)}%` : 'N/A'), hint: 'Compound annual revenue growth rate', statusLabel: rCagr == null ? 'N/A' : rCagr > 0.15 ? 'High' : rCagr > 0.05 ? 'Moderate' : rCagr > 0 ? 'Low' : 'Declining', statusType: (rCagr == null ? 'neutral' : rCagr > 0.15 ? 'good' : rCagr > 0.05 ? 'warn' : rCagr > 0 ? 'warn' : 'bad') as StatusType },
            { label: 'NI CAGR', value: niCagr != null ? `${(niCagr * 100).toFixed(1)}%` : 'N/A', secondary: s(sniCagr != null ? `${(sniCagr * 100).toFixed(1)}%` : 'N/A'), hint: 'Net income compound annual growth rate', statusLabel: niCagr == null ? 'N/A' : niCagr > 0.15 ? 'High' : niCagr > 0.05 ? 'Moderate' : niCagr > 0 ? 'Low' : 'Declining', statusType: (niCagr == null ? 'neutral' : niCagr > 0.15 ? 'good' : niCagr > 0.05 ? 'warn' : niCagr > 0 ? 'warn' : 'bad') as StatusType },
            { label: 'Margin Volatility', value: mv != null ? `${(mv * 100).toFixed(1)}%` : 'N/A', secondary: s(smv != null ? `${(smv * 100).toFixed(1)}%` : 'N/A'), hint: 'EBIT margin std deviation. Lower = more stable', statusLabel: mv == null ? 'N/A' : mv < 0.03 ? 'Stable' : mv < 0.08 ? 'Normal' : mv < 0.15 ? 'Volatile' : 'Unstable', statusType: (mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad') as StatusType },
            { label: 'Loss Years (10Y)', value: `${niYrs}y`, secondary: s(`${sNiYrs}y`), hint: 'Years with net loss in last 10 years. 0 = always profitable', statusLabel: niYrs === 0 ? 'Excellent' : niYrs <= 2 ? 'Good' : niYrs <= 4 ? 'Concern' : 'Poor', statusType: (niYrs === 0 ? 'good' : niYrs <= 2 ? 'good' : niYrs <= 4 ? 'warn' : 'bad') as StatusType },
            { label: 'Dilution (5Y)', value: dil != null ? `${dil > 0 ? '+' : ''}${dil.toFixed(1)}%` : 'N/A', secondary: s(sdil != null ? `${sdil > 0 ? '+' : ''}${sdil.toFixed(1)}%` : 'N/A'), hint: 'Share count change 5Y. Negative = buybacks (good)', statusLabel: dil == null ? 'N/A' : dil < -2 ? 'Buyback' : dil <= 2 ? 'Stable' : dil <= 10 ? 'Diluting' : 'Heavy', statusType: (dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'good' : dil <= 10 ? 'warn' : 'bad') as StatusType },
            { label: 'SBC / Net Income', value: sbc != null ? `${sbc.toFixed(1)}%` : 'N/A', secondary: s(ssbc != null ? `${ssbc.toFixed(1)}%` : 'N/A'), hint: 'Stock-based comp as % of net income. >30% = significant dilution risk', statusLabel: sbc == null ? 'N/A' : sbc < 10 ? 'Low' : sbc < 20 ? 'Moderate' : sbc < 40 ? 'High' : 'Excessive', statusType: (sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad') as StatusType },
        ],
    };
}

// ── Main export ──────────────────────────────────────────────────────────────
export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: Props) {
    const { solvency, profitability, valuation, quality } = buildMetrics(data, secondaryData, compareWith);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Key Financial Metrics</h4>
                        <p className="text-xs text-gray-400">Solvency · Profitability · Valuation · Quality & Growth</p>
                    </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full hidden sm:inline-flex">
                    Finnhub + Computed
                </span>
            </div>

            {/* 2×2 grid of sections */}
            <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-2 gap-3">
                <Section title="Solvency & Debt">
                    {solvency.map(r => <Row key={r.label} {...r} compareWith={compareWith} />)}
                </Section>
                <Section title="Profitability">
                    {profitability.map(r => <Row key={r.label} {...r} compareWith={compareWith} />)}
                </Section>
                <Section title="Valuation">
                    {valuation.map(r => <Row key={r.label} {...r} compareWith={compareWith} />)}
                </Section>
                <Section title="Quality & Growth">
                    {quality.map(r => <Row key={r.label} {...r} compareWith={compareWith} />)}
                </Section>
            </div>
        </div>
    );
}
