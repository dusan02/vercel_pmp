import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { MetricCard, MetricCardDef } from '../shared/MetricCard';

interface FinancialHealthTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

// ─── Section divider (same style as BalanceSheetTable) ───
function SectionLabel({ title }: { title: string }) {
    return (
        <div className="flex items-center gap-2 col-span-full">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">{title}</span>
            <div className="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
        </div>
    );
}

function buildCards(data: AnalysisData, secondaryData: AnalysisData | null, compareWith: string) {
    const m = data.metrics;
    const sm = secondaryData?.metrics;
    const bs = data.balanceSheet;
    const sbs = secondaryData?.balanceSheet;
    const latestAnnual = data.statements?.find(s => s.fiscalPeriod === 'FY');
    const secLatestAnnual = secondaryData?.statements?.find(s => s.fiscalPeriod === 'FY');

    const altmanZ = m?.altmanZ ?? m?.zScore ?? null;
    const secAltmanZ = sm?.altmanZ ?? sm?.zScore ?? null;
    const debtRepay = m?.debtRepaymentYears ?? m?.debtRepaymentTime ?? null;
    const secDebtRepay = sm?.debtRepaymentYears ?? sm?.debtRepaymentTime ?? null;
    const fcfYield = m?.fcfYield ?? null;
    const secFcfYield = sm?.fcfYield ?? null;
    const peRatio = m?.currentPe ?? null;
    const secPeRatio = sm?.currentPe ?? null;

    // lastMarketCap is stored in billions, totalEquity is raw USD — normalize
    const marketCapRaw = data.ticker?.lastMarketCap ? data.ticker.lastMarketCap * 1e9 : null;
    const secMarketCapRaw = secondaryData?.ticker?.lastMarketCap ? secondaryData.ticker.lastMarketCap * 1e9 : null;
    const pbRatio = (marketCapRaw && bs?.totalEquity && bs.totalEquity > 0) ? marketCapRaw / bs.totalEquity : null;
    const secPbRatio = (secMarketCapRaw && sbs?.totalEquity && sbs.totalEquity > 0) ? secMarketCapRaw / sbs.totalEquity : null;

    const roe = (latestAnnual?.netIncome && bs?.totalEquity && bs.totalEquity > 0) ? latestAnnual.netIncome / bs.totalEquity : null;
    const secRoe = (secLatestAnnual?.netIncome && sbs?.totalEquity && sbs.totalEquity > 0) ? secLatestAnnual.netIncome / sbs.totalEquity : null;

    const netMargin = (latestAnnual?.netIncome !== null && latestAnnual?.netIncome !== undefined && latestAnnual?.revenue && latestAnnual.revenue > 0) ? latestAnnual.netIncome / latestAnnual.revenue : null;
    const secNetMargin = (secLatestAnnual?.netIncome !== null && secLatestAnnual?.netIncome !== undefined && secLatestAnnual?.revenue && secLatestAnnual.revenue > 0) ? secLatestAnnual.netIncome / secLatestAnnual.revenue : null;

    const intCov = data.interestCoverage ?? null;
    const secIntCov = secondaryData?.interestCoverage ?? null;

    // Quality & Stability metrics (merged from QualityStabilityStats)
    const mv = data.marginStability;
    const secMv = secondaryData?.marginStability;
    const niYears = data.negativeNiYears ?? 0;
    const secNiYears = secondaryData?.negativeNiYears ?? 0;
    const dil = bs?.dilution5y;
    const secDil = sbs?.dilution5y;
    const sbc = bs?.sbcRatio;
    const secSbc = sbs?.sbcRatio;

    // ── Solvency & Debt ──
    const solvency: MetricCardDef[] = [
        {
            label: 'Altman Z-Score', hint: 'Bankruptcy risk predictor. >3.0 Safe, 1.8–3.0 Grey Zone, <1.8 Distress.',
            value: altmanZ != null ? altmanZ.toFixed(2) : 'N/A',
            secondaryValue: compareWith ? (secAltmanZ != null ? secAltmanZ.toFixed(2) : 'N/A') : undefined,
            statusLabel: altmanZ == null ? 'N/A' : altmanZ > 3.0 ? 'Safe' : altmanZ < 1.8 ? 'Distress' : 'Grey Zone',
            statusType: altmanZ == null ? 'neutral' : altmanZ > 3.0 ? 'good' : altmanZ < 1.8 ? 'bad' : 'warn',
        },
        {
            label: 'Debt Repayment', hint: 'Years to repay net debt from FCF. 0 = net cash. <3y Excellent, >8y High Risk.',
            value: debtRepay != null ? (debtRepay === 0 ? 'Net Cash' : `${debtRepay.toFixed(1)}y`) : 'N/A',
            secondaryValue: compareWith ? (secDebtRepay != null ? (secDebtRepay === 0 ? 'Net Cash' : `${secDebtRepay.toFixed(1)}y`) : 'N/A') : undefined,
            statusLabel: debtRepay == null ? 'N/A' : debtRepay === 0 ? 'Excellent' : debtRepay < 3 ? 'Strong' : debtRepay > 10 ? 'Weak' : 'Adequate',
            statusType: debtRepay == null ? 'neutral' : debtRepay <= 3 ? 'good' : debtRepay > 10 ? 'bad' : 'warn',
        },
        {
            label: 'Interest Coverage', hint: 'EBIT / Interest Expense. >10 Excellent, 3–10 OK, <3 Risky.',
            value: intCov != null ? `${intCov.toFixed(1)}x` : 'N/A',
            secondaryValue: compareWith ? (secIntCov != null ? `${secIntCov.toFixed(1)}x` : 'N/A') : undefined,
            statusLabel: intCov == null ? 'N/A' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Adequate' : intCov > 0 ? 'Weak' : 'None',
            statusType: intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad',
        },
    ];

    // ── Profitability ──
    const profitability: MetricCardDef[] = [
        {
            label: 'ROE (TTM)', hint: 'Return on Equity. >20% Strong, 10–20% Good, <10% Weak.',
            value: roe != null ? `${(roe * 100).toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith ? (secRoe != null ? `${(secRoe * 100).toFixed(1)}%` : 'N/A') : undefined,
            statusLabel: roe == null ? 'N/A' : roe > 0.20 ? 'Strong' : roe > 0.10 ? 'Good' : roe > 0 ? 'Weak' : 'Negative',
            statusType: roe == null ? 'neutral' : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad',
        },
        {
            label: 'Net Margin', hint: 'Net Income / Revenue. >20% Excellent, 10–20% Good, <5% Thin.',
            value: netMargin != null ? `${(netMargin * 100).toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith ? (secNetMargin != null ? `${(secNetMargin * 100).toFixed(1)}%` : 'N/A') : undefined,
            statusLabel: netMargin == null ? 'N/A' : netMargin > 0.20 ? 'Strong' : netMargin > 0.10 ? 'Good' : netMargin > 0.05 ? 'Fair' : netMargin > 0 ? 'Thin' : 'Loss',
            statusType: netMargin == null ? 'neutral' : netMargin > 0.20 ? 'good' : netMargin > 0.10 ? 'good' : netMargin > 0.05 ? 'warn' : 'bad',
        },
        {
            label: 'FCF Quality', hint: 'FCF Margin (FCF/Revenue) and Conversion (FCF/NetIncome). Higher = better cash generation.',
            value: (m?.fcfMargin != null || m?.fcfConversion != null)
                ? `M: ${m?.fcfMargin != null ? (m.fcfMargin * 100).toFixed(0) + '%' : '—'} C: ${m?.fcfConversion != null ? (m.fcfConversion * 100).toFixed(0) + '%' : '—'}`
                : 'N/A',
            secondaryValue: compareWith ? (
                (sm?.fcfMargin != null || sm?.fcfConversion != null)
                    ? `M: ${sm?.fcfMargin != null ? (sm.fcfMargin * 100).toFixed(0) + '%' : '—'} C: ${sm?.fcfConversion != null ? (sm.fcfConversion * 100).toFixed(0) + '%' : '—'}`
                    : 'N/A'
            ) : undefined,
            statusLabel: (m?.fcfConversion ?? 0) > 0.8 ? 'Efficient' : (m?.fcfConversion ?? 0) > 0.5 ? 'Steady' : (m?.fcfConversion ?? 0) > 0 ? 'Low Conv' : 'High Accruals',
            statusType: (m?.fcfConversion ?? 0) > 0.8 ? 'good' : (m?.fcfConversion ?? 0) > 0.5 ? 'neutral' : 'bad',
        },
    ];

    // ── Valuation ──
    const valuation: MetricCardDef[] = [
        {
            label: 'P/E Ratio (TTM)', hint: 'Price-to-Earnings. <15 Cheap, 15–25 Fair, >30 Expensive for most sectors.',
            value: peRatio != null ? `${peRatio.toFixed(1)}x` : 'N/A',
            secondaryValue: compareWith ? (secPeRatio != null ? `${secPeRatio.toFixed(1)}x` : 'N/A') : undefined,
            statusLabel: peRatio == null ? 'N/A' : peRatio < 15 ? 'Cheap' : peRatio <= 25 ? 'Fair' : peRatio <= 35 ? 'Rich' : 'Expensive',
            statusType: peRatio == null ? 'neutral' : peRatio < 15 ? 'good' : peRatio <= 25 ? 'good' : peRatio <= 35 ? 'warn' : 'bad',
        },
        {
            label: 'P/B Ratio', hint: 'Price-to-Book Value. <3 Fair, >10 Expensive (varies by sector).',
            value: pbRatio != null ? `${pbRatio.toFixed(2)}x` : 'N/A',
            secondaryValue: compareWith ? (secPbRatio != null ? `${secPbRatio.toFixed(2)}x` : 'N/A') : undefined,
            statusLabel: pbRatio == null ? 'N/A' : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Moderate' : 'High',
            statusType: pbRatio == null ? 'neutral' : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad',
        },
        {
            label: 'FCF Yield', hint: 'Free Cash Flow / Market Cap. >5% Good value, <2% Expensive.',
            value: fcfYield != null ? `${(fcfYield * 100).toFixed(2)}%` : 'N/A',
            secondaryValue: compareWith ? (secFcfYield != null ? `${(secFcfYield * 100).toFixed(2)}%` : 'N/A') : undefined,
            statusLabel: fcfYield == null ? 'N/A' : fcfYield > 0.05 ? 'High' : fcfYield < 0 ? 'Negative' : fcfYield > 0.03 ? 'Moderate' : 'Low',
            statusType: fcfYield == null ? 'neutral' : fcfYield > 0.05 ? 'good' : fcfYield < 0 ? 'bad' : 'warn',
        },
    ];

    // ── Quality & Stability (from QualityStabilityStats) ──
    const quality: MetricCardDef[] = [
        {
            label: 'Margin Volatility (σ)', hint: 'Standard deviation of EBIT margin over history. Lower = more stable and predictable business.',
            value: mv !== null && mv !== undefined ? (mv * 100).toFixed(1) + '%' : 'N/A',
            secondaryValue: compareWith ? (secMv !== null && secMv !== undefined ? (secMv * 100).toFixed(1) + '%' : 'N/A') : undefined,
            statusLabel: mv == null ? 'N/A' : mv < 0.03 ? 'Stable' : mv < 0.08 ? 'Normal' : mv < 0.15 ? 'Volatile' : 'Unstable',
            statusType: mv == null ? 'neutral' : mv < 0.08 ? 'good' : mv < 0.15 ? 'warn' : 'bad',
        },
        {
            label: 'Loss Years (10Y)', hint: 'How many years the company had a net loss in the last 10 years. 0 = always profitable.',
            value: `${niYears}y`,
            secondaryValue: compareWith ? `${secNiYears}y` : undefined,
            statusLabel: niYears === 0 ? 'Excellent' : niYears <= 2 ? 'Good' : niYears <= 4 ? 'Concern' : 'Poor',
            statusType: niYears === 0 ? 'good' : niYears <= 2 ? 'good' : niYears <= 4 ? 'warn' : 'bad',
        },
        {
            label: 'Dilution (5Y)', hint: 'Share count change over 5 years. Negative = buybacks (good). >5% dilution is a red flag.',
            value: dil !== null && dil !== undefined ? (dil > 0 ? '+' : '') + dil.toFixed(1) + '%' : 'N/A',
            secondaryValue: compareWith ? (secDil !== null && secDil !== undefined ? (secDil > 0 ? '+' : '') + secDil.toFixed(1) + '%' : 'N/A') : undefined,
            statusLabel: dil == null ? 'N/A' : dil < -2 ? 'Buyback' : dil <= 2 ? 'Stable' : dil <= 10 ? 'Diluting' : 'Heavy Dilution',
            statusType: dil == null ? 'neutral' : dil < -2 ? 'good' : dil <= 2 ? 'good' : dil <= 10 ? 'warn' : 'bad',
        },
        {
            label: 'SBC / Net Income', hint: 'Stock-based compensation as % of net income. >30% means significant shareholder dilution risk.',
            value: sbc !== null && sbc !== undefined ? sbc.toFixed(1) + '%' : 'N/A',
            secondaryValue: compareWith ? (secSbc !== null && secSbc !== undefined ? secSbc.toFixed(1) + '%' : 'N/A') : undefined,
            statusLabel: sbc == null ? 'N/A' : sbc < 10 ? 'Low' : sbc < 20 ? 'Moderate' : sbc < 40 ? 'High' : 'Excessive',
            statusType: sbc == null ? 'neutral' : sbc < 10 ? 'good' : sbc < 20 ? 'warn' : 'bad',
        },
    ];

    return { solvency, profitability, valuation, quality };
}

export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: FinancialHealthTableProps) {
    const { solvency, profitability, valuation, quality } = buildCards(data, secondaryData, compareWith);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 sm:p-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 rounded-lg flex-shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                    </div>
                    <div>
                        <h4 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Key Financial Metrics</h4>
                        <p className="text-xs text-gray-400">Solvency, profitability, valuation & earnings quality</p>
                    </div>
                </div>
                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full hidden sm:inline-flex">
                    Finnhub + Computed
                </span>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
                {/* Solvency & Debt */}
                <SectionLabel title="Solvency & Debt" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {solvency.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} />)}
                </div>

                {/* Profitability */}
                <SectionLabel title="Profitability" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {profitability.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} />)}
                </div>

                {/* Valuation */}
                <SectionLabel title="Valuation" />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {valuation.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} />)}
                </div>

                {/* Quality & Stability */}
                <SectionLabel title="Quality & Stability" />
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {quality.map(c => <MetricCard key={c.label} card={c} compareWith={compareWith} />)}
                </div>
            </div>
        </div>
    );
}
