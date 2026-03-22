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

export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: FinancialHealthTableProps) {
    const m = data.metrics;
    const sm = secondaryData?.metrics;

    const rows: RowDef[] = [
        {
            label: 'Altman Z-Score',
            hint: 'Predictive model for bankruptcy risk. > 3.0 is Safe, < 1.8 is Distressed.',
            primary: (m?.altmanZ || m?.zScore)?.toFixed(2) || 'N/A',
            secondary: compareWith ? ((sm?.altmanZ || sm?.zScore)?.toFixed(2) || 'N/A') : undefined,
            statusType: (m?.altmanZ || m?.zScore || 0) > 3.0 ? 'good' : (m?.altmanZ || m?.zScore || 0) < 1.8 ? 'bad' : 'warn',
            statusLabel: (m?.altmanZ || m?.zScore || 0) > 3.0 ? 'Safe' : (m?.altmanZ || m?.zScore || 0) < 1.8 ? 'Distress' : 'Grey Zone',
        },
        {
            label: 'Debt Repayment',
            hint: 'Years needed to pay off debt using FCF. < 3y is Excellent, > 8y is High Risk.',
            primary: `${(m?.debtRepaymentYears || m?.debtRepaymentTime)?.toFixed(1) || 'N/A'}y`,
            secondary: compareWith ? `${(sm?.debtRepaymentYears || sm?.debtRepaymentTime)?.toFixed(1) || 'N/A'}y` : undefined,
            statusType: (m?.debtRepaymentYears || m?.debtRepaymentTime || 10) < 3 ? 'good' : (m?.debtRepaymentYears || m?.debtRepaymentTime || 0) > 10 ? 'bad' : 'warn',
            statusLabel: (m?.debtRepaymentYears || m?.debtRepaymentTime || 10) < 3 ? 'Strong' : (m?.debtRepaymentYears || m?.debtRepaymentTime || 0) > 10 ? 'Weak' : 'Adequate',
        },
        {
            label: 'FCF Yield',
            hint: 'Free Cash Flow / Market Cap. Higher is better value. > 5% is Good.',
            primary: m?.fcfYield !== null && m?.fcfYield !== undefined ? `${(m.fcfYield * 100).toFixed(2)}%` : 'N/A',
            secondary: compareWith && sm?.fcfYield !== null && sm?.fcfYield !== undefined ? `${(sm.fcfYield * 100).toFixed(2)}%` : undefined,
            statusType: (m?.fcfYield || 0) > 0.05 ? 'good' : (m?.fcfYield || 0) < 0 ? 'bad' : 'warn',
            statusLabel: (m?.fcfYield || 0) > 0.05 ? 'High' : (m?.fcfYield || 0) < 0 ? 'Negative' : 'Moderate',
        },
        {
            label: 'FCF Quality',
            hint: 'FCF Margin & Conversion. Measures how efficiently revenue turns into actual cash.',
            primary: (
                <div className="text-[11px] leading-tight">
                    <div>Margin: <span className="font-bold">{(m?.fcfMargin !== null && m?.fcfMargin !== undefined) ? (m.fcfMargin * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                    <div>Conv: <span className="font-bold">{(m?.fcfConversion !== null && m?.fcfConversion !== undefined) ? (m.fcfConversion * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                </div>
            ),
            secondary: compareWith ? (
                <div className="text-[11px] leading-tight">
                    <div>Margin: <span className="font-bold">{(sm?.fcfMargin !== null && sm?.fcfMargin !== undefined) ? (sm.fcfMargin * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                    <div>Conv: <span className="font-bold">{(sm?.fcfConversion !== null && sm?.fcfConversion !== undefined) ? (sm.fcfConversion * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                </div>
            ) : undefined,
            statusLabel: (m?.fcfConversion || 0) > 0.8 ? 'Efficient' : (m?.fcfConversion || 0) < 0.5 ? 'High Accruals' : 'Steady',
            statusType: (m?.fcfConversion || 0) > 0.8 ? 'good' : (m?.fcfConversion || 0) < 0.5 ? 'bad' : 'neutral',
        }
    ];

    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Financial Health Metrics</h4>
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
                                    <div className="font-medium text-gray-900 dark:text-white" title={row.hint}>{row.label} <span className="text-gray-400 text-[10px]">ⓘ</span></div>
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
        </div>
    );
}

