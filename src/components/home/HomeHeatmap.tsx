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
}

export function HomeHeatmap({ wrapperClass }: HomeHeatmapProps) {
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className={`${wrapperClass} w-full min-h-[600px]`}>
                <HeatmapPreview />
            </div>
        </SectionErrorBoundary>
    );
}
