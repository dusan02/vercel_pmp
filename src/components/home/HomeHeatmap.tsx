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
    React.useEffect(() => {
        console.log('🏠 HomeHeatmap rendered', { wrapperClass });
    }, [wrapperClass]);

    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <div className={`${wrapperClass} w-full h-full`} data-debug="home-heatmap-wrapper">
                <HeatmapPreview />
            </div>
        </SectionErrorBoundary>
    );
}
