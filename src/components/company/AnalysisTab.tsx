'use client';

import { lazy, Suspense, useState } from 'react';
import type { FinancialStatement } from './FinancialChart';
import { AnalysisHeader } from './analysis/AnalysisHeader';
import { FinancialHealthTable } from './analysis/FinancialHealthTable';
import { AnalysisCharts } from './AnalysisCharts';
import { useAnalysis } from '../../hooks/useAnalysis';
import { LoadingSkeleton } from './analysis/LoadingSkeleton';
import { ChartSection } from './shared/ChartSection';

const PriceCandlestickChart = lazy(() => import('./PriceCandlestickChart'));

export interface AnalysisTabProps {
    ticker: string;
    hideSearch?: boolean;
}

export interface AnalysisMetrics {
    zScore: number | null;
    altmanZ: number | null;
    debtRepaymentTime: number | null;
    debtRepaymentYears: number | null;
    fcfYield: number | null;
    currentEps: number | null;
    currentPe: number | null;
    fcfMargin: number | null;
    fcfConversion: number | null;
}

export interface AnalysisData {
    healthScore: number | null;
    profitabilityScore: number | null;
    valuationScore: number | null;
    verdictText: string | null;
    updatedAt: string;
    metrics: AnalysisMetrics;
    statements?: FinancialStatement[];
    peers?: string[];
    piotroskiScore?: number | null;
    beneishScore?: number | null;
    interestCoverage?: number | null;
    revenueCagr?: number | null;
    netIncomeCagr?: number | null;
    humanDebtInfo?: string | null;
    humanPeInfo?: string | null;
    marginStability?: number | null;
    negativeNiYears?: number | null;
    ticker?: {
        name: string | null;
        description: string | null;
        websiteUrl: string | null;
        logoUrl: string | null;
        sector: string | null;
        industry: string | null;
        employees: number | null;
        lastPrice: number | null;
        lastMarketCap: number | null;
        lastChangePct: number | null;
        lastMarketCapDiff: number | null;
        headquarters: string | null;
        lastPriceUpdated: string | null;
        latestPrevClose: number | null;
    } | null;
    balanceSheet?: {
        totalDebt: number | null;
        cash: number | null;
        netDebt: number | null;
        totalEquity: number | null;
        totalAssets: number | null;
        totalLiabilities: number | null;
        currentAssets: number | null;
        currentLiabilities: number | null;
        debtToEquity: number | null;
        currentRatio: number | null;
        assetToLiability: number | null;
        netDebtToEbit: number | null;
        sbc: number | null;
        sbcRatio: number | null;
        sharesOutstanding: number | null;
        dilution1y: number | null;
        dilution5y: number | null;
    } | null;
    ttm?: {
        netIncome: number | null;
        revenue: number | null;
        ebit: number | null;
        grossProfit: number | null;
    } | null;

    // Correlation / valuation extras
    priceHistory?: { date: string; price: number }[];
    impliedPricePS?: { date: string; impliedPrice: number }[];
    impliedPricePE?: { date: string; impliedPrice: number }[];
    correlation?: {
        priceVsImpliedPS: number | null;
        priceVsImpliedPE: number | null;
    };

    // Valuation history (intrinsic vs price)
    valuationHistory?: { date: string; price: number; intrinsic: number; undervaluationPct: number }[];
    valuationSummary?: {
        currentUndervaluation: number | null;
        avg5yUndervaluation: number | null;
        intrinsicCagr: number | null;
    } | null;
    valuationForecast?: { date: string; intrinsic: number }[];
}

function CompanyDescription({ text }: { text: string }) {
    const [expanded, setExpanded] = useState(false);
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const isLong = sentences.length > 5;
    const display = expanded ? text : sentences.slice(0, 5).join(' ').trim();

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-6">
            <p className="text-[10px] uppercase tracking-widest font-semibold text-gray-400 dark:text-gray-500 mb-3 flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Company Description
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
                {display}
            </p>
            {isLong && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-2 text-xs font-semibold text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                >
                    {expanded ? 'Show less ↑' : 'Read more ↓'}
                </button>
            )}
        </div>
    );
}

export default function AnalysisTab({ ticker, hideSearch = false }: AnalysisTabProps) {
    const {
        data,
        loading,
        analyzing,
        error,
        compareWith,
        secondaryData,
        runDeepAnalysis,
    } = useAnalysis(ticker);

    if (loading) return <LoadingSkeleton />;

    if (!data) {
        if (analyzing) return <LoadingSkeleton />;
        if (error) return <div className="p-4 text-red-500">Error: {error}</div>;
        return <div className="p-4 text-gray-500">No analysis data available.</div>;
    }

    return (
        <div className="space-y-6 p-4 bg-transparent dark:bg-gray-900 rounded-xl transition-all animate-fade-in">

            {/* ── Hero Section: Company Profile + Quick Search ── */}
            <AnalysisHeader ticker={ticker} hideSearch={hideSearch} data={data} />

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
