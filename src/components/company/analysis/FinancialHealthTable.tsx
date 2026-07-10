import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { CompactMetricRow, MetricCardDef, StatusType, StatusBadge } from '../shared/MetricCard';
import { getColorClass, getStrokeColor } from './ScoreCard';

interface Props {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

// ── Score Ring (redesigned for Summary Card) ────────────────────────────────
function ScoreRing({ label, score }: { label: string; score: number | null }) {
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const displayScore = (score != null && !isNaN(score)) ? score : 0;
    const strokeDashoffset = circumference - (displayScore / 100) * circumference;
    const color = getColorClass(score);
    const stroke = getStrokeColor(score);
    return (
        <div className="flex flex-col items-center gap-1.5">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500">{label}</p>
            <div className="relative w-[76px] h-[76px] sm:w-[100px] sm:h-[100px]">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r={radius} fill="transparent" stroke="currentColor" strokeWidth="8" className="text-gray-100 dark:text-gray-700" />
                    <circle cx="50" cy="50" r={radius} fill="transparent" stroke={stroke} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-700 ease-out" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-lg sm:text-2xl font-bold ${color}`}>{score ?? '—'}</span>
                    <span className="text-[8px] sm:text-[9px] text-gray-400 mt-0.5">/ 100</span>
                </div>
            </div>
        </div>
    );
}

// ── Build all metrics ────────────────────────────────────────────────────────
function buildMetrics(data: AnalysisData, sec: AnalysisData | null, cw: string) {
    const m = data.metrics;
    const sm = sec?.metrics;
    const bs = data.balanceSheet;
    const sbs = sec?.balanceSheet;
    const fy = data.statements?.filter(s => s.fiscalPeriod === 'FY').sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
    const sfy = sec?.statements?.filter(s => s.fiscalPeriod === 'FY').sort((a, b) => new Date(b.endDate).getTime() - new Date(a.endDate).getTime())[0];
    const mcap = data.ticker?.lastMarketCap ? data.ticker.lastMarketCap * 1e9 : null;
    const smcap = sec?.ticker?.lastMarketCap ? sec.ticker.lastMarketCap * 1e9 : null;

    const pct = (v: number | null | undefined) => v != null ? `${(v * 100).toFixed(1)}%` : 'N/A';
    const yr  = (v: number | null | undefined) => v != null ? (v === 0 ? 'Net Cash' : `${v.toFixed(1)}y`) : 'N/A';
    const mul = (v: number | null | undefined, d = 2) => v != null ? `${v.toFixed(d)}x` : 'N/A';
    const s   = (v: string | undefined) => cw ? v : undefined;

    // Helper formatting
    function fmtB(val: number | null | undefined): string {
        if (val == null) return 'N/A';
        const absVal = Math.abs(val);
        if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
        if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
        if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
        return `$${val.toFixed(0)}`;
    }

    const ttm = data.ttm;
    const sttm = sec?.ttm;

    const fh = data.finnhub;
    const sfh = sec?.finnhub;

    const hasNegEquity  = bs?.totalEquity != null && bs.totalEquity <= 0;

    // ROE: prefer Finnhub (returns %), fallback to our calculation (decimal)
    // If equity is negative, ROE is misleading — show 'Neg. Equity' instead
    const roe      = hasNegEquity ? null : (fh?.roe != null ? fh.roe / 100 : ((ttm?.netIncome != null && bs?.totalEquity != null && bs.totalEquity > 0) ? ttm.netIncome / bs.totalEquity : null));
    const sroe     = (sbs?.totalEquity != null && sbs.totalEquity <= 0) ? null : (sfh?.roe != null ? sfh.roe / 100 : ((sttm?.netIncome != null && sbs?.totalEquity != null && sbs.totalEquity > 0) ? sttm.netIncome / sbs.totalEquity : null));
    // Net Margin: prefer Finnhub (returns %)
    const netMar   = fh?.netMargin != null ? fh.netMargin / 100 : ((ttm?.netIncome != null && ttm?.revenue != null && ttm.revenue > 0) ? ttm.netIncome / ttm.revenue : null);
    const sNetMar  = sfh?.netMargin != null ? sfh.netMargin / 100 : ((sttm?.netIncome != null && sttm?.revenue != null && sttm.revenue > 0) ? sttm.netIncome / sttm.revenue : null);
    // Gross Margin: prefer Finnhub (returns %)
    const grossMar = fh?.grossMargin != null ? fh.grossMargin / 100 : ((ttm?.grossProfit != null && ttm?.revenue != null && ttm.revenue > 0) ? ttm.grossProfit / ttm.revenue : null);
    const sGrossMar= sfh?.grossMargin != null ? sfh.grossMargin / 100 : ((sttm?.grossProfit != null && sttm?.revenue != null && sttm.revenue > 0) ? sttm.grossProfit / sttm.revenue : null);
    // P/B: prefer Finnhub, fallback to our calculation
    const pbRatio  = fh?.pbRatio ?? ((mcap != null && bs?.totalEquity != null && bs.totalEquity > 0) ? mcap / bs.totalEquity : null);
    const spbRatio = sfh?.pbRatio ?? ((smcap != null && sbs?.totalEquity != null && sbs.totalEquity > 0) ? smcap / sbs.totalEquity : null);
    // P/S: prefer Finnhub, fallback to our calculation
    const psRatio  = fh?.psRatio ?? ((mcap != null && ttm?.revenue != null && ttm.revenue > 0) ? mcap / ttm.revenue : null);
    const spsRatio = sfh?.psRatio ?? ((smcap != null && sttm?.revenue != null && sttm.revenue > 0) ? smcap / sttm.revenue : null);

    const altZ   = m?.altmanZ ?? m?.zScore ?? null;
    const saltZ  = sm?.altmanZ ?? sm?.zScore ?? null;
    const debtRp = m?.debtRepaymentYears ?? m?.debtRepaymentTime ?? null;
    const sDebtRp= sm?.debtRepaymentYears ?? sm?.debtRepaymentTime ?? null;
    const intCov = fh?.interestCoverage ?? data.interestCoverage ?? null;
    const sIntCov= sfh?.interestCoverage ?? sec?.interestCoverage ?? null;
    const cr     = fh?.currentRatio ?? bs?.currentRatio ?? null;
    const scr    = sfh?.currentRatio ?? sbs?.currentRatio ?? null;
    const nde    = bs?.netDebtToEbit ?? null;
    const snde   = sbs?.netDebtToEbit ?? null;
    const dte    = fh?.debtEquityRatio ?? bs?.debtToEquity ?? null;
    const sdte   = sfh?.debtEquityRatio ?? sbs?.debtToEquity ?? null;
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
        statusType: StatusType, statusLabel: string, hint: string,
        progress?: number
    ): MetricCardDef => ({ label, value, secondaryValue: secondary, statusType, statusLabel, hint, ...(progress !== undefined ? { progress } : {}) });

