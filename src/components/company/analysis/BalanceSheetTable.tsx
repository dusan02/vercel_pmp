import React from 'react';
import { AnalysisData } from '../AnalysisTab';

interface BalanceSheetTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

function fmt(val: number | null | undefined, prefix = '', suffix = '', decimals = 2): string {
    if (val === null || val === undefined) return 'N/A';
    return `${prefix}${val.toFixed(decimals)}${suffix}`;
}

function fmtB(val: number | null | undefined): string {
    if (val === null || val === undefined) return 'N/A';
    const absVal = Math.abs(val);
    if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(2)}`;
}

interface RowDef {
    label: string;
    hint: string;
    primary: string;
    secondary?: string | undefined;
    primaryStatus?: 'good' | 'warn' | 'bad' | 'neutral' | undefined;
    statusLabel?: string | undefined;
}

function statusBadge(label: string, type: 'good' | 'warn' | 'bad' | 'neutral') {
    const classes: Record<string, string> = {
        good: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
        warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
        bad: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
        neutral: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
    };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${classes[type]}`}>
            {label}
        </span>
    );
}

export function BalanceSheetTable({ ticker, data, compareWith, secondaryData }: BalanceSheetTableProps) {
    const bs = data.balanceSheet;
    const sbs = secondaryData?.balanceSheet;

    if (!bs) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center text-gray-400 text-sm">
                Balance sheet data not available. Run Deep Analysis first.
            </div>
        );
    }

    const currentRatioStatus = (r: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' => {
        if (r === null || r === undefined) return 'neutral';
        return r >= 2 ? 'good' : r >= 1 ? 'warn' : 'bad';
    };
    const deToStatus = (r: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' => {
        if (r === null || r === undefined) return 'neutral';
        return r <= 0.5 ? 'good' : r <= 2 ? 'warn' : 'bad';
    };
    const ndEbStatus = (r: number | null | undefined): 'good' | 'warn' | 'bad' | 'neutral' => {
        if (r === null || r === undefined) return 'neutral';
        return r <= 2 ? 'good' : r <= 4 ? 'warn' : 'bad';
    };

    const rows: RowDef[] = [
        {
            label: 'Debt / Equity',
            hint: 'Total Debt / Total Equity. < 0.5 is conservative, > 2 is leveraged.',
            primary: fmt(bs.debtToEquity, '', 'x'),
            secondary: compareWith ? fmt(sbs?.debtToEquity, '', 'x') : undefined,
            primaryStatus: deToStatus(bs.debtToEquity),
            statusLabel: !compareWith ? (bs.debtToEquity !== null ? (bs.debtToEquity <= 0.5 ? 'Conservative' : bs.debtToEquity <= 2 ? 'Moderate' : 'High Leverage') : 'N/A') : undefined,
        },
        {
            label: 'Net Debt / EBITDA',
            hint: 'Net Debt / EBIT (EBITDA proxy). < 2x healthy, > 4x risky.',
            primary: fmt(bs.netDebtToEbitda, '', 'x'),
            secondary: compareWith ? fmt(sbs?.netDebtToEbitda, '', 'x') : undefined,
            primaryStatus: ndEbStatus(bs.netDebtToEbitda),
            statusLabel: !compareWith ? (bs.netDebtToEbitda !== null ? (bs.netDebtToEbitda <= 2 ? 'Healthy' : bs.netDebtToEbitda <= 4 ? 'Elevated' : 'High') : 'N/A') : undefined,
        },
        {
            label: 'Current Ratio',
            hint: 'Current Assets / Current Liabilities. > 2 is strong, < 1 is risky.',
            primary: fmt(bs.currentRatio, '', 'x'),
            secondary: compareWith ? fmt(sbs?.currentRatio, '', 'x') : undefined,
            primaryStatus: currentRatioStatus(bs.currentRatio),
            statusLabel: !compareWith ? (bs.currentRatio !== null ? (bs.currentRatio >= 2 ? 'Strong' : bs.currentRatio >= 1 ? 'Adequate' : 'Weak') : 'N/A') : undefined,
        },
        {
            label: 'Asset / Liability',
            hint: 'Total Assets / Total Liabilities. > 2 means assets comfortably cover liabilities.',
            primary: fmt(bs.assetToLiability, '', 'x'),
            secondary: compareWith ? fmt(sbs?.assetToLiability, '', 'x') : undefined,
            primaryStatus: bs.assetToLiability !== null ? (bs.assetToLiability >= 2 ? 'good' : bs.assetToLiability >= 1 ? 'warn' : 'bad') : 'neutral',
            statusLabel: !compareWith ? (bs.assetToLiability !== null ? (bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky') : 'N/A') : undefined,
        },
        {
            label: 'Total Debt',
            hint: 'Total debt obligations.',
            primary: fmtB(bs.totalDebt),
            secondary: compareWith ? fmtB(sbs?.totalDebt) : undefined,
        },
        {
            label: 'Net Debt',
            hint: 'Total Debt minus Cash & Equivalents.',
            primary: fmtB(bs.netDebt),
            secondary: compareWith ? fmtB(sbs?.netDebt) : undefined,
        },
        {
            label: 'Cash & Equivalents',
            hint: 'Cash and short-term investments on the balance sheet.',
            primary: fmtB(bs.cash),
            secondary: compareWith ? fmtB(sbs?.cash) : undefined,
        },
        {
            label: 'Total Equity',
            hint: "Shareholders' equity (book value).",
            primary: fmtB(bs.totalEquity),
            secondary: compareWith ? fmtB(sbs?.totalEquity) : undefined,
        },
        ...(bs.sbc !== null && bs.sbc !== undefined ? [{
            label: 'SBC (Stock-Based Comp)',
            hint: 'Stock-based compensation — dilutes shareholders. High SBC vs. Net Income is a quality red flag.',
            primary: fmtB(bs.sbc),
            secondary: compareWith ? fmtB(sbs?.sbc) : undefined,
            primaryStatus: bs.sbc > (data.statements?.[0]?.netIncome ?? Infinity) * 0.2 ? 'bad' as const : 'good' as const,
            statusLabel: !compareWith ? 'Dilution alert' : undefined,
        }] : []),
    ];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex items-center gap-3">
                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4l-2 16M14 4l-2 16" />
                    </svg>
                </div>
                <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Balance Sheet Insights</h4>
                    <p className="text-xs text-gray-400">Based on latest annual financial statement</p>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400">
                        <tr>
                            <th className="px-6 py-3 border-b dark:border-gray-700">Metric</th>
                            <th className="px-6 py-3 border-b dark:border-gray-700">{ticker}</th>
                            {compareWith
                                ? <th className="px-6 py-3 border-b dark:border-gray-700">{compareWith}</th>
                                : <th className="px-6 py-3 border-b dark:border-gray-700">Status</th>
                            }
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, i) => (
                            <tr key={row.label} className={`border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 ${i === rows.length - 1 ? 'border-0' : ''}`}>
                                <td className="px-6 py-4">
                                    <div className="font-medium text-gray-900 dark:text-white" title={row.hint}>
                                        {row.label} <span className="text-gray-400 text-xs">ⓘ</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 font-mono font-semibold text-gray-900 dark:text-white">
                                    {row.primary}
                                </td>
                                {compareWith
                                    ? <td className="px-6 py-4 font-mono font-semibold text-gray-900 dark:text-white">{row.secondary ?? 'N/A'}</td>
                                    : <td className="px-6 py-4">
                                        {row.primaryStatus && row.statusLabel && row.primaryStatus !== 'neutral'
                                            ? statusBadge(row.statusLabel, row.primaryStatus)
                                            : <span className="text-gray-400 text-xs">{row.statusLabel || '—'}</span>
                                        }
                                    </td>
                                }
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
