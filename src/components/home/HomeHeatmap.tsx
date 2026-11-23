import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { HeatmapPreview } from '../HeatmapPreview';

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