    const solvency: MetricCardDef[] = [
        def('Altman Z-Score', altZ != null ? altZ.toFixed(2) : 'N/A', s(altZ != null ? altZ.toFixed(2) : 'N/A'), altZ == null ? 'neutral' : altZ > 3 ? 'good' : altZ < 1.8 ? 'bad' : 'warn', altZ == null ? '-' : altZ > 3 ? 'Safe' : altZ < 1.8 ? 'Distress' : 'Grey', 'Bankruptcy risk. >3 Safe, <1.8 Distress', altZ != null ? (altZ / 5) * 100 : undefined),
        def('Debt Repayment', yr(debtRp), s(yr(sDebtRp)), debtRp == null ? 'neutral' : debtRp <= 3 ? 'good' : debtRp > 10 ? 'bad' : 'warn', debtRp == null ? '-' : debtRp <= 3 ? 'Fast' : debtRp > 10 ? 'Slow' : 'Avg', 'Years to repay net debt via FCF', debtRp != null ? (debtRp / 10) * 100 : undefined),
        def('Interest Coverage', intCov != null ? `${intCov.toFixed(1)}x` : 'N/A', s(intCov != null ? `${intCov.toFixed(1)}x` : 'N/A'), intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad', intCov == null ? '-' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Ok' : 'Risky', 'EBIT/Interest. >10 Strong', intCov != null ? (intCov / 15) * 100 : undefined),
        def('Current Ratio', mul(cr), s(mul(scr)), cr == null ? 'neutral' : cr > 2 ? 'good' : cr > 1 ? 'warn' : 'bad', cr == null ? '-' : cr > 2 ? 'High' : cr > 1 ? 'Ok' : 'Low', 'Current Assets/Liabilities', cr != null ? (cr / 3) * 100 : undefined),
        def('Net Debt/EBIT', nde != null ? (nde < 0 ? 'Net Cash' : `${nde.toFixed(1)}x`) : 'N/A', s(snde != null ? (snde < 0 ? 'Net Cash' : `${snde.toFixed(1)}x`) : 'N/A'), nde == null ? 'neutral' : nde < 0 ? 'good' : nde < 2 ? 'good' : nde < 4 ? 'warn' : 'bad', nde == null ? '-' : nde < 2 ? 'Low' : nde < 4 ? 'Med' : 'High', 'Leverage. <2x Low, >4x High', nde != null ? Math.max(0, (nde / 5) * 100) : undefined),
        def('Debt/Equity', dte != null ? `${dte.toFixed(2)}x` : 'N/A', s(sdte != null ? `${sdte.toFixed(2)}x` : 'N/A'), dte == null ? 'neutral' : dte < 1 ? 'good' : dte < 2 ? 'warn' : 'bad', dte == null ? '-' : dte < 1 ? 'Low' : dte < 2 ? 'Med' : 'High', '<1 Conservative, >2 Risky', dte != null ? (dte / 3) * 100 : undefined),
    ];

