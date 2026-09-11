import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import WeeklyEarningsCalendar from '../WeeklyEarningsCalendar';
import { NextEarningsWidget } from './NextEarningsWidget';

export function HomeEarnings({ initialData, upcomingEarnings }: { initialData?: any; upcomingEarnings?: any[] }) {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <div className="bg-transparent mt-2">
                {upcomingEarnings && upcomingEarnings.length > 0 && (
                    <NextEarningsWidget earnings={upcomingEarnings} />
                )}
                <WeeklyEarningsCalendar />
            </div>
        </SectionErrorBoundary>
    );
}
