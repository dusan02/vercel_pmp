import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { MoversSection } from '../MoversSection';

export function HomeMovers({ onTileClick }: { onTileClick?: (ticker: string) => void }) {
    return (
        <SectionErrorBoundary sectionName="Movers">
            <MoversSection {...(onTileClick !== undefined ? { onTileClick } : {})} />
        </SectionErrorBoundary>
    );
}
