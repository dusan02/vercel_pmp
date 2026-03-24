import React from 'react';
import { AnalysisData } from '../AnalysisTab';

interface QualityStabilityStatsProps {
    ticker: string;
    data: AnalysisData;
    compareWith: string;
    secondaryData: AnalysisData | null;
}

export function QualityStabilityStats({
    ticker,
    data,
    compareWith,
    secondaryData
}: QualityStabilityStatsProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 p-6">
            <h4 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Quality & Stability Stats
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-gray-500 mb-1">Margin Volatility (σ)</div>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-[10px] text-gray-400">{ticker}</div>
                            <div className={`text-lg font-bold ${compareWith && (data.marginStability || 1) < (secondaryData?.marginStability || 1) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                {data.marginStability !== null && data.marginStability !== undefined ? (data.marginStability * 100).toFixed(1) + '%' : 'N/A'}
                                {compareWith && (data.marginStability || 1) < (secondaryData?.marginStability || 1) && ' 🏆'}
                            </div>
                        </div>
                        {compareWith && (
                            <div className="text-right">
                                <div className="text-[10px] text-gray-400">{compareWith}</div>
                                <div className={`text-lg font-bold ${(secondaryData?.marginStability || 1) < (data.marginStability || 1) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                    {secondaryData?.marginStability !== null && secondaryData?.marginStability !== undefined ? (secondaryData.marginStability * 100).toFixed(1) + '%' : 'N/A'}
                                    {(secondaryData?.marginStability || 1) < (data.marginStability || 1) && ' 🏆'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                    <div className="text-xs text-gray-500 mb-1">Negative NI Years (10Y)</div>
                    <div className="flex justify-between items-end">
                        <div>
                            <div className="text-[10px] text-gray-400">{ticker}</div>
                            <div className={`text-lg font-bold ${compareWith && (data.negativeNiYears || 0) < (secondaryData?.negativeNiYears || 0) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                {data.negativeNiYears ?? '0'}y
                                {compareWith && (data.negativeNiYears || 0) < (secondaryData?.negativeNiYears || 0) && ' 🏆'}
                            </div>
                        </div>
                        {compareWith && (
                            <div className="text-right">
                                <div className="text-[10px] text-gray-400">{compareWith}</div>
                                <div className={`text-lg font-bold ${(secondaryData?.negativeNiYears || 0) < (data.negativeNiYears || 0) ? 'text-green-600' : 'text-gray-900 dark:text-white'}`}>
                                    {secondaryData?.negativeNiYears ?? '0'}y
                                    {(secondaryData?.negativeNiYears || 0) < (data.negativeNiYears || 0) && ' 🏆'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
