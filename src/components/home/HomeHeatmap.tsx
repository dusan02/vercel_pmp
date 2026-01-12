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
}

export function HomeHeatmap({ wrapperClass, activeView }: HomeHeatmapProps) {
    React.useEffect(() => {
        console.log('🏠 HomeHeatmap rendered', { wrapperClass, activeView });
    }, [wrapperClass, activeView]);

    // Simplified: pass wrapperClass directly to HeatmapPreview, remove unnecessary wrapper div
    return (
        <SectionErrorBoundary sectionName="Heatmap">
            <HeatmapPreview 
                {...(activeView !== undefined ? { activeView } : {})}
                {...(wrapperClass !== undefined ? { wrapperClass } : {})}
            />
        </SectionErrorBoundary>
    );
}
