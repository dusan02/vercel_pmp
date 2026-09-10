import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { MoversSection } from '../MoversSection';

export function HomeMovers({ onTileClick, initialData }: { onTileClick?: (ticker: string) => void; initialData?: any[] | undefined }) {
    return (
        <SectionErrorBoundary sectionName="Movers">
            <MoversSection {...(onTileClick !== undefined ? { onTileClick } : {})} {...(initialData !== undefined ? { initialData } : {})} />
        </SectionErrorBoundary>
    );
}
