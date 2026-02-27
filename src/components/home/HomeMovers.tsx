import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import { MoversSection } from '../MoversSection';

export function HomeMovers() {
    return (
        <SectionErrorBoundary sectionName="Movers">
            <MoversSection />
        </SectionErrorBoundary>
    );
}
