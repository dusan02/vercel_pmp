'use client';

import { lazy, Suspense } from 'react';
import { ChartSection } from '@/components/company/shared/ChartSection';
import { ChartErrorBoundary } from '@/components/company/shared/ChartErrorBoundary';

const PriceCandlestickChart = lazy(() => import('@/components/company/PriceCandlestickChart'));

/**
 * The main price chart — 5Y weekly candlesticks rendered as a top-level,
 * full-width section (it was previously buried mid-page inside AnalysisTab).
 */
export function PriceHistorySection({ ticker }: { ticker: string }) {
    return (
        <div className="mb-6">
            <ChartErrorBoundary>
                <ChartSection
                    iconBgClass="bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400"
                    icon={<svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" /></svg>}
                    title="Price History"
                    subtitle="5-Year Weekly Candlestick Chart"
                    as="h2"
                >
                    <Suspense fallback={<div className="flex justify-center items-center" style={{ height: 360 }}><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-500" /></div>}>
                        <PriceCandlestickChart ticker={ticker} />
                    </Suspense>
                </ChartSection>
            </ChartErrorBoundary>
        </div>
    );
}