    const profitability: MetricCardDef[] = [
        def('ROE', roe != null ? pct(roe) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), s(sroe != null ? pct(sroe) : 'N/A'), roe == null ? (hasNegEquity ? 'warn' : 'neutral') : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad', roe == null ? (hasNegEquity ? 'Buybacks' : '-') : roe > 0.2 ? 'Strong' : roe > 0.1 ? 'Avg' : 'Weak', 'Return on Equity. Neg. equity = heavy buybacks', roe != null ? (roe / 0.3) * 100 : undefined),
        def('Net Margin', pct(netMar), s(pct(sNetMar)), netMar == null ? 'neutral' : netMar > 0.10 ? 'good' : netMar > 0.05 ? 'warn' : 'bad', netMar == null ? '-' : netMar > 0.1 ? 'High' : netMar > 0.05 ? 'Avg' : 'Low', 'Net Income / Revenue', netMar != null ? (netMar / 0.3) * 100 : undefined),
        def('Gross Margin', pct(grossMar), s(pct(sGrossMar)), grossMar == null ? 'neutral' : grossMar > 0.50 ? 'good' : grossMar > 0.30 ? 'warn' : 'bad', grossMar == null ? '-' : grossMar > 0.5 ? 'Premium' : grossMar > 0.3 ? 'Avg' : 'Low', 'Gross Profit / Revenue', grossMar != null ? (grossMar / 0.7) * 100 : undefined),
        def('FCF Margin', pct(fcfMar), s(pct(sfcfMar)), fcfMar == null ? 'neutral' : fcfMar > 0.15 ? 'good' : fcfMar > 0.08 ? 'warn' : 'bad', fcfMar == null ? '-' : fcfMar > 0.15 ? 'High' : fcfMar > 0.08 ? 'Avg' : 'Low', 'FCF / Revenue', fcfMar != null ? (fcfMar / 0.3) * 100 : undefined),
        def('FCF Conversion', pct(fcfCon), s(pct(sfcfCon)), fcfCon == null ? 'neutral' : fcfCon > 0.80 ? 'good' : fcfCon > 0.50 ? 'warn' : 'bad', fcfCon == null ? '-' : fcfCon > 0.8 ? 'Strong' : fcfCon > 0.5 ? 'Avg' : 'Poor', 'FCF / Net Income', fcfCon != null ? (fcfCon / 1.5) * 100 : undefined),
    ];

