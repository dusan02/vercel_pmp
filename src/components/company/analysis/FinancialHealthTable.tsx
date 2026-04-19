import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { MetricCard, MetricCardDef } from '../shared/MetricCard';

interface FinancialHealthTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

function computeMetricCards(
    data: AnalysisData,
    secondaryData: AnalysisData | null,
    compareWith: string
): MetricCardDef[] {
    const m = data.metrics;
    const sm = secondaryData?.metrics;
    const bs = data.balanceSheet;
    const sbs = secondaryData?.balanceSheet;
    const latestAnnual = data.statements?.find(s => s.fiscalPeriod === 'FY');
    const secLatestAnnual = secondaryData?.statements?.find(s => s.fiscalPeriod === 'FY');

    // Compute derived metrics
    const altmanZ = m?.altmanZ ?? m?.zScore ?? null;
    const secAltmanZ = sm?.altmanZ ?? sm?.zScore ?? null;

    const debtRepay = m?.debtRepaymentYears ?? m?.debtRepaymentTime ?? null;
    const secDebtRepay = sm?.debtRepaymentYears ?? sm?.debtRepaymentTime ?? null;

    const fcfYield = m?.fcfYield ?? null;
    const secFcfYield = sm?.fcfYield ?? null;

    const peRatio = m?.currentPe ?? null;
    const secPeRatio = sm?.currentPe ?? null;

    const marketCap = data.ticker?.lastMarketCap ?? null;
    const secMarketCap = secondaryData?.ticker?.lastMarketCap ?? null;
    const pbRatio = (marketCap && bs?.totalEquity && bs.totalEquity > 0) ? marketCap / bs.totalEquity : null;
    const secPbRatio = (secMarketCap && sbs?.totalEquity && sbs.totalEquity > 0) ? secMarketCap / sbs.totalEquity : null;

    const roe = (latestAnnual?.netIncome && bs?.totalEquity && bs.totalEquity > 0)
        ? latestAnnual.netIncome / bs.totalEquity : null;
    const secRoe = (secLatestAnnual?.netIncome && sbs?.totalEquity && sbs.totalEquity > 0)
        ? secLatestAnnual.netIncome / sbs.totalEquity : null;

    const netMargin = (latestAnnual?.netIncome !== null && latestAnnual?.netIncome !== undefined && latestAnnual?.revenue && latestAnnual.revenue > 0)
        ? latestAnnual.netIncome / latestAnnual.revenue : null;
    const secNetMargin = (secLatestAnnual?.netIncome !== null && secLatestAnnual?.netIncome !== undefined && secLatestAnnual?.revenue && secLatestAnnual.revenue > 0)
        ? secLatestAnnual.netIncome / secLatestAnnual.revenue : null;

    const currentRatio = bs?.currentRatio ?? null;
    const secCurrentRatio = sbs?.currentRatio ?? null;

    const intCov = data.interestCoverage ?? null;
    const secIntCov = secondaryData?.interestCoverage ?? null;

    const cards: MetricCardDef[] = [
        {
            label: 'Altman Z-Score',
            hint: 'Bankruptcy risk predictor. >3.0 Safe, 1.8–3.0 Grey Zone, <1.8 Distress.',
            value: altmanZ != null ? altmanZ.toFixed(2) : 'N/A',
            secondaryValue: compareWith ? (secAltmanZ != null ? secAltmanZ.toFixed(2) : 'N/A') : undefined,
            statusLabel: altmanZ == null ? 'N/A' : altmanZ > 3.0 ? 'Safe' : altmanZ < 1.8 ? 'Distress' : 'Grey Zone',
            statusType: altmanZ == null ? 'neutral' : altmanZ > 3.0 ? 'good' : altmanZ < 1.8 ? 'bad' : 'warn',
        },
        {
            label: 'Debt Repayment',
            hint: 'Years to repay net debt from FCF. 0 = net cash. <3y Excellent, >8y High Risk.',
            value: debtRepay != null ? (debtRepay === 0 ? 'Net Cash' : `${debtRepay.toFixed(1)}y`) : 'N/A',
            secondaryValue: compareWith ? (secDebtRepay != null ? (secDebtRepay === 0 ? 'Net Cash' : `${secDebtRepay.toFixed(1)}y`) : 'N/A') : undefined,
            statusLabel: debtRepay == null ? 'N/A' : debtRepay === 0 ? 'Excellent' : debtRepay < 3 ? 'Strong' : debtRepay > 10 ? 'Weak' : 'Adequate',
            statusType: debtRepay == null ? 'neutral' : debtRepay <= 3 ? 'good' : debtRepay > 10 ? 'bad' : 'warn',
        },
        {
            label: 'FCF Yield',
            hint: 'Free Cash Flow / Market Cap. >5% Good value, <2% Expensive.',
            value: fcfYield != null ? `${(fcfYield * 100).toFixed(2)}%` : 'N/A',
            secondaryValue: compareWith ? (secFcfYield != null ? `${(secFcfYield * 100).toFixed(2)}%` : 'N/A') : undefined,
            statusLabel: fcfYield == null ? 'N/A' : fcfYield > 0.05 ? 'High' : fcfYield < 0 ? 'Negative' : fcfYield > 0.03 ? 'Moderate' : 'Low',
            statusType: fcfYield == null ? 'neutral' : fcfYield > 0.05 ? 'good' : fcfYield < 0 ? 'bad' : 'warn',
        },
        {
            label: 'FCF Quality',
            hint: 'FCF Margin (FCF/Revenue) and Conversion (FCF/NetIncome). Higher = better cash generation.',
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
        {
            label: 'P/E Ratio (TTM)',
            hint: 'Price-to-Earnings. <15 Cheap, 15–25 Fair, >30 Expensive for most sectors.',
            value: peRatio != null ? `${peRatio.toFixed(1)}x` : 'N/A',
            secondaryValue: compareWith ? (secPeRatio != null ? `${secPeRatio.toFixed(1)}x` : 'N/A') : undefined,
            statusLabel: peRatio == null ? 'N/A' : peRatio < 15 ? 'Cheap' : peRatio <= 25 ? 'Fair' : peRatio <= 35 ? 'Rich' : 'Expensive',
            statusType: peRatio == null ? 'neutral' : peRatio < 15 ? 'good' : peRatio <= 25 ? 'good' : peRatio <= 35 ? 'warn' : 'bad',
            source: 'finnhub',
        },
        {
            label: 'P/B Ratio',
            hint: 'Price-to-Book Value. <3 Fair, >10 Expensive (varies by sector).',
            value: pbRatio != null ? `${pbRatio.toFixed(2)}x` : 'N/A',
            secondaryValue: compareWith ? (secPbRatio != null ? `${secPbRatio.toFixed(2)}x` : 'N/A') : undefined,
            statusLabel: pbRatio == null ? 'N/A' : pbRatio < 3 ? 'Fair' : pbRatio < 8 ? 'Moderate' : 'High',
            statusType: pbRatio == null ? 'neutral' : pbRatio < 3 ? 'good' : pbRatio < 8 ? 'warn' : 'bad',
            source: 'finnhub',
        },
        {
            label: 'ROE (TTM)',
            hint: 'Return on Equity. >20% Strong, 10–20% Good, <10% Weak.',
            value: roe != null ? `${(roe * 100).toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith ? (secRoe != null ? `${(secRoe * 100).toFixed(1)}%` : 'N/A') : undefined,
            statusLabel: roe == null ? 'N/A' : roe > 0.20 ? 'Strong' : roe > 0.10 ? 'Good' : roe > 0 ? 'Weak' : 'Negative',
            statusType: roe == null ? 'neutral' : roe > 0.20 ? 'good' : roe > 0.10 ? 'warn' : 'bad',
            source: 'finnhub',
        },
        {
            label: 'Net Margin',
            hint: 'Net Income / Revenue. >20% Excellent, 10–20% Good, <5% Thin.',
            value: netMargin != null ? `${(netMargin * 100).toFixed(1)}%` : 'N/A',
            secondaryValue: compareWith ? (secNetMargin != null ? `${(secNetMargin * 100).toFixed(1)}%` : 'N/A') : undefined,
            statusLabel: netMargin == null ? 'N/A' : netMargin > 0.20 ? 'Strong' : netMargin > 0.10 ? 'Good' : netMargin > 0.05 ? 'Fair' : netMargin > 0 ? 'Thin' : 'Loss',
            statusType: netMargin == null ? 'neutral' : netMargin > 0.20 ? 'good' : netMargin > 0.10 ? 'good' : netMargin > 0.05 ? 'warn' : 'bad',
            source: 'finnhub',
        },
        {
            label: 'Current Ratio',
            hint: 'Current Assets / Current Liabilities. >2.0 Strong, 1.0–2.0 OK, <1.0 Risk.',
            value: currentRatio != null ? `${currentRatio.toFixed(2)}x` : 'N/A',
            secondaryValue: compareWith ? (secCurrentRatio != null ? `${secCurrentRatio.toFixed(2)}x` : 'N/A') : undefined,
            statusLabel: currentRatio == null ? 'N/A' : currentRatio >= 2.0 ? 'Strong' : currentRatio >= 1.0 ? 'Adequate' : 'Risk',
            statusType: currentRatio == null ? 'neutral' : currentRatio >= 2.0 ? 'good' : currentRatio >= 1.0 ? 'warn' : 'bad',
            source: 'finnhub',
        },
        {
            label: 'Interest Coverage',
            hint: 'EBIT / Interest Expense. >10 Excellent, 3–10 OK, <3 Risky.',
            value: intCov != null ? `${intCov.toFixed(1)}x` : 'N/A',
            secondaryValue: compareWith ? (secIntCov != null ? `${secIntCov.toFixed(1)}x` : 'N/A') : undefined,
            statusLabel: intCov == null ? 'N/A' : intCov > 10 ? 'Strong' : intCov > 3 ? 'Adequate' : intCov > 0 ? 'Weak' : 'None',
            statusType: intCov == null ? 'neutral' : intCov > 10 ? 'good' : intCov > 3 ? 'warn' : 'bad',
            source: 'finnhub',
        },
    ];

    return cards;
}

export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: FinancialHealthTableProps) {
    const cards = computeMetricCards(data, secondaryData, compareWith);

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Financial Health Metrics</h4>
                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-500 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-2.5 py-1 rounded-full">
                    Finnhub + Computed
                </span>
            </div>
            <div className="p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {cards.map(card => (
                        <MetricCard key={card.label} card={card} compareWith={compareWith} />
                    ))}
                </div>
                <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-4 px-1">
                    <span className="text-blue-400 dark:text-blue-500 font-bold">FH</span> = sourced from SEC filings via Finnhub API. Other metrics computed from internal DB calculations.
                </p>
            </div>
        </div>
    );
}
