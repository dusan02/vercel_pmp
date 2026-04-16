'use client';

import { lazy, Suspense, useState } from 'react';
import FinancialChart, { FinancialStatement } from './FinancialChart';
import DebtCashChart from './DebtCashChart';
import CashFlowChart from './CashFlowChart';
import ShareDilutionChart from './ShareDilutionChart';
import { AnalysisHeader } from './analysis/AnalysisHeader';
import { FinancialHealthTable } from './analysis/FinancialHealthTable';
import { DeepDivePanels } from './analysis/DeepDivePanels';
import { QualityStabilityStats } from './analysis/QualityStabilityStats';
import { ScenarioLab } from './analysis/ScenarioLab';
import { useAnalysis } from '../../hooks/useAnalysis';
import { LoadingSkeleton } from './analysis/LoadingSkeleton';
import { BalanceSheetTable } from './analysis/BalanceSheetTable';
import { ChartSection } from './shared/ChartSection';

const ValuationCharts = lazy(() => import('./ValuationCharts'));

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

/** Subset of Finnhub metrics exposed to the frontend */
export interface FinnhubMetricsSubset {
    peRatio: number | null;
    forwardPe: number | null;
    pbRatio: number | null;
    psRatio: number | null;
    evEbitda: number | null;
    pegRatio: number | null;
    priceCashFlow: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    netMargin: number | null;
    roe: number | null;
    roa: number | null;
    roic: number | null;
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    debtEquityRatio: number | null;
    interestCoverage: number | null;
    beta: number | null;
    dividendYield: number | null;
    payoutRatio: number | null;
    employees: number | null;
}

export interface FinnhubPriceTargetSubset {
    targetHigh: number | null;
    targetLow: number | null;
    targetMean: number | null;
    targetMedian: number | null;
    numberOfAnalysts: number | null;
    currentPrice: number | null;
}

export interface FinnhubProfileSubset {
    exchange: string | null;
    currency: string | null;
    country: string | null;
    ipoDate: string | null;
    marketCap: number | null;
    shareOutstanding: number | null;
    finnhubIndustry: string | null;
    finnhubSector: string | null;
}

export interface FinnhubData {
    metrics: FinnhubMetricsSubset | null;
    priceTarget: FinnhubPriceTargetSubset | null;
    profile: FinnhubProfileSubset | null;
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
    finnhub?: FinnhubData | null;
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
        headquarters: string | null;
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
        netDebtToEbitda: number | null;
        sbc: number | null;
        sbcRatio: number | null;
        sharesOutstanding: number | null;
        dilution1y: number | null;
        dilution5y: number | null;
    } | null;
}

type TabType = 'overview' | 'charts' | 'financials' | 'scenario';