    const growth: MetricCardDef[] = [
        def('Revenue CAGR (5Y)', rCagr != null ? `${rCagr.toFixed(1)}%` : 'N/A', s(srCagr != null ? `${srCagr.toFixed(1)}%` : 'N/A'), rCagr == null ? 'neutral' : rCagr > 15 ? 'good' : rCagr > 5 ? 'warn' : 'bad', rCagr == null ? '-' : rCagr > 15 ? 'High' : rCagr > 5 ? 'Ok' : 'Low', 'Compound annual revenue growth'),
        def('Net Income CAGR (5Y)', niCagr != null ? `${niCagr.toFixed(1)}%` : 'N/A', s(sniCagr != null ? `${sniCagr.toFixed(1)}%` : 'N/A'), niCagr == null ? 'neutral' : niCagr > 15 ? 'good' : niCagr > 5 ? 'warn' : 'bad', niCagr == null ? '-' : niCagr > 15 ? 'High' : niCagr > 5 ? 'Ok' : 'Low', 'Compound annual net income growth'),
        def('Dilution (5Y)', dil != null ? `${dil > 0 ? '+' : ''}${dil.toFixed(1)}%` : 'N/A', s(sdil != null ? `${sdil > 0 ? '+' : ''}${sdil.toFixed(1)}%` : 'N/A'), dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'neutral' : dil <= 10 ? 'warn' : 'bad', dil == null ? '-' : dil < -2 ? 'Buybacks' : dil <= 2 ? 'Flat' : 'Dilutive', 'Share count change over 5Y'),
    ];

    const valuation: MetricCardDef[] = [
        def('Market Cap', fmtB(mcap), s(fmtB(smcap)), 'neutral', 'Size', 'Current Market Capitalization'),
        def('P/E (TTM)', pe != null ? `${pe.toFixed(1)}x` : 'N/A', s(spe != null ? `${spe.toFixed(1)}x` : 'N/A'), pe == null ? 'neutral' : pe < 15 ? 'good' : pe <= 25 ? 'neutral' : pe <= 35 ? 'warn' : 'bad', pe == null ? '-' : pe < 15 ? 'Cheap' : pe <= 25 ? 'Fair' : 'Exp.', 'Price to Earnings', pe != null ? (pe / 40) * 100 : undefined),
        def('P/S (TTM)', psRatio != null ? `${psRatio.toFixed(2)}x` : 'N/A', s(spsRatio != null ? `${spsRatio.toFixed(2)}x` : 'N/A'), psRatio == null ? 'neutral' : psRatio < 2 ? 'good' : psRatio <= 5 ? 'neutral' : psRatio <= 10 ? 'warn' : 'bad', psRatio == null ? '-' : psRatio < 2 ? 'Cheap' : psRatio <= 5 ? 'Fair' : 'Exp.', 'Price to Sales', psRatio != null ? (psRatio / 15) * 100 : undefined),
        def('P/B Ratio', pbRatio != null ? mul(pbRatio) : (hasNegEquity ? 'Neg. Equity' : 'N/A'), s(spbRatio != null ? mul(spbRatio) : 'N/A'), pbRatio == null ? (hasNegEquity ? 'warn' : 'neutral') : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad', pbRatio == null ? (hasNegEquity ? 'Buybacks' : '-') : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Exp.' : 'V.Exp.', 'Price to Book Value. Neg. equity = heavy buybacks', pbRatio != null ? (pbRatio / 10) * 100 : undefined),
        def('FCF Yield', pct(fcfY), s(pct(sfcfY)), fcfY == null ? 'neutral' : fcfY > 0.05 ? 'good' : fcfY < 0 ? 'bad' : 'warn', fcfY == null ? '-' : fcfY > 0.05 ? 'Value' : fcfY < 0 ? 'Negative' : 'Low', 'FCF / Market Cap', fcfY != null ? Math.max(0, (fcfY / 0.1) * 100) : undefined),
    ];

