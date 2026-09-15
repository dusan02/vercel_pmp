import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import WeeklyEarningsCalendar from '../WeeklyEarningsCalendar';
import { NextEarningsWidget } from './NextEarningsWidget';

interface HomeEarningsProps {
  initialData?: any;
  upcomingEarnings?: any[];
  weeklyEarningsGroups?: any[];
  eligibleTickers?: Set<string>;
}

export function HomeEarnings({ initialData, upcomingEarnings, weeklyEarningsGroups, eligibleTickers }: HomeEarningsProps) {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <div className="bg-transparent mt-2">
                {upcomingEarnings && upcomingEarnings.length > 0 && (
                    <NextEarningsWidget earnings={upcomingEarnings} />
                )}
                <WeeklyEarningsCalendar
                    initialEarningsGroups={weeklyEarningsGroups ?? null}
                    eligibleTickers={eligibleTickers ?? new Set()}
                />
            </div>
        </SectionErrorBoundary>
    );
}
