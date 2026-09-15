import React from 'react';
import { SectionErrorBoundary } from '../SectionErrorBoundary';
import WeeklyEarningsCalendar from '../WeeklyEarningsCalendar';
import type { EarningsWeekDay } from '@/lib/seo/earningsSSR';

interface HomeEarningsProps {
  weeklyEarningsData?: Record<string, EarningsWeekDay> | undefined;
  todayStr: string;
  weekStartStr: string;
  eligibleTickers?: Set<string>;
}

export function HomeEarnings({ weeklyEarningsData, todayStr, weekStartStr, eligibleTickers }: HomeEarningsProps) {
    return (
        <SectionErrorBoundary sectionName="Earnings">
            <div className="bg-transparent mt-2">
                <WeeklyEarningsCalendar
                    initialWeekData={weeklyEarningsData ?? null}
                    todayStr={todayStr}
                    initialWeekStartStr={weekStartStr}
                    eligibleTickers={eligibleTickers ?? new Set()}
                />
            </div>
        </SectionErrorBoundary>
    );
}
