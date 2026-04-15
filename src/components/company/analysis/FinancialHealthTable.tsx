import React from 'react';
import { AnalysisData } from '../AnalysisTab';

interface FinancialHealthTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

interface RowDef {
    label: string;
    hint: string;
    primary: React.ReactNode;
    secondary?: React.ReactNode;
    statusLabel?: string;
    statusType?: 'good' | 'warn' | 'bad' | 'neutral';
    source?: 'finnhub' | 'computed';
}

function statusBadge(label: string, type: 'good' | 'warn' | 'bad' | 'neutral') {
    const classes = {
        good: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        bad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
    };
    return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${classes[type]}`}>{label}</span>;
}

function sourceBadge(source: 'finnhub' | 'computed') {
    return source === 'finnhub'
        ? <span className="ml-1.5 inline-flex items-center px-1.5 py-0 rounded text-[9px] font-bold bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-wide">FH</span>
        : null;
}

function fmt(val: number | null | undefined, decimals = 2, suffix = ''): string {
    if (val == null) return 'N/A';
    return `${val.toFixed(decimals)}${suffix}`;
}

function fmtPct(val: number | null | undefined, multiply = false): string {
    if (val == null) return 'N/A';
    const v = multiply ? val * 100 : val;
    return `${v.toFixed(1)}%`;
}

export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: FinancialHealthTableProps) {
    const m = data.metrics;
    const sm = secondaryData?.metrics;
    const fh = data.finnhub?.metrics;
    const sfh = secondaryData?.finnhub?.metrics;

    const rows: RowDef[] = [
        // ── Altman Z-Score (computed) ──────────────────────────────
        {
            label: 'Altman Z-Score',
            hint: 'Predictive model for bankruptcy risk. > 3.0 is Safe, < 1.8 is Distressed.',
            primary: fmt(m?.altmanZ ?? m?.zScore, 2),
            secondary: compareWith ? fmt(sm?.altmanZ ?? sm?.zScore, 2) : undefined,
            statusType: (m?.altmanZ ?? m?.zScore) == null ? 'neutral' : (m.altmanZ ?? m.zScore)! > 3.0 ? 'good' : (m.altmanZ ?? m.zScore)! < 1.8 ? 'bad' : 'warn',
            statusLabel: (m?.altmanZ ?? m?.zScore) == null ? 'N/A' : (m.altmanZ ?? m.zScore)! > 3.0 ? 'Safe' : (m.altmanZ ?? m.zScore)! < 1.8 ? 'Distress' : 'Grey Zone',
            source: 'computed',
        },
        // ── Debt Repayment (computed) ──────────────────────────────
        {
            label: 'Debt Repayment',
            hint: 'Years needed to pay off debt using FCF. < 3y is Excellent, > 8y is High Risk.',
            primary: (m?.debtRepaymentYears ?? m?.debtRepaymentTime) != null ? `${fmt(m?.debtRepaymentYears ?? m?.debtRepaymentTime, 1)}y` : 'N/A',
            secondary: compareWith ? ((sm?.debtRepaymentYears ?? sm?.debtRepaymentTime) != null ? `${fmt(sm?.debtRepaymentYears ?? sm?.debtRepaymentTime, 1)}y` : 'N/A') : undefined,
            statusType: (m?.debtRepaymentYears ?? m?.debtRepaymentTime) == null ? 'neutral' : (m.debtRepaymentYears ?? m.debtRepaymentTime)! < 3 ? 'good' : (m.debtRepaymentYears ?? m.debtRepaymentTime)! > 10 ? 'bad' : 'warn',
            statusLabel: (m?.debtRepaymentYears ?? m?.debtRepaymentTime) == null ? 'N/A' : (m.debtRepaymentYears ?? m.debtRepaymentTime)! < 3 ? 'Strong' : (m.debtRepaymentYears ?? m.debtRepaymentTime)! > 10 ? 'Weak' : 'Adequate',
            source: 'computed',
        },
        // ── FCF Yield (computed from DB) ───────────────────────────
        {
            label: 'FCF Yield',
            hint: 'Free Cash Flow / Market Cap. Higher is better value. > 5% is Good.',
            primary: m?.fcfYield != null ? fmtPct(m.fcfYield, true) : 'N/A',
            secondary: compareWith && sm?.fcfYield != null ? fmtPct(sm.fcfYield, true) : undefined,
            statusType: (m?.fcfYield || 0) > 0.05 ? 'good' : (m?.fcfYield || 0) < 0 ? 'bad' : 'warn',
            statusLabel: (m?.fcfYield || 0) > 0.05 ? 'High' : (m?.fcfYield || 0) < 0 ? 'Negative' : 'Moderate',
            source: 'computed',
        },
        // ── FCF Quality (computed) ─────────────────────────────────
        {
            label: 'FCF Quality',
            hint: 'FCF Margin & Conversion. Measures how efficiently revenue turns into actual cash.',
            primary: (
                <div className="text-[11px] leading-tight">
                    <div>Margin: <span className="font-bold">{m?.fcfMargin != null ? fmtPct(m.fcfMargin, true) : 'N/A'}</span></div>
                    <div>Conv: <span className="font-bold">{m?.fcfConversion != null ? fmtPct(m.fcfConversion, true) : 'N/A'}</span></div>
                </div>
            ),
            secondary: compareWith ? (
                <div className="text-[11px] leading-tight">
                    <div>Margin: <span className="font-bold">{sm?.fcfMargin != null ? fmtPct(sm.fcfMargin, true) : 'N/A'}</span></div>
                    <div>Conv: <span className="font-bold">{sm?.fcfConversion != null ? fmtPct(sm.fcfConversion, true) : 'N/A'}</span></div>
                </div>
            ) : undefined,
            statusLabel: (m?.fcfConversion || 0) > 0.8 ? 'Efficient' : (m?.fcfConversion || 0) < 0.5 ? 'High Accruals' : 'Steady',
            statusType: (m?.fcfConversion || 0) > 0.8 ? 'good' : (m?.fcfConversion || 0) < 0.5 ? 'bad' : 'neutral',
            source: 'computed',
        },

        // ── FINNHUB METRICS ────────────────────────────────────────
        // P/E Ratio (Finnhub) — more accurate than manually computed currentPe
        {
            label: 'P/E Ratio (TTM)',
            hint: 'Price to Earnings ratio from Finnhub. Reflects trailing twelve months earnings.',
            primary: fh?.peRatio != null ? `${fh.peRatio.toFixed(1)}x` : (m?.currentPe != null ? `${m.currentPe.toFixed(1)}x` : 'N/A'),
            secondary: compareWith ? (sfh?.peRatio != null ? `${sfh.peRatio.toFixed(1)}x` : (sm?.currentPe != null ? `${sm.currentPe.toFixed(1)}x` : 'N/A')) : undefined,
            statusType: fh?.peRatio == null ? 'neutral' : fh.peRatio < 15 ? 'good' : fh.peRatio > 40 ? 'bad' : 'warn',
            statusLabel: fh?.peRatio == null ? 'N/A' : fh.peRatio < 15 ? 'Cheap' : fh.peRatio > 40 ? 'Expensive' : 'Fair',
            source: 'finnhub',
        },
        // P/B Ratio (Finnhub)
        {
            label: 'P/B Ratio',
            hint: 'Price to Book. < 1 may indicate undervaluation, > 5 is premium. From Finnhub.',
            primary: fmt(fh?.pbRatio, 2, 'x'),
            secondary: compareWith ? fmt(sfh?.pbRatio, 2, 'x') : undefined,
            statusType: fh?.pbRatio == null ? 'neutral' : fh.pbRatio < 1.5 ? 'good' : fh.pbRatio > 5 ? 'bad' : 'warn',
            statusLabel: fh?.pbRatio == null ? 'N/A' : fh.pbRatio < 1.5 ? 'Low' : fh.pbRatio > 5 ? 'High' : 'Fair',
            source: 'finnhub',
        },
        // ROE (Finnhub) — better than manually computed
        {
            label: 'ROE (TTM)',
            hint: 'Return on Equity from Finnhub. > 15% is Strong, < 5% is Weak.',
            primary: fh?.roe != null ? fmtPct(fh.roe) : 'N/A',
            secondary: compareWith ? (sfh?.roe != null ? fmtPct(sfh.roe) : 'N/A') : undefined,
            statusType: fh?.roe == null ? 'neutral' : fh.roe > 15 ? 'good' : fh.roe < 5 ? 'bad' : 'warn',
            statusLabel: fh?.roe == null ? 'N/A' : fh.roe > 15 ? 'Strong' : fh.roe < 5 ? 'Weak' : 'Adequate',
            source: 'finnhub',
        },
        // Net Margin (Finnhub)
        {
            label: 'Net Margin',
            hint: 'Net Income / Revenue from Finnhub. > 15% is healthy for most sectors.',
            primary: fh?.netMargin != null ? fmtPct(fh.netMargin) : 'N/A',
            secondary: compareWith ? (sfh?.netMargin != null ? fmtPct(sfh.netMargin) : 'N/A') : undefined,
            statusType: fh?.netMargin == null ? 'neutral' : fh.netMargin > 15 ? 'good' : fh.netMargin < 0 ? 'bad' : 'warn',
            statusLabel: fh?.netMargin == null ? 'N/A' : fh.netMargin > 15 ? 'Strong' : fh.netMargin < 0 ? 'Loss' : 'Moderate',
            source: 'finnhub',
        },
        // Current Ratio (Finnhub — prefer over manual computation)
        {
            label: 'Current Ratio',
            hint: 'Current Assets / Current Liabilities from Finnhub. > 2 is Strong, < 1 is risky.',
            primary: fmt(fh?.currentRatio ?? data.balanceSheet?.currentRatio, 2, 'x'),
            secondary: compareWith ? fmt(sfh?.currentRatio ?? secondaryData?.balanceSheet?.currentRatio, 2, 'x') : undefined,
            statusType: (fh?.currentRatio ?? data.balanceSheet?.currentRatio) == null ? 'neutral' : (fh?.currentRatio ?? data.balanceSheet?.currentRatio)! > 2 ? 'good' : (fh?.currentRatio ?? data.balanceSheet?.currentRatio)! < 1 ? 'bad' : 'warn',
            statusLabel: (fh?.currentRatio ?? data.balanceSheet?.currentRatio) == null ? 'N/A' : (fh?.currentRatio ?? data.balanceSheet?.currentRatio)! > 2 ? 'Strong' : (fh?.currentRatio ?? data.balanceSheet?.currentRatio)! < 1 ? 'Risky' : 'Adequate',
            source: fh?.currentRatio != null ? 'finnhub' : 'computed',
        },
        // Beta (Finnhub)
        {
            label: 'Beta',
            hint: 'Market sensitivity from Finnhub. 1.0 = market-neutral, > 1.5 = high volatility.',
            primary: fmt(fh?.beta, 2),
            secondary: compareWith ? fmt(sfh?.beta, 2) : undefined,
            statusType: fh?.beta == null ? 'neutral' : fh.beta < 0.8 ? 'good' : fh.beta > 1.5 ? 'warn' : 'neutral',
            statusLabel: fh?.beta == null ? 'N/A' : fh.beta < 0.8 ? 'Low Vol' : fh.beta > 1.5 ? 'High Vol' : 'Normal',
            source: 'finnhub',
        },
    ];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-3">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Financial Health Metrics</h4>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-wide">
                    Finnhub-first
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400">
                        <tr>
                            <th className="px-6 py-3 border-b dark:border-gray-700">Metric</th>
                            <th className="px-6 py-3 border-b dark:border-gray-700">{ticker}</th>
                            {compareWith ? <th className="px-6 py-3 border-b dark:border-gray-700">{compareWith}</th> : <th className="px-6 py-3 border-b dark:border-gray-700">Status</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.label} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900 dark:text-white flex items-center" title={row.hint}>
                                        {row.label}
                                        <span className="text-gray-400 text-[10px] ml-1">ⓘ</span>
                                        {row.source && sourceBadge(row.source)}
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono font-semibold text-gray-900 dark:text-white">
                                    {row.primary}
                                </td>
                                {compareWith ? (
                                    <td className="px-6 py-4 font-mono font-semibold text-gray-900 dark:text-white">
                                        {row.secondary}
                                    </td>
                                ) : (
                                    <td className="px-6 py-4">
                                        {row.statusLabel && row.statusType && statusBadge(row.statusLabel, row.statusType)}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="px-6 py-2 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                <p className="text-[10px] text-gray-400 dark:text-gray-500">
                    <span className="inline-flex items-center gap-1">
                        <span className="px-1 py-0 rounded text-[9px] font-bold bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 uppercase">FH</span>
                        = sourced from Finnhub API (pre-computed, TTM). Computed metrics use internal DB calculations.
                    </span>
                </p>
            </div>
        </div>
    );
}
