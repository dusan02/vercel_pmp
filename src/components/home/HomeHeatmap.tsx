import React from 'react';
import dynamic from 'next/dynamic';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { HeatmapSkeleton } from '../SectionSkeleton';

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
    /** Controlled metric — lifted to HomePage so the chips live in the header */
    metric?: import('@/lib/heatmap/types').HeatmapMetric | undefined;
    onMetricChange?: ((metric: import('@/lib/heatmap/types').HeatmapMetric) => void) | undefined;
    initialHeatmapData?: any[] | undefined;
}

export function HomeHeatmap({ wrapperClass, activeView, onTileClick, onTileHover, metric, onMetricChange, initialHeatmapData }: HomeHeatmapProps) {
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className="screen-heatmap-content flex flex-col h-full w-full">
                <div className="flex-1 w-full relative">
                    <HeatmapPreview
                        {...(activeView !== undefined ? { activeView } : {})}
                        {...(wrapperClass !== undefined ? { wrapperClass } : {})}
                        {...(onTileClick !== undefined ? { onTileClick } : {})}
                        {...(onTileHover !== undefined ? { onTileHover } : {})}
                        {...(metric !== undefined ? { metric } : {})}
                        {...(onMetricChange !== undefined ? { onMetricChange } : {})}
                        {...(initialHeatmapData !== undefined ? { initialHeatmapData } : {})}
                    />
                </div>
            </div>
        </SectionErrorBoundary>
    );
}
