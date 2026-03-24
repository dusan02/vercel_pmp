import React from 'react';
import { AnalysisData } from '../AnalysisTab';

interface FinancialHealthTableProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

export function FinancialHealthTable({ ticker, data, compareWith, secondaryData }: FinancialHealthTableProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Financial Health Metrics</h4>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-500 dark:text-gray-400">
                    <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700/50 dark:text-gray-400">
                        <tr>
                            <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">Metric</th>
                            <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">{ticker}</th>
                            {compareWith ? (
                                <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">{compareWith}</th>
                            ) : (
                                <th scope="col" className="px-6 py-3 border-b dark:border-gray-700">Status</th>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {/* Altman Z-Score */}
                        <tr className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4">
                                <div className="font-medium text-gray-900 dark:text-white" title="Predictive model for bankruptcy risk. > 3.0 is Safe, < 1.8 is Distressed.">Altman Z-Score ⓘ</div>
                                <div className="text-[10px] text-gray-400">Likelihood of bankruptcy (Safe &gt; 3.0)</div>
                            </td>
                            <td className={`px-6 py-4 font-mono ${(data.metrics?.altmanZ || 0) > (secondaryData?.metrics?.altmanZ || 0) && compareWith ? 'text-green-600 font-bold' : ''}`}>
                                {(data.metrics?.altmanZ || data.metrics?.zScore)?.toFixed(2) || 'N/A'}
                                {compareWith && (data.metrics?.altmanZ || 0) > (secondaryData?.metrics?.altmanZ || 0) && ' 🏆'}
                            </td>
                            {compareWith ? (
                                <td className={`px-6 py-4 font-mono ${(secondaryData?.metrics?.altmanZ || 0) > (data.metrics?.altmanZ || 0) ? 'text-green-600 font-bold' : ''}`}>
                                    {(secondaryData?.metrics?.altmanZ || secondaryData?.metrics?.zScore)?.toFixed(2) || 'N/A'}
                                    {(secondaryData?.metrics?.altmanZ || 0) > (data.metrics?.altmanZ || 0) && ' 🏆'}
                                </td>
                            ) : (
                                <td className="px-6 py-4">
                                    {(data.metrics?.altmanZ || data.metrics?.zScore) !== undefined && (data.metrics?.altmanZ || data.metrics?.zScore) !== null ? (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(data.metrics?.altmanZ || data.metrics?.zScore || 0) > 3.0 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                            (data.metrics?.altmanZ || data.metrics?.zScore || 0) < 1.8 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            }`}>
                                            {(data.metrics?.altmanZ || data.metrics?.zScore || 0) > 3.0 ? 'Safe' : (data.metrics?.altmanZ || data.metrics?.zScore || 0) < 1.8 ? 'Distress' : 'Grey Zone'}
                                        </span>
                                    ) : <span className="text-gray-400">N/A</span>}
                                </td>
                            )}
                        </tr>
                        {/* Debt Repayment Time */}
                        <tr className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4">
                                <div className="font-medium text-gray-900 dark:text-white" title="Years needed to pay off debt using FCF. < 3y is Excellent, > 8y is High Risk.">Debt Repayment ⓘ</div>
                                <div className="text-[10px] text-gray-400">Years to pay debt from Net FCF</div>
                            </td>
                            <td className={`px-6 py-4 font-mono ${compareWith && (data.metrics?.debtRepaymentYears || 99) < (secondaryData?.metrics?.debtRepaymentYears || 99) ? 'text-green-600 font-bold' : ''}`}>
                                {(data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime)?.toFixed(1) || 'N/A'}y
                                {compareWith && (data.metrics?.debtRepaymentYears || 99) < (secondaryData?.metrics?.debtRepaymentYears || 99) && ' 🏆'}
                            </td>
                            {compareWith ? (
                                <td className={`px-6 py-4 font-mono ${(secondaryData?.metrics?.debtRepaymentYears || 99) < (data.metrics?.debtRepaymentYears || 99) ? 'text-green-600 font-bold' : ''}`}>
                                    {(secondaryData?.metrics?.debtRepaymentYears || secondaryData?.metrics?.debtRepaymentTime)?.toFixed(1) || 'N/A'}y
                                    {(secondaryData?.metrics?.debtRepaymentYears || 99) < (data.metrics?.debtRepaymentYears || 99) && ' 🏆'}
                                </td>
                            ) : (
                                <td className="px-6 py-4 italic text-xs">
                                    {data.humanDebtInfo || (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${(data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 10) < 3 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                            (data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 0) > 10 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            }`}>
                                            {(data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 10) < 3 ? 'Strong' : (data.metrics?.debtRepaymentYears || data.metrics?.debtRepaymentTime || 0) > 10 ? 'Weak' : 'Adequate'}
                                        </span>
                                    )}
                                </td>
                            )}
                        </tr>
                        {/* FCF Yield */}
                        <tr className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white" title="Free Cash Flow / Market Cap. Higher is better value. > 5% is Good.">FCF Yield ⓘ</td>
                            <td className={`px-6 py-4 font-mono ${compareWith && (data.metrics?.fcfYield || 0) > (secondaryData?.metrics?.fcfYield || 0) ? 'text-green-600 font-bold' : ''}`}>
                                {data.metrics?.fcfYield !== null && data.metrics?.fcfYield !== undefined ? `${(data.metrics.fcfYield * 100).toFixed(2)}%` : 'N/A'}
                                {compareWith && (data.metrics?.fcfYield || 0) > (secondaryData?.metrics?.fcfYield || 0) && ' 🏆'}
                            </td>
                            {compareWith ? (
                                <td className={`px-6 py-4 font-mono ${(secondaryData?.metrics?.fcfYield || 0) > (data.metrics?.fcfYield || 0) ? 'text-green-600 font-bold' : ''}`}>
                                    {secondaryData?.metrics?.fcfYield !== null && secondaryData?.metrics?.fcfYield !== undefined ? `${(secondaryData.metrics.fcfYield * 100).toFixed(2)}%` : 'N/A'}
                                    {(secondaryData?.metrics?.fcfYield || 0) > (data.metrics?.fcfYield || 0) && ' 🏆'}
                                </td>
                            ) : (
                                <td className="px-6 py-4">
                                    {data.metrics?.fcfYield !== null && data.metrics?.fcfYield !== undefined ? (
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${data.metrics.fcfYield > 0.05 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                            data.metrics.fcfYield < 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                                'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                                            }`}>
                                            {data.metrics.fcfYield > 0.05 ? 'High' : data.metrics.fcfYield < 0 ? 'Negative' : 'Moderate'}
                                        </span>
                                    ) : <span className="text-gray-400">N/A</span>}
                                </td>
                            )}
                        </tr>
                        {/* FCF Margin & Conversion */}
                        <tr className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50">
                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white" title="FCF Margin & Conversion. Measures how efficiently revenue turns into actual cash.">FCF Quality ⓘ</td>
                            <td className="px-6 py-4">
                                <div className="text-xs">Margin: <span className="font-mono font-bold">{(data.metrics?.fcfMargin !== undefined && data.metrics?.fcfMargin !== null) ? (data.metrics.fcfMargin * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                <div className="text-xs">Conv: <span className="font-mono font-bold">{(data.metrics?.fcfConversion !== undefined && data.metrics?.fcfConversion !== null) ? (data.metrics.fcfConversion * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                            </td>
                            {compareWith ? (
                                <td className="px-6 py-4">
                                    <div className="text-xs">Margin: <span className="font-mono font-bold">{(secondaryData?.metrics?.fcfMargin !== undefined && secondaryData?.metrics?.fcfMargin !== null) ? (secondaryData.metrics.fcfMargin * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                    <div className="text-xs">Conv: <span className="font-mono font-bold">{(secondaryData?.metrics?.fcfConversion !== undefined && secondaryData?.metrics?.fcfConversion !== null) ? (secondaryData.metrics.fcfConversion * 100).toFixed(1) + '%' : 'N/A'}</span></div>
                                </td>
                            ) : (
                                <td className="px-6 py-4 text-xs text-gray-400">
                                    {(data.metrics?.fcfConversion || 0) > 0.8 ? '✅ Efficient cash conversion' : (data.metrics?.fcfConversion || 0) < 0.5 ? '⚠️ High capex/accruals' : ''}
                                </td>
                            )}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    );
}
