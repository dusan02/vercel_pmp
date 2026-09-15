import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import WeeklyEarningsCalendar from '../WeeklyEarningsCalendar';
import { NextEarningsWidget } from './NextEarningsWidget';

interface HomeEarningsProps {
  initialData?: any;
  upcomingEarnings?: any[];
  weeklyEarningsGroups?: any[];
  eligibleTickers?: Set<string>;
  marketCapMap?: Map<string, number | null>;
}

export function HomeEarnings({ initialData, upcomingEarnings, weeklyEarningsGroups, eligibleTickers, marketCapMap }: HomeEarningsProps) {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <div className="bg-transparent mt-2">
                {upcomingEarnings && upcomingEarnings.length > 0 && (
                    <NextEarningsWidget earnings={upcomingEarnings} />
                )}
                <WeeklyEarningsCalendar
                    initialEarningsGroups={weeklyEarningsGroups ?? null}
                    eligibleTickers={eligibleTickers ?? new Set()}
                    marketCapMap={marketCapMap ?? new Map()}
                />
            </div>
        </SectionErrorBoundary>
    );
}
