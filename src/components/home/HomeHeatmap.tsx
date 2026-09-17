import React from 'react';
import dynamic from 'next/dynamic';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { HeatmapSkeleton } from '../SectionSkeleton';
import { StockData } from '@/lib/types';

// CRITICAL: Heatmap je prvá obrazovka na mobile - prioritizuj načítanie
// ssr: true — HeatmapPreview je SSR-safe (browser APIs len v effects/handlers).
// SSR renderuje "Measuring container..." state a zahŕňa chunk v HTML →
// odstráni waterfall: užívateľ vidí loading stav hneď a hydratácia je rýchla.
const HeatmapPreview = dynamic(
    () => import('../HeatmapPreview').then((mod) => mod.HeatmapPreview),
    {
        ssr: true,
        loading: () => <HeatmapSkeleton />,
    }
);

interface HomeHeatmapProps {
    wrapperClass?: string | undefined;
    activeView?: string | undefined;
    onTileClick?: (ticker: string) => void | undefined;
    onTileHover?: (ticker: string | null) => void | undefined;
    stockData?: StockData[] | undefined;
    onSelectTicker?: (ticker: string) => void | undefined;
    initialHeatmapData?: any[] | undefined;
}

export function HomeHeatmap({ wrapperClass, activeView, onTileClick, onTileHover, stockData, onSelectTicker, initialHeatmapData }: HomeHeatmapProps) {
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className="screen-heatmap-content flex flex-col h-full w-full">
                <div className="flex-1 w-full relative">
                    <HeatmapPreview
                        {...(activeView !== undefined ? { activeView } : {})}
                        {...(wrapperClass !== undefined ? { wrapperClass } : {})}
                        {...(onTileClick !== undefined ? { onTileClick } : {})}
                        {...(onTileHover !== undefined ? { onTileHover } : {})}
                        {...(stockData !== undefined ? { stockData } : {})}
                        {...(onSelectTicker !== undefined ? { onSelectTicker } : {})}
                        {...(initialHeatmapData !== undefined ? { initialHeatmapData } : {})}
                    />
                </div>
            </div>
        </SectionErrorBoundary>
    );
}
