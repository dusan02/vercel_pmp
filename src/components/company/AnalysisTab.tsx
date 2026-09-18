'use client';

import { FinancialHealthTable } from './analysis/FinancialHealthTable';
import { AnalysisControlsBar } from './analysis/AnalysisControlsBar';
import { CompareToolbar } from './analysis/CompareToolbar';
import { AnalysisCharts } from './AnalysisCharts';
import { useAnalysis } from '../../hooks/useAnalysis';
import { LoadingSkeleton } from './analysis/LoadingSkeleton';
import type { AnalysisTabProps } from './analysis/types';
import type { FlowPeriods } from './analysis/sections/FinancialFlowsSection';

// Re-export types for backward compatibility (other files import from here)
export type {
    AnalysisTabProps,
    AnalysisData,
    AnalysisMetrics,
    RatioStats,
    FinancialStatement,
} from './analysis/types';

/**
 * Interactive analysis body for /analysis/[ticker].
 *
 * The SSR page renders the document header, company overview, price history,
 * analyst consensus and earnings. This tab renders the interactive parts
 * only: controls, compare toolbar, the charts grid and the interpreted Key
 * Financial Metrics table (with compare column).
 */
export default function AnalysisTab({ ticker, initialAnalysisData, initialHistoryData, flowPeriods }: AnalysisTabProps & { initialAnalysisData?: any; initialHistoryData?: any; flowPeriods?: FlowPeriods | null | undefined }) {
    const {
        data,
        loading,
        analyzing,
        error,
        compareWith,
        compareInput,
        secondaryData,
        loadingCompare,
        compareError,
        analysisStep,
        setCompareInput,
        runDeepAnalysis,
        handleAddComparison,
        handleRemoveComparison,
    } = useAnalysis(ticker, initialAnalysisData, initialHistoryData);

    if (loading) return <LoadingSkeleton analysisStep={analysisStep} />;

    if (!data) {
        if (analyzing) return <LoadingSkeleton analysisStep={analysisStep} />;
        if (error) return (
            <div role="alert" className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
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
                <p className="text-xs text-gray-500 dark:text-gray-500 mb-6 font-mono bg-gray-50 dark:bg-gray-900/50 rounded-lg px-3 py-2 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
                    {error}
                </p>
                <div className="flex items-center justify-center gap-3">
                    <button
                        onClick={runDeepAnalysis}
                        aria-label="Retry analysis"
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
            <div role="status" aria-live="polite" className="p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-700 mb-4">
                    <svg className="w-6 h-6 text-gray-500 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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
                    aria-label="Run deep analysis"
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
            {/* ── Charts Dashboard (2-Column Grid) — core content first ── */}
            <AnalysisCharts ticker={ticker} data={data} flowPeriods={flowPeriods} />

            {/* ── Compare — sits directly above the table whose column it fills ── */}
            <CompareToolbar
                ticker={ticker}
                compareWith={compareWith}
                compareInput={compareInput}
                loadingCompare={loadingCompare}
                compareError={compareError}
                peers={data.peers}
                onCompareInput={setCompareInput}
                onAddComparison={handleAddComparison}
                onRemoveComparison={handleRemoveComparison}
            />

            {/* ── Consolidated metrics table: scores, margins, ratios, quality
                — sits below the charts as the detailed numbers behind them ── */}
            <FinancialHealthTable
                data={data}
                compareWith={compareWith}
                secondaryData={secondaryData}
                flowPeriods={flowPeriods}
            />

            {/* ── Controls: Last Updated + Refresh — utility chrome as footer ── */}
            <AnalysisControlsBar
                updatedAt={data.updatedAt ?? null}
                analyzing={analyzing}
                onRefresh={runDeepAnalysis}
            />
        </div>
    );
}
