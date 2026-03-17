import React from 'react';
import { AnalysisData } from '../AnalysisTab';

interface DeepDivePanelsProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
    openPanel: 'health' | 'profitability' | 'valuation' | null;
    togglePanel: (p: 'health' | 'profitability' | 'valuation') => void;
}

export function DeepDivePanels({
    ticker,
    data,
    compareWith,
    secondaryData,
    openPanel,
    togglePanel
}: DeepDivePanelsProps) {
    return (
        <div className="space-y-3">
            {/* Health Details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button onClick={() => togglePanel('health')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">🏥 Health Details</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'health' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {openPanel === 'health' && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-4">
                        {/* Piotroski F-Score */}
                        <div>
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300" title="Score from 0-9 assessing financial strength. > 7 is Strong, < 3 is Weak.">Piotroski F-Score ⓘ</span>
                                <div className="flex gap-4 items-center">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${(data.piotroskiScore ?? 0) >= 7 ? 'text-green-500' : (data.piotroskiScore ?? 0) <= 2 ? 'text-red-500' : 'text-yellow-500'}`}>
                                            {data.piotroskiScore ?? 'N/A'}{compareWith && (data.piotroskiScore || 0) > (secondaryData?.piotroskiScore || 0) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${(secondaryData?.piotroskiScore ?? 0) >= 7 ? 'text-green-500' : (secondaryData?.piotroskiScore ?? 0) <= 2 ? 'text-red-500' : 'text-yellow-500'}`}>
                                                {secondaryData?.piotroskiScore ?? 'N/A'}{(secondaryData?.piotroskiScore || 0) > (data.piotroskiScore || 0) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 flex">
                                <div className={`h-2 rounded-l-full ${(data.piotroskiScore ?? 0) >= 7 ? 'bg-green-500' : (data.piotroskiScore ?? 0) <= 2 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${((data.piotroskiScore ?? 0) / 9) * (compareWith ? 50 : 100)}%` }} />
                                {compareWith && (
                                    <div className={`h-2 rounded-r-full border-l border-white dark:border-gray-800 ${(secondaryData?.piotroskiScore ?? 0) >= 7 ? 'bg-green-500' : (secondaryData?.piotroskiScore ?? 0) <= 2 ? 'bg-red-500' : 'bg-yellow-500'}`} style={{ width: `${((secondaryData?.piotroskiScore ?? 0) / 9) * 50}%` }} />
                                )}
                            </div>
                        </div>

                        {/* Beneish M-Score */}
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300" title="Model to detect earnings manipulation. < -2.22 is Unlikely, > -1.78 is High Risk.">Beneish M-Score ⓘ</p>
                                <p className="text-xs text-gray-400">Below -1.78 = No manipulation</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <p className={`text-base font-bold ${data.beneishScore === null || data.beneishScore === undefined ? 'text-gray-400' : data.beneishScore < -1.78 ? 'text-green-500' : 'text-red-500'}`}>
                                        {data.beneishScore !== null && data.beneishScore !== undefined ? data.beneishScore.toFixed(2) : 'N/A'}
                                        {compareWith && (data.beneishScore || 0) < (secondaryData?.beneishScore || 0) && ' 🏆'}
                                    </p>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <p className={`text-base font-bold ${secondaryData?.beneishScore === null || secondaryData?.beneishScore === undefined ? 'text-gray-400' : secondaryData.beneishScore < -1.78 ? 'text-green-500' : 'text-red-500'}`}>
                                            {secondaryData?.beneishScore !== null && secondaryData?.beneishScore !== undefined ? secondaryData.beneishScore.toFixed(2) : 'N/A'}
                                            {(secondaryData?.beneishScore || 0) < (data.beneishScore || 0) && ' 🏆'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Interest Coverage */}
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300" title="EBIT / Interest Expense. Measures ability to pay interest. > 3 is Solid.">Interest Coverage ⓘ</p>
                                <p className="text-xs text-gray-400">EBIT / Interest Expense</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <span className={`text-base font-bold ${data.interestCoverage === null || data.interestCoverage === undefined ? 'text-gray-400' : data.interestCoverage > 5 ? 'text-green-500' : data.interestCoverage > 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {data.interestCoverage !== null && data.interestCoverage !== undefined ? `${data.interestCoverage.toFixed(1)}x` : 'N/A'}
                                        {compareWith && (data.interestCoverage || 0) > (secondaryData?.interestCoverage || 0) && ' 🏆'}
                                    </span>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <span className={`text-base font-bold ${secondaryData?.interestCoverage === null || secondaryData?.interestCoverage === undefined ? 'text-gray-400' : secondaryData.interestCoverage > 5 ? 'text-green-500' : secondaryData.interestCoverage > 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {secondaryData?.interestCoverage !== null && secondaryData?.interestCoverage !== undefined ? `${secondaryData.interestCoverage.toFixed(1)}x` : 'N/A'}
                                            {(secondaryData?.interestCoverage || 0) > (data.interestCoverage || 0) && ' 🏆'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Profitability Details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button onClick={() => togglePanel('profitability')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">📈 Profitability Details</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'profitability' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {openPanel === 'profitability' && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-3">
                        <div className="flex justify-between items-start py-2">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Revenue CAGR (5Y)</p>
                                <p className="text-xs text-gray-400">Annual revenue growth rate</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <span className={`text-base font-bold ${data.revenueCagr === null || data.revenueCagr === undefined ? 'text-gray-400' : data.revenueCagr > 10 ? 'text-green-500' : data.revenueCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {data.revenueCagr !== null && data.revenueCagr !== undefined ? `${data.revenueCagr.toFixed(1)}%` : 'N/A'}
                                        {compareWith && (data.revenueCagr || -99) > (secondaryData?.revenueCagr || -99) && ' 🏆'}
                                    </span>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <span className={`text-base font-bold ${secondaryData?.revenueCagr === null || secondaryData?.revenueCagr === undefined ? 'text-gray-400' : secondaryData.revenueCagr > 10 ? 'text-green-500' : secondaryData.revenueCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {secondaryData?.revenueCagr !== null && secondaryData?.revenueCagr !== undefined ? `${secondaryData.revenueCagr.toFixed(1)}%` : 'N/A'}
                                            {(secondaryData?.revenueCagr || -99) > (data.revenueCagr || -99) && ' 🏆'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Net Income CAGR (5Y)</p>
                                <p className="text-xs text-gray-400">Annual net income growth rate</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <span className={`text-base font-bold ${data.netIncomeCagr === null || data.netIncomeCagr === undefined ? 'text-gray-400' : data.netIncomeCagr > 10 ? 'text-green-500' : data.netIncomeCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {data.netIncomeCagr !== null && data.netIncomeCagr !== undefined ? `${data.netIncomeCagr.toFixed(1)}%` : 'N/A'}
                                        {compareWith && (data.netIncomeCagr || -99) > (secondaryData?.netIncomeCagr || -99) && ' 🏆'}
                                    </span>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <span className={`text-base font-bold ${secondaryData?.netIncomeCagr === null || secondaryData?.netIncomeCagr === undefined ? 'text-gray-400' : secondaryData.netIncomeCagr > 10 ? 'text-green-500' : secondaryData.netIncomeCagr > 0 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {secondaryData?.netIncomeCagr !== null && secondaryData?.netIncomeCagr !== undefined ? `${secondaryData.netIncomeCagr.toFixed(1)}%` : 'N/A'}
                                            {(secondaryData?.netIncomeCagr || -99) > (data.netIncomeCagr || -99) && ' 🏆'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Valuation Details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 overflow-hidden">
                <button onClick={() => togglePanel('valuation')} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">💰 Valuation Details</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${openPanel === 'valuation' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
                {openPanel === 'valuation' && (
                    <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 space-y-3">
                        <div className="flex justify-between items-start py-2">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">FCF Yield</p>
                                <p className="text-xs text-gray-400">Higher is better value</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <span className={`text-base font-bold ${data.metrics?.fcfYield === null || data.metrics?.fcfYield === undefined ? 'text-gray-400' : data.metrics.fcfYield > 0.05 ? 'text-green-500' : data.metrics.fcfYield < 0.02 ? 'text-red-500' : 'text-yellow-500'}`}>
                                        {data.metrics?.fcfYield !== null && data.metrics?.fcfYield !== undefined ? `${(data.metrics.fcfYield * 100).toFixed(1)}%` : 'N/A'}
                                        {compareWith && (data.metrics?.fcfYield || 0) > (secondaryData?.metrics?.fcfYield || 0) && ' 🏆'}
                                    </span>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <span className={`text-base font-bold ${secondaryData?.metrics?.fcfYield === null || secondaryData?.metrics?.fcfYield === undefined ? 'text-gray-400' : secondaryData.metrics.fcfYield > 0.05 ? 'text-green-500' : secondaryData.metrics.fcfYield < 0.02 ? 'text-red-500' : 'text-yellow-500'}`}>
                                            {secondaryData?.metrics?.fcfYield !== null && secondaryData?.metrics?.fcfYield !== undefined ? `${(secondaryData.metrics.fcfYield * 100).toFixed(1)}%` : 'N/A'}
                                            {(secondaryData?.metrics?.fcfYield || 0) > (data.metrics?.fcfYield || 0) && ' 🏆'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">P/E Ratio</p>
                                <p className="text-xs text-gray-400">Price to Earnings</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                                        {data.metrics?.currentPe !== null && data.metrics?.currentPe !== undefined ? `${data.metrics.currentPe.toFixed(1)}x` : 'N/A'}
                                        {compareWith && (data.metrics?.currentPe || 999) < (secondaryData?.metrics?.currentPe || 999) && ' 🏆'}
                                    </p>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                                            {secondaryData?.metrics?.currentPe !== null && secondaryData?.metrics?.currentPe !== undefined ? `${secondaryData.metrics.currentPe.toFixed(1)}x` : 'N/A'}
                                            {(secondaryData?.metrics?.currentPe || 999) < (data.metrics?.currentPe || 999) && ' 🏆'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">{data.humanPeInfo}</div>
                        {compareWith && secondaryData?.humanPeInfo && <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">[{compareWith}] {secondaryData.humanPeInfo}</div>}
                    </div>
                )}
            </div>
        </div>
    );
}
