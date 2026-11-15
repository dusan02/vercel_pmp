'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { CompanyNode } from '@/lib/heatmap/types';
import styles from '@/styles/heatmap.module.css';
import { useElementResize } from '@/hooks/useElementResize';
import { formatCurrencyCompact, formatPercent } from '@/lib/utils/format';

// Keep D3-heavy heatmap code out of the default bundle.
const MarketHeatmap = dynamic(
    () => import('./MarketHeatmap').then((m) => ({ default: m.MarketHeatmap })),
    { ssr: false }
);

const MobileTreemapNew = dynamic(
    () => import('./MobileTreemapNew').then((m) => ({ default: m.MobileTreemapNew })),
    { ssr: false }
);

import { useMediaQuery } from '@/hooks/useMediaQuery';

interface PortfolioPerformanceTreemapProps {
    data: Array<{
        ticker: string;
        value: number; // Position Value
        dailyChangePercent: number; // Daily % Change
        dailyChangeValue: number; // Daily $ Change (P&L)
        totalReturnPercent?: number | null; // Total % return vs cost basis
        totalPnl?: number | null; // Total $ P&L vs cost basis
        sector?: string;
        industry?: string;
    }>;
    metric?: 'percent' | 'dollar';
}

export function PortfolioPerformanceTreemap({ data, metric = 'percent' }: PortfolioPerformanceTreemapProps) {
    const { ref, size } = useElementResize();
    const width = size.width;
    const isMobile = useMediaQuery('(max-width: 767px)');
    const hasCost = data.some(d => d.totalReturnPercent != null);
    const [mode, setMode] = React.useState<'daily' | 'total'>('daily');
    const effectiveMode = mode === 'total' && hasCost ? 'total' : 'daily';

    // Transform portfolio data to CompanyNode format
    // UX:
    // - Tile AREA should represent absolute daily P&L (big gain/loss = big tile)
    // - Tile COLOR should represent % move magnitude (saturated for big moves, pale/gray for small moves)
    const heatmapData: CompanyNode[] = useMemo(() => {
        return data.map(item => {
            const useTotal = effectiveMode === 'total' && item.totalReturnPercent != null;
            const pct = useTotal ? (item.totalReturnPercent ?? 0) : (item.dailyChangePercent || 0);
            const pnl = useTotal ? (item.totalPnl ?? 0) : item.dailyChangeValue;
            return {
                symbol: item.ticker,
                name: item.ticker,
                // CRITICAL (mobile UX):
                // MarketHeatmap uses a multi-sector vertical layout on mobile.
                // For a portfolio treemap we want a single compact treemap, not stacked sector blocks.
                // Group all holdings into one pseudo-sector to avoid "only 1-2 tiles visible" clipping.
                sector: 'Portfolio',
                industry: 'Portfolio',

                // Keep position value around for tooltip/context (even though area is driven by P&L).
                marketCap: Math.max(1, item.value || 0),

                // Color/Change (sign + intensity): % move
                changePercent: pct,

                // Layout sizing (area): absolute daily $ P&L (D3 requires > 0)
                marketCapDiff: pnl, // Tooltip value ($ P&L)
                marketCapDiffAbs: Math.max(0.01, Math.abs(pnl || 0)),
                // Provide formatted display value for custom rendering
                // User Request: Show both % change AND dollar value in the square
                displayValue: `${formatPercent(pct)}\n${formatCurrencyCompact(pnl, true)}`,
                currentPrice: 0,
                isStale: false
            };
        });
    }, [data, metric, effectiveMode]);

    // Match stretched row height when placed alongside donut cards, with a clean mobile fallback.
    const renderHeight = useMemo(() => {
        if (size.height > 0) return Math.round(size.height);
        const w = width || 400;
        return Math.min(360, Math.max(260, Math.round(w * 0.85)));
    }, [size.height, width]);

    return (
        <div className="w-full h-full flex flex-col p-4 md:p-5 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h3 className="text-sm xl:text-base font-semibold text-[var(--clr-subtext)] uppercase tracking-wider">
                    Performance Map ({effectiveMode === 'total' ? 'Total Return' : 'Daily P&L'})
                </h3>
                {hasCost && (
                    <div className="flex gap-1 shrink-0">
                        {(['daily', 'total'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`px-2 py-0.5 text-xs font-semibold rounded-md transition-colors capitalize ${
                                    effectiveMode === m
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                            >
                                {m}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div
                className="relative w-full flex-1 min-h-[260px] sm:min-h-[300px] overflow-hidden select-none"
                style={{
                    backgroundColor: 'transparent',
                    color: 'inherit'
                }}
            >
                <div ref={ref} className="absolute inset-0" />

                {width > 0 && renderHeight > 0 && (
                    isMobile ? (
                        <MobileTreemapNew
                            data={heatmapData}
                            timeframe="day"
                            metric="percent"
                            layoutMetric="mcap"
                            height={renderHeight}
                        />
                    ) : (
                        <MarketHeatmap
                            data={heatmapData}
                            width={width}
                            height={renderHeight}
                            timeframe="day"
                            // Color/labels by % move (intensity)
                            metric="percent"
                            // Layout by abs daily $ P&L (tile area)
                            layoutMetric="mcap"
                            sectorLabelVariant="compact"
                        />
                    )
                )}
            </div>
        </div>
    );
}
