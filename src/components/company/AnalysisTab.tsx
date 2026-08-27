'use client';

import { lazy, Suspense } from 'react';
import { AnalysisHeader } from './analysis/AnalysisHeader';
import { FinancialHealthTable } from './analysis/FinancialHealthTable';
import { CompanyDescription } from './analysis/CompanyDescription';
import { AnalysisControlsBar } from './analysis/AnalysisControlsBar';
import { CompareToolbar } from './analysis/CompareToolbar';
import { AnalysisCharts } from './AnalysisCharts';
import { useAnalysis } from '../../hooks/useAnalysis';
import { LoadingSkeleton } from './analysis/LoadingSkeleton';
import { ChartSection } from './shared/ChartSection';
import type { AnalysisTabProps } from './analysis/types';

// Re-export types for backward compatibility (other files import from here)
export type {
    AnalysisTabProps,
    AnalysisData,
    AnalysisMetrics,
    RatioStats,
    FinancialStatement,
} from './analysis/types';

const PriceCandlestickChart = lazy(() => import('./PriceCandlestickChart'));

export default function AnalysisTab({ ticker, hideSearch = false }: AnalysisTabProps) {
    const {
        data,
        loading,
        analyzing,
        error,
        compareWith,
        compareInput,
        secondaryData,
        loadingCompare,
        analysisStep,
        setCompareInput,
        runDeepAnalysis,
        handleAddComparison,
        handleRemoveComparison,
    } = useAnalysis(ticker);

    if (loading) return <LoadingSkeleton analysisStep={analysisStep} />;

    if (!data) {
        if (analyzing) return <LoadingSkeleton analysisStep={analysisStep} />;
        if (error) return (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/30 mb-4">
                    <svg className="w-6 h-6 text-rose-600 dark:text-rose-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    Analysis Unavailable
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                    We couldn&apos;t load the analysis data for {ticker}. This might be a temporary issue.
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-500 mb-6 font-mono bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2 inline-block max-w-full truncate">
                    {error}
                </p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={runDeepAnalysis}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retry Analysis
                    </button>
                    <a
                        href="/"
                        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                        Back to Home
                    </a>
                </div>
            </div>
        );
        return (
            <div className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                    <svg className="w-6 h-6 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                    No Analysis Data
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 max-w-sm mx-auto">
                    We haven&apos;t analyzed {ticker} yet. Run a deep analysis to get financial scores, valuation metrics, and growth data.
                </p>
                <button
                    onClick={runDeepAnalysis}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Run Analysis
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4 bg-transparent dark:bg-gray-900 rounded-xl transition-all animate-fade-in">
            {/* ── Hero Section: Company Profile + Quick Search ── */}
            <AnalysisHeader ticker={ticker} hideSearch={hideSearch} data={data} />

            {/* ── Controls: Last Updated + Refresh ── */}
            <AnalysisControlsBar
                updatedAt={data.updatedAt ?? null}
                analyzing={analyzing}
                onRefresh={runDeepAnalysis}
            />

            {/* ── Compare with another ticker ── */}
            <CompareToolbar
                ticker={ticker}
                compareWith={compareWith}
                compareInput={compareInput}
                loadingCompare={loadingCompare}
                peers={data.peers}
                onCompareInput={setCompareInput}
                onAddComparison={handleAddComparison}
                onRemoveComparison={handleRemoveComparison}
            />

            {/* ── Price History — full width, prominent ── */}
            <ChartSection
                iconBgClass="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
                title="Price History"
                subtitle="5-Year Weekly Candlestick Chart"
            >
                <Suspense fallback={<div className="flex justify-center items-center h-72"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500" /></div>}>
                    <PriceCandlestickChart ticker={ticker} />
                </Suspense>
            </ChartSection>

            {/* ── Company Description ── */}
            {data.ticker?.description && (
                <CompanyDescription text={data.ticker.description} />
            )}

            {/* ── Executive Summary: Key Financial Metrics ── */}
            <FinancialHealthTable
                ticker={ticker}
                data={data}
                compareWith={compareWith}
                secondaryData={secondaryData}
            />

            {/* ── Charts Dashboard (2-Column Grid) ── */}
            <AnalysisCharts ticker={ticker} data={data} />
        </div>
    );
}
