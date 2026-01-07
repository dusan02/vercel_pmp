import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import TodaysEarningsFinnhub from '../TodaysEarningsFinnhub';

export function HomeEarnings() {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <TodaysEarningsFinnhub />
        </SectionErrorBoundary>
    );
}
