import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import WeeklyEarningsCalendar from '../WeeklyEarningsCalendar';

export function HomeEarnings({ initialData }: { initialData?: any }) {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <div className="bg-transparent mt-2">
                <WeeklyEarningsCalendar />
            </div>
        </SectionErrorBoundary>
    );
}
