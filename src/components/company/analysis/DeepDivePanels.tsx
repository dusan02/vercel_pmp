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

function fmtPct(v: number | null | undefined, decimals = 1): string {
    if (v == null) return 'N/A';
    return `${v.toFixed(decimals)}%`;
}

export function DeepDivePanels({
    ticker,
    data,
    compareWith,
    secondaryData,
    openPanel,
    togglePanel
}: DeepDivePanelsProps) {
    // Finnhub metrics shortcuts
    const fh = data.finnhub?.metrics;
    const sfh = secondaryData?.finnhub?.metrics;

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
                                <p className="text-xs text-gray-400">Below -2.22 = Safe · Above -1.78 = Risk</p>
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

                        {/* Interest Coverage — prefer Finnhub, fallback to computed */}
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300" title="EBIT / Interest Expense. Measures ability to pay interest. > 3 is Solid.">Interest Coverage ⓘ</p>
                                <p className="text-xs text-gray-400">EBIT / Interest Expense · {fh?.interestCoverage != null ? 'via Finnhub' : 'computed'}</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    {/* Finnhub > computed fallback */}
                                    <span className={`text-base font-bold ${(fh?.interestCoverage ?? data.interestCoverage) == null ? 'text-gray-400' : (fh?.interestCoverage ?? data.interestCoverage)! > 5 ? 'text-green-500' : (fh?.interestCoverage ?? data.interestCoverage)! > 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                        {(fh?.interestCoverage ?? data.interestCoverage) != null ? `${(fh?.interestCoverage ?? data.interestCoverage)!.toFixed(1)}x` : 'N/A'}
                                        {compareWith && ((fh?.interestCoverage ?? data.interestCoverage) || 0) > ((sfh?.interestCoverage ?? secondaryData?.interestCoverage) || 0) && ' 🏆'}
                                    </span>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <span className={`text-base font-bold ${(sfh?.interestCoverage ?? secondaryData?.interestCoverage) == null ? 'text-gray-400' : (sfh?.interestCoverage ?? secondaryData?.interestCoverage)! > 5 ? 'text-green-500' : (sfh?.interestCoverage ?? secondaryData?.interestCoverage)! > 2 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {(sfh?.interestCoverage ?? secondaryData?.interestCoverage) != null ? `${(sfh?.interestCoverage ?? secondaryData?.interestCoverage)!.toFixed(1)}x` : 'N/A'}
                                            {((sfh?.interestCoverage ?? secondaryData?.interestCoverage) || 0) > ((fh?.interestCoverage ?? data.interestCoverage) || 0) && ' 🏆'}
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
                        {/* Revenue CAGR (computed) */}
                        <div className="flex justify-between items-start py-2">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Revenue CAGR (5Y)</p>
                                <p className="text-xs text-gray-400">Annual revenue growth rate · computed</p>
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
                        {/* Net Income CAGR (computed) */}
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Net Income CAGR (5Y)</p>
                                <p className="text-xs text-gray-400">Annual net income growth rate · computed</p>
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
                        {/* Gross Margin (Finnhub) — NEW */}
                        {(fh?.grossMargin != null || sfh?.grossMargin != null) && (
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Gross Margin <span className="text-[9px] font-bold px-1 py-0 rounded bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 uppercase ml-1">FH</span></p>
                                    <p className="text-xs text-gray-400">(Revenue − COGS) / Revenue · via Finnhub</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${fh?.grossMargin == null ? 'text-gray-400' : fh.grossMargin > 50 ? 'text-green-500' : fh.grossMargin > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {fmtPct(fh?.grossMargin)}
                                            {compareWith && (fh?.grossMargin || -99) > (sfh?.grossMargin || -99) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${sfh?.grossMargin == null ? 'text-gray-400' : sfh.grossMargin > 50 ? 'text-green-500' : sfh.grossMargin > 20 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {fmtPct(sfh?.grossMargin)}
                                                {(sfh?.grossMargin || -99) > (fh?.grossMargin || -99) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {/* ROIC (Finnhub) — NEW */}
                        {(fh?.roic != null || sfh?.roic != null) && (
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">ROIC <span className="text-[9px] font-bold px-1 py-0 rounded bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 uppercase ml-1">FH</span></p>
                                    <p className="text-xs text-gray-400">Return on Invested Capital · via Finnhub</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${fh?.roic == null ? 'text-gray-400' : fh.roic > 15 ? 'text-green-500' : fh.roic > 8 ? 'text-yellow-500' : 'text-red-500'}`}>
                                            {fmtPct(fh?.roic)}
                                            {compareWith && (fh?.roic || -99) > (sfh?.roic || -99) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${sfh?.roic == null ? 'text-gray-400' : sfh.roic > 15 ? 'text-green-500' : sfh.roic > 8 ? 'text-yellow-500' : 'text-red-500'}`}>
                                                {fmtPct(sfh?.roic)}
                                                {(sfh?.roic || -99) > (fh?.roic || -99) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
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
                        {/* FCF Yield */}
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
                        {/* P/E Ratio — Finnhub primary, computed fallback */}
                        <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                            <div>
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    P/E Ratio
                                    {fh?.peRatio != null && <span className="text-[9px] font-bold px-1 py-0 rounded bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 uppercase ml-1">FH</span>}
                                </p>
                                <p className="text-xs text-gray-400">Price to Earnings · {fh?.peRatio != null ? 'Finnhub TTM' : 'computed from DB'}</p>
                            </div>
                            <div className="flex gap-4">
                                <div className="text-right">
                                    <div className="text-[10px] text-gray-400">{ticker}</div>
                                    {/* Use Finnhub P/E first, fall back to computed */}
                                    <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                                        {(fh?.peRatio ?? data.metrics?.currentPe) !== null && (fh?.peRatio ?? data.metrics?.currentPe) !== undefined
                                            ? `${(fh?.peRatio ?? data.metrics?.currentPe)!.toFixed(1)}x`
                                            : 'N/A'}
                                        {compareWith && (fh?.peRatio ?? data.metrics?.currentPe ?? 999) < (sfh?.peRatio ?? secondaryData?.metrics?.currentPe ?? 999) && ' 🏆'}
                                    </p>
                                </div>
                                {compareWith && (
                                    <div className="text-right border-l dark:border-gray-700 pl-4">
                                        <div className="text-[10px] text-gray-400">{compareWith}</div>
                                        <p className="text-base font-bold text-gray-700 dark:text-gray-300">
                                            {(sfh?.peRatio ?? secondaryData?.metrics?.currentPe) !== null && (sfh?.peRatio ?? secondaryData?.metrics?.currentPe) !== undefined
                                                ? `${(sfh?.peRatio ?? secondaryData?.metrics?.currentPe)!.toFixed(1)}x`
                                                : 'N/A'}
                                            {(sfh?.peRatio ?? secondaryData?.metrics?.currentPe ?? 999) < (fh?.peRatio ?? data.metrics?.currentPe ?? 999) && ' 🏆'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="text-[10px] text-blue-600 dark:text-blue-400 font-medium">{data.humanPeInfo}</div>
                        {compareWith && secondaryData?.humanPeInfo && <div className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">[{compareWith}] {secondaryData.humanPeInfo}</div>}
                        {/* EV/EBITDA (Finnhub) — NEW */}
                        {(fh?.evEbitda != null || sfh?.evEbitda != null) && (
                            <div className="flex justify-between items-start py-2 border-t border-gray-100 dark:border-gray-700">
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">EV/EBITDA <span className="text-[9px] font-bold px-1 py-0 rounded bg-blue-50 text-blue-500 dark:bg-blue-900/30 dark:text-blue-400 uppercase ml-1">FH</span></p>
                                    <p className="text-xs text-gray-400">Enterprise Value / EBITDA · via Finnhub</p>
                                </div>
                                <div className="flex gap-4">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-400">{ticker}</div>
                                        <span className={`text-base font-bold ${fh?.evEbitda == null ? 'text-gray-400' : fh.evEbitda < 10 ? 'text-green-500' : fh.evEbitda > 25 ? 'text-red-500' : 'text-yellow-500'}`}>
                                            {fh?.evEbitda != null ? `${fh.evEbitda.toFixed(1)}x` : 'N/A'}
                                            {compareWith && (fh?.evEbitda || 999) < (sfh?.evEbitda || 999) && ' 🏆'}
                                        </span>
                                    </div>
                                    {compareWith && (
                                        <div className="text-right border-l dark:border-gray-700 pl-4">
                                            <div className="text-[10px] text-gray-400">{compareWith}</div>
                                            <span className={`text-base font-bold ${sfh?.evEbitda == null ? 'text-gray-400' : sfh.evEbitda < 10 ? 'text-green-500' : sfh.evEbitda > 25 ? 'text-red-500' : 'text-yellow-500'}`}>
                                                {sfh?.evEbitda != null ? `${sfh.evEbitda.toFixed(1)}x` : 'N/A'}
                                                {(sfh?.evEbitda || 999) < (fh?.evEbitda || 999) && ' 🏆'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
