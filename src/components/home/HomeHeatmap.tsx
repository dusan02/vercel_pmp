import React from 'react';
import dynamic from 'next/dynamic';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { HeatmapSkeleton } from '../SectionSkeleton';
import { StockData } from '@/lib/types';

// CRITICAL: Heatmap je prvá obrazovka na mobile - prioritizuj načítanie
const HeatmapPreview = dynamic(
    () => import('../HeatmapPreview').then((mod) => mod.HeatmapPreview),
    {
        ssr: false,
        loading: () => <HeatmapSkeleton />,
    }
);

interface HomeHeatmapProps {
    wrapperClass?: string;
    activeView?: string | undefined;
    onTileClick?: (ticker: string) => void;
    stockData?: StockData[];
    onSelectTicker?: (ticker: string) => void;
}

export function HomeHeatmap({ wrapperClass, activeView, onTileClick, stockData, onSelectTicker }: HomeHeatmapProps) {
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className="screen-heatmap-content flex flex-col h-full w-full">
                <div className="flex-1 w-full relative">
                    <HeatmapPreview
                        {...(activeView !== undefined ? { activeView } : {})}
                        {...(wrapperClass !== undefined ? { wrapperClass } : {})}
                        {...(onTileClick !== undefined ? { onTileClick } : {})}
                        {...(stockData !== undefined ? { stockData } : {})}
                        {...(onSelectTicker !== undefined ? { onSelectTicker } : {})}
                    />
                </div>
            </div>
        </SectionErrorBoundary>
    );
}
