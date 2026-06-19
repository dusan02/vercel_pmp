import React from 'react';
import { AnalysisData } from '../AnalysisTab';
import { CompactMetricRow, MetricCardDef, StatusType } from '../shared/MetricCard';

interface BalanceSheetTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

function fmt(val: number | null | undefined, suffix = '', decimals = 2): string {
    if (val === null || val === undefined) return 'N/A';
    return `${val.toFixed(decimals)}${suffix}`;
}

function fmtB(val: number | null | undefined): string {
    if (val === null || val === undefined) return 'N/A';
    const absVal = Math.abs(val);
    if (absVal >= 1e12) return `$${(val / 1e12).toFixed(2)}T`;
    if (absVal >= 1e9) return `$${(val / 1e9).toFixed(2)}B`;
    if (absVal >= 1e6) return `$${(val / 1e6).toFixed(2)}M`;
    return `$${val.toFixed(0)}`;
}

function ratioStatus(val: number | null | undefined, goodBelow: number, warnBelow: number): StatusType {
    if (val === null || val === undefined) return 'neutral';
    return val <= goodBelow ? 'good' : val <= warnBelow ? 'warn' : 'bad';
}

function ratioStatusAbove(val: number | null | undefined, goodAbove: number, warnAbove: number): StatusType {
    if (val === null || val === undefined) return 'neutral';
    return val >= goodAbove ? 'good' : val >= warnAbove ? 'warn' : 'bad';
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

    const netDebtStatus: StatusType = bs.netDebt !== null ? (bs.netDebt < 0 ? 'good' : 'neutral') : 'neutral';
    
    // Convert to CompactMetricRow items
    const metrics: MetricCardDef[] = [
        {
            label: 'Total Debt', hint: 'Total debt obligations (short + long term).', 
            value: fmtB(bs.totalDebt), secondaryValue: compareWith ? fmtB(sbs?.totalDebt) : undefined, 
            statusType: 'neutral', statusLabel: '-'
        },
        {
            label: 'Cash & Equiv.', hint: 'Cash and short-term investments.', 
            value: fmtB(bs.cash), secondaryValue: compareWith ? fmtB(sbs?.cash) : undefined, 
            statusType: 'neutral', statusLabel: '-'
        },
        {
            label: 'Net Debt', hint: 'Total Debt minus Cash. Negative = Net Cash position.', 
            value: fmtB(bs.netDebt), secondaryValue: compareWith ? fmtB(sbs?.netDebt) : undefined, 
            statusType: netDebtStatus, statusLabel: bs.netDebt !== null && bs.netDebt < 0 ? 'Net Cash' : '-'
        },
        {
            label: 'Total Equity', hint: "Shareholders' equity (book value).", 
            value: fmtB(bs.totalEquity), secondaryValue: compareWith ? fmtB(sbs?.totalEquity) : undefined, 
            statusType: 'neutral', statusLabel: '-'
        },
        {
            label: 'Current Ratio', hint: 'Current Assets / Current Liabilities. > 2 is strong, < 1 is risky.',
            value: fmt(bs.currentRatio, 'x'), secondaryValue: compareWith ? fmt(sbs?.currentRatio, 'x') : undefined,
            statusType: ratioStatusAbove(bs.currentRatio, 2, 1),
            statusLabel: bs.currentRatio !== null ? (bs.currentRatio >= 2 ? 'Strong' : bs.currentRatio >= 1 ? 'Adequate' : 'Weak') : 'N/A',
            progress: bs.currentRatio !== null ? Math.min(100, (bs.currentRatio / 3) * 100) : undefined
        },
        {
            label: 'Asset / Liability', hint: 'Total Assets / Total Liabilities. > 2 = solid.',
            value: fmt(bs.assetToLiability, 'x'), secondaryValue: compareWith ? fmt(sbs?.assetToLiability, 'x') : undefined,
            statusType: ratioStatusAbove(bs.assetToLiability, 2, 1),
            statusLabel: bs.assetToLiability !== null ? (bs.assetToLiability >= 2 ? 'Solid' : bs.assetToLiability >= 1 ? 'Adequate' : 'Risky') : 'N/A',
            progress: bs.assetToLiability !== null ? Math.min(100, (bs.assetToLiability / 3) * 100) : undefined
        }
    ];

    return (
        <div className="break-inside-avoid bg-white dark:bg-[#15171e] rounded-2xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.02)] border border-gray-100 dark:border-gray-800/80 mb-6 flex flex-col h-full">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 rounded-lg flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M10 4l-2 16M14 4l-2 16" />
                    </svg>
                </div>
                <div>
                    <h3 className="text-lg font-bold text-gray-900 dark:text-white tracking-tight">Balance Sheet Insights</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Absolute values & liquidity ratios</p>
                </div>
            </div>
            
            <div className="flex flex-col flex-1 justify-between">
                <div className="flex flex-col">
                    {metrics.map((m, idx) => (
                        <CompactMetricRow key={idx} card={m} compareWith={compareWith} />
                    ))}
                </div>
            </div>
        </div>
    );
}
