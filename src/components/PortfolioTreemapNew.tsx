'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';
import type { CompanyNode } from '@/lib/heatmap/types';
import styles from '@/styles/heatmap.module.css';
import { MarketHeatmap } from './MarketHeatmap';
import { useElementResize } from '@/hooks/useElementResize';
import { formatCurrencyCompact, formatPercent } from '@/lib/utils/format';

interface PortfolioPerformanceTreemapProps {
    data: Array<{
        ticker: string;
        value: number; // Position Value
        dailyChangePercent: number; // Daily % Change
        dailyChangeValue: number; // Daily $ Change (P&L)
        sector?: string;
        industry?: string;
    }>;
    metric?: 'percent' | 'dollar';
}

export function PortfolioPerformanceTreemap({ data, metric = 'percent' }: PortfolioPerformanceTreemapProps) {
    const { ref, size } = useElementResize();
    const width = size.width;

    // Transform portfolio data to CompanyNode format
    // UX:
    // - Tile AREA should represent absolute daily P&L (big gain/loss = big tile)
    // - Tile COLOR should represent % move magnitude (saturated for big moves, pale/gray for small moves)
    const heatmapData: CompanyNode[] = useMemo(() => {
        return data.map(item => ({
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
            changePercent: item.dailyChangePercent || 0,

            // Layout sizing (area): absolute daily $ P&L (D3 requires > 0)
            marketCapDiff: item.dailyChangeValue, // Tooltip value ($ P&L)
            marketCapDiffAbs: Math.max(0.01, Math.abs(item.dailyChangeValue || 0)),
            // Provide formatted display value for custom rendering
            // User Request: Show both % change AND dollar value in the square
            displayValue: `${formatPercent(item.dailyChangePercent)}\n${formatCurrencyCompact(item.dailyChangeValue, true)}`,
            currentPrice: 0,
            isStale: false
        }));
    }, [data, metric]);

    // UX sizing: keep this treemap roughly the size of donut cards (not "infinite height").
    // - Clamp height so desktop doesn't become gigantic
    // - Still responsive: scale with available width, but capped
    const dynamicHeight = useMemo(() => {
        const w = width || 600; // fallback during first render
        const isNarrow = w < 640;
        const cap = isNarrow ? 320 : 360;
        const target = Math.round(w * 0.6);
        return Math.min(cap, Math.max(240, target));
    }, [width]);

    return (
        <div className="w-full p-4 md:p-6 bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-base font-semibold text-[var(--clr-subtext)] mb-4 uppercase tracking-wider">
                Performance Map (Daily P&L)
            </h3>

            <div
                className="relative w-full overflow-hidden select-none"
                style={{
                    width: '100%',
                    height: `${dynamicHeight}px`,
                    minHeight: '240px',
                    maxWidth: '720px',
                    margin: '0 auto',
                    backgroundColor: '#000000',
                    color: 'white' // ensure any text inside is visible against black
                }}
            >
                <div ref={ref} className="absolute inset-0" />

                {width > 0 && dynamicHeight > 0 && (
                    <MarketHeatmap
                        data={heatmapData}
                        width={width}
                        height={dynamicHeight}
                        timeframe="day"
                        // Color/labels by % move (intensity)
                        metric="percent"
                        // Layout by abs daily $ P&L (tile area)
                        layoutMetric="mcap"
                        sectorLabelVariant="compact"
                    />
                )}
            </div>
        </div>
    );
}