    const quality: MetricCardDef[] = [
        def('Piotroski F-Score', pio != null ? `${pio}/9` : 'N/A', s(spio != null ? `${spio}/9` : 'N/A'), pio == null ? 'neutral' : pio >= 7 ? 'good' : pio >= 4 ? 'warn' : 'bad', pio == null ? '-' : pio >= 7 ? 'Strong' : pio >= 4 ? 'Avg' : 'Weak', 'Financial strength 0–9. >7 Strong', pio != null ? (pio / 9) * 100 : undefined),
        def('Beneish M-Score', ben != null ? ben.toFixed(2) : 'N/A', s(sben != null ? sben.toFixed(2) : 'N/A'), ben == null ? 'neutral' : ben < -2.22 ? 'good' : ben < -1.78 ? 'warn' : 'bad', ben == null ? '-' : ben < -2.22 ? 'Safe' : ben < -1.78 ? 'Grey' : 'Risky', 'Earnings manipulation risk. < -2.22 Safe', ben != null ? Math.min(100, Math.max(0, ((ben + 3) / 1.5) * 100)) : undefined),
        def('Margin Volatility', mv != null ? `${(mv * 100).toFixed(1)}%` : 'N/A', s(smv != null ? `${(smv * 100).toFixed(1)}%` : 'N/A'), mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad', mv == null ? '-' : mv < 0.08 ? 'Stable' : mv < 0.15 ? 'Avg' : 'Volatile', 'EBIT margin std deviation. Lower = stable'),
        def('SBC / Net Income', sbc != null ? `${sbc.toFixed(1)}%` : 'N/A', s(ssbc != null ? `${ssbc.toFixed(1)}%` : 'N/A'), sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad', sbc == null ? '-' : sbc < 10 ? 'Low' : sbc < 20 ? 'Med' : 'High', 'Stock-based comp/Net income. >30% = dilution risk'),
    ];

    const balanceSheet: MetricCardDef[] = [
        def('Total Debt', fmtB(bs?.totalDebt), s(fmtB(sbs?.totalDebt)), 'neutral', '-', 'Total debt obligations (short + long term)'),
        def('Cash & Equiv.', fmtB(bs?.cash), s(fmtB(sbs?.cash)), 'neutral', '-', 'Cash and short-term investments'),
        def('Net Debt', fmtB(bs?.netDebt), s(fmtB(sbs?.netDebt)), bs?.netDebt != null ? (bs.netDebt < 0 ? 'good' : 'neutral') : 'neutral', bs?.netDebt != null && bs.netDebt < 0 ? 'Net Cash' : '-', 'Total Debt minus Cash. Negative = Net Cash position'),
        def('Total Equity', fmtB(bs?.totalEquity), s(fmtB(sbs?.totalEquity)), 'neutral', '-', "Shareholders' equity (book value)"),
        def('Current Ratio', bs?.currentRatio != null ? `${bs.currentRatio.toFixed(2)}x` : 'N/A', s(sbs?.currentRatio != null ? `${sbs.currentRatio.toFixed(2)}x` : 'N/A'), bs?.currentRatio == null ? 'neutral' : bs.currentRatio >= 2 ? 'good' : bs.currentRatio >= 1 ? 'warn' : 'bad', bs?.currentRatio == null ? '-' : bs.currentRatio >= 2 ? 'Strong' : bs.currentRatio >= 1 ? 'Adequate' : 'Weak', 'Current Assets / Current Liabilities. > 2 is strong', bs?.currentRatio != null ? Math.min(100, (bs.currentRatio / 3) * 100) : undefined),
        def('Asset / Liability', bs?.assetToLiability != null ? `${bs.assetToLiability.toFixed(2)}x` : 'N/A', s(sbs?.assetToLiability != null ? `${sbs.assetToLiability.toFixed(2)}x` : 'N/A'), bs?.assetToLiability == null ? 'neutral' : bs.assetToLiability >= 2 ? 'good' : bs.assetToLiability >= 1 ? 'warn' : 'bad', bs?.assetToLiability == null ? '-' : bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky', 'Total Assets / Total Liabilities', bs?.assetToLiability != null ? Math.min(100, (bs.assetToLiability / 3) * 100) : undefined),
    ];


    return { solvency, profitability, growth, valuation, quality, balanceSheet, lossYears: niYrs };
}

// ── Sub-component for Grid Section ───────────────────────────────────────────
function MetricGrid({ title, metrics, compareWith, children }: { title: string, metrics: MetricCardDef[], compareWith: string, children?: React.ReactNode }) {
    return (
        <div className="break-inside-avoid bg-white dark:bg-[#15171e] rounded-2xl p-4 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800/80 mb-4 sm:mb-6">
            <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">{title}</h3>
                {children}
            </div>
            <div className="flex flex-col">
                {metrics.map((m, idx) => (
                    <CompactMetricRow key={idx} card={m} compareWith={compareWith} />
                ))}
            </div>
        </div>
    );
}

// ── Main export ──────────────────────────────────────────────────────────────
export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: Props) {
    const { solvency, profitability, growth, valuation, quality, balanceSheet, lossYears } = buildMetrics(data, secondaryData, compareWith);

    return (
        <div className="bg-transparent">
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">Key Financial Metrics</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Comprehensive view of financial health, valuation, and quality</p>
                    </div>
                </div>
            </div>

            {/* Summary Card: Scores + AI Verdict */}
            <div className="bg-white dark:bg-[#15171e] rounded-2xl p-4 sm:p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800/80 mb-6">
                <div className="flex flex-col lg:flex-row items-center gap-4 sm:gap-6">
                    <div className="flex items-center justify-center gap-4 sm:gap-8 shrink-0 flex-wrap">
                        <ScoreRing label="Health" score={data.healthScore} />
                        <ScoreRing label="Profitability" score={data.profitabilityScore} />
                        <ScoreRing label="Valuation" score={data.valuationScore} />
                    </div>
                    <div className="flex-1 min-w-0 w-full">
                        {data.verdictText && (
                            <div className="mb-3">
                                <p className="text-[10px] uppercase tracking-widest font-bold text-blue-500 dark:text-blue-400 mb-2">AI Verdict</p>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{data.verdictText}</p>
                            </div>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-gray-400 dark:text-gray-500">
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span>80-100 Excellent</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500"></span>50-79 Average</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500"></span>0-49 Weak</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Sections */}
            <div className="columns-1 sm:columns-2 xl:columns-3 gap-4 sm:gap-6">
                <MetricGrid title="Profitability" metrics={profitability} compareWith={compareWith}>
                    {lossYears > 0 && (
                        <StatusBadge label={`${lossYears} Loss Years (10Y)`} type={lossYears <= 2 ? 'warn' : 'bad'} />
                    )}
                </MetricGrid>
                <MetricGrid title="Valuation" metrics={valuation} compareWith={compareWith} />
                <MetricGrid title="Growth & Dilution" metrics={growth} compareWith={compareWith} />
                <MetricGrid title="Solvency & Debt" metrics={solvency} compareWith={compareWith} />
                <MetricGrid title="Quality & Risk" metrics={quality} compareWith={compareWith} />
                <MetricGrid title="Balance Sheet" metrics={balanceSheet} compareWith={compareWith} />
            </div>
        </div>
    );
}
