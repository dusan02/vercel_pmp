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
        if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
        return <div className="p-4 text-gray-500">No analysis data available.</div>;
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
