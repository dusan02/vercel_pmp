import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import TodaysEarningsFinnhub from '../TodaysEarningsFinnhub';

export function HomeEarnings({ initialData }: { initialData?: any }) {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <TodaysEarningsFinnhub initialData={initialData} />
        </SectionErrorBoundary>
    );
}