export default function AnalysisTab({ ticker, hideSearch = false }: AnalysisTabProps) {
    const {
        data,
        loading,
        analyzing,
        error,
        compareWith,
        secondaryData,
        openPanel,
        togglePanel,
        runDeepAnalysis,
    } = useAnalysis(ticker);

    const [activeTab, setActiveTab] = useState<TabType>('overview');

    if (loading) return <LoadingSkeleton />;

    if (!data) {
        if (analyzing) return <LoadingSkeleton />;
        if (error) return (
            <div className="flex flex-col items-center justify-center p-12 text-center bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-200 dark:border-red-800">
                <p className="text-red-600 dark:text-red-400 font-medium mb-3">{error}</p>
                <button
                    onClick={runDeepAnalysis}
                    className="text-sm bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-5 rounded-lg transition-colors"
                >
                    Retry
                </button>
            </div>
        );
        return <LoadingSkeleton />;
    }

    return (
        <div className="w-full bg-transparent dark:bg-gray-950 pb-20 animate-fade-in relative">
            
            {/* Hero Section: Company Profile + Quick Search */}
            <div className="px-4 pt-4">
                <AnalysisHeader ticker={ticker} hideSearch={hideSearch} data={data} />
            </div>

            {/* Sticky Mobile-friendly Tabs */}
            <div className="sticky top-0 z-40 bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl border-b border-gray-200 dark:border-gray-800 mt-4 mx-4 rounded-t-xl">
                <div className="flex overflow-x-auto hide-scrollbar p-2 gap-2">
                    {(['overview', 'charts', 'financials', 'scenario'] as TabType[]).map(tab => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                                activeTab === tab
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4 mt-2">
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-fade-in">
                        <QualityStabilityStats
                            ticker={ticker}
                            data={data}
                            compareWith={compareWith}
                            secondaryData={secondaryData}
                        />
                        <FinancialHealthTable
                            ticker={ticker}
                            data={data}
                            compareWith={compareWith}
                            secondaryData={secondaryData}
                        />
                    </div>
                )}

                {activeTab === 'charts' && (
                    <div className="animate-fade-in -mx-4 px-4 sm:mx-0 sm:px-0">
                        {/* Horizontal Snap Scroll for Charts on Mobile, Grid on Desktop */}
                        <div className="flex overflow-x-auto sm:overflow-x-visible snap-x snap-mandatory sm:snap-none sm:grid sm:grid-cols-1 lg:grid-cols-2 gap-4 pb-6 sm:pb-0 hide-scrollbar">
                            
                            <div className="w-[85vw] sm:w-full shrink-0 snap-center">
                                <ChartSection
                                    iconBgClass="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                    icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
                                    title="Historical Valuation Charts"
                                    subtitle="P/E Bands, P/S Bands & Revenue History"
                                >
                                    <Suspense fallback={<div className="flex justify-center items-center h-48"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" /></div>}>
                                        <ValuationCharts ticker={ticker} />
                                    </Suspense>
                                </ChartSection>
                            </div>

                            <div className="w-[85vw] sm:w-full shrink-0 snap-center">
                                <ChartSection
                                    iconBgClass="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                                    title="Income Statement Trends"
                                    subtitle="Revenue, Net Income & EBITDA"
                                    hasData={!!(data.statements && data.statements.length > 0)}
                                    emptyMessage="No financial statement data available."
                                >
                                    <FinancialChart statements={data.statements!} />
                                </ChartSection>
                            </div>

                            <div className="w-[85vw] sm:w-full shrink-0 snap-center">
                                <ChartSection
                                    iconBgClass="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>}
                                    title="Debt vs Cash"
                                    subtitle="Total Debt & Liquidity History"
                                    hasData={!!(data.statements && data.statements.length > 0)}
                                    emptyMessage="No balance sheet data available."
                                >
                                    <DebtCashChart statements={data.statements!} />
                                </ChartSection>
                            </div>

                            <div className="w-[85vw] sm:w-full shrink-0 snap-center">
                                <ChartSection
                                    iconBgClass="bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
                                    title="Cash Flow Analysis"
                                    subtitle="Operating Cash Flow, FCF & Net Income"
                                    hasData={!!(data.statements && data.statements.length > 0)}
                                    emptyMessage="No cash flow data available."
                                >
                                    <CashFlowChart statements={data.statements!} />
                                </ChartSection>
                            </div>

                            <div className="w-[85vw] sm:w-full shrink-0 snap-center">
                                <ChartSection
                                    iconBgClass="bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
                                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                                    title="Shares Outstanding"
                                    subtitle="Share Count History & Dilution"
                                    hasData={!!(data.statements && data.statements.length > 0)}
                                    emptyMessage="No share data available."
                                >
                                    <ShareDilutionChart statements={data.statements!} />
                                </ChartSection>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'financials' && (
                    <div className="space-y-6 animate-fade-in">
                        <BalanceSheetTable
                            ticker={ticker}
                            data={data}
                            compareWith={compareWith}
                            secondaryData={secondaryData}
                        />
                        <DeepDivePanels
                            ticker={ticker}
                            data={data}
                            compareWith={compareWith}
                            secondaryData={secondaryData}
                            openPanel={openPanel}
                            togglePanel={togglePanel}
                        />
                    </div>
                )}

                {activeTab === 'scenario' && (
                    <div className="animate-fade-in">
                        <ChartSection
                            iconBgClass="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                            icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
                            title="Scenario Lab"
                            subtitle="Interactive 5-Year Investment Projection"
                        >
                            {(!data.metrics?.currentEps && !(data.finnhub?.metrics as any)?.epsExclExtraItemsTTM) ? (
                                <div className="bg-gray-50 dark:bg-gray-800/50 p-6 rounded-lg text-center border border-gray-100 dark:border-gray-700/50">
                                    <p className="text-gray-500 dark:text-gray-400">Not enough data available to run scenarios. Missing valid EPS.</p>
                                </div>
                            ) : (
                                <ScenarioLab
                                    currentEps={data.metrics?.currentEps ?? (data.finnhub?.metrics as any)?.epsExclExtraItemsTTM ?? 0}
                                    currentPe={data.metrics?.currentPe ?? data.finnhub?.metrics?.peRatio ?? 20}
                                    currentPrice={data.ticker?.lastPrice ?? ((data.metrics?.currentEps ?? (data.finnhub?.metrics as any)?.epsExclExtraItemsTTM ?? 0) * (data.metrics?.currentPe ?? data.finnhub?.metrics?.peRatio ?? 20))}
                                />
                            )}
                        </ChartSection>
                    </div>
                )}
            </div>
        </div>
    );
}




