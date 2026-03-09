import React from 'react';
import dynamic from 'next/dynamic';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { HeatmapSkeleton } from '../SectionSkeleton';

// CRITICAL: Heatmap je prvá obrazovka na mobile - prioritizuj načítanie
// Note: Dynamic import sa načíta okamžite keď je komponent renderovaný
const HeatmapPreview = dynamic(
    () => import('../HeatmapPreview').then((mod) => mod.HeatmapPreview),
    {
        ssr: false,
        loading: () => <HeatmapSkeleton />,
    }
);

interface HomeHeatmapProps {
    wrapperClass?: string;
    activeView?: string | undefined; // Signalizuje, či je heatmap aktívny view
    onTileClick?: (ticker: string) => void;
}

export function HomeHeatmap({ wrapperClass, activeView, onTileClick }: HomeHeatmapProps) {
    // CRITICAL: Add explicit content wrapper for proper flex chain
    // This ensures containerRef gets correct height from position: fixed parent
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className="screen-heatmap-content flex flex-col h-full w-full">
                <div className="flex-1 w-full relative">
                    <HeatmapPreview
                        {...(activeView !== undefined ? { activeView } : {})}
                        {...(wrapperClass !== undefined ? { wrapperClass } : {})}
                        {...(onTileClick !== undefined ? { onTileClick } : {})}
                    />
                </div>
            </div>
        </SectionErrorBoundary>
    );
}
