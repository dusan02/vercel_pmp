'use client';

import React, { memo } from 'react';
import { formatBillions, formatPercent } from '@/lib/utils/format';
import { getCompanyName } from '@/lib/companyNames';
import CompanyLogo from './CompanyLogo';

interface EarningsData {
    ticker: string;
    companyName: string;
    marketCap: number | null;
    epsEstimate: number | null;
    epsActual: number | null;
    revenueEstimate: number | null;
    revenueActual: number | null;
    epsSurprisePercent: number | null;
    revenueSurprisePercent: number | null;
    percentChange: number | null;
    marketCapDiff: number | null;
    time: string;
    date: string;
    logoUrl?: string;
    currentPrice?: number;
}

interface EarningsCardMobileProps {
    earning: EarningsData;
    priority?: boolean;
}

const formatEps = (value: number | null): string => {
    if (value === null || value === undefined) return '—';
    return `$${value.toFixed(2)}`;
};

const formatRevenue = (value: number | null): string => {
    if (value === null || value === undefined) return '—';
    // Value is raw number (e.g. 192,000,000,000), formatBillions expects Billions (e.g. 192)
    return formatBillions(value / 1_000_000_000);
};

const getBeatMissClass = (actual: number | null, estimate: number | null): string => {
    if (actual === null || estimate === null) return 'text-gray-600 dark:text-gray-300';
    return actual >= estimate
        ? 'text-green-600 dark:text-green-400 font-semibold'
        : 'text-red-600 dark:text-red-400 font-semibold';
};

export const EarningsCardMobile = memo(({ earning, priority = false }: EarningsCardMobileProps) => {
    const isPositive = (earning.percentChange ?? 0) >= 0;

    return (
        <div
            className="px-3 py-3 active:bg-gray-50 dark:active:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0"
            role="row"
            style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation'
            }}
        >
            <div className="flex items-center w-full">
                {/* 1. Ticker Column (w-24) - Matching header width */}
                <div className="w-24 shrink-0 pr-2 flex items-center gap-2">
                    <CompanyLogo
                        ticker={earning.ticker}
                        size={32}
                        className="rounded-sm shrink-0"
                        priority={priority}
                    />
                    <div className="min-w-0 overflow-hidden">
                        <div className="font-bold text-sm text-gray-900 dark:text-gray-100 tracking-tight leading-tight">
                            {earning.ticker}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate leading-tight">
                            {earning.companyName || getCompanyName(earning.ticker)}
                        </div>
                    </div>
                </div>

                {/* Empty Spacer to push values to the right */}
                <div className="flex-1" />

                {/* 2. EPS Column (Fixed Width 48px = w-12) */}
                <div className="w-12 shrink-0 flex flex-col items-end justify-center text-[10px] tabular-nums leading-tight">
                    <span className="text-gray-500 dark:text-gray-400">{formatEps(earning.epsEstimate)}</span>
                    <span className={getBeatMissClass(earning.epsActual, earning.epsEstimate)}>
                        {formatEps(earning.epsActual)}
                    </span>
                </div>

                {/* 3. Revenue Column (Fixed Width 56px = w-14) */}
                <div className="w-14 shrink-0 flex flex-col items-end justify-center text-[10px] tabular-nums leading-tight">
                    <span className="text-gray-500 dark:text-gray-400">{formatRevenue(earning.revenueEstimate)}</span>
                    <span className={getBeatMissClass(earning.revenueActual, earning.revenueEstimate)}>
                        {formatRevenue(earning.revenueActual)}
                    </span>
                </div>

                {/* 4. % Change Column (Fixed Width 56px = w-14) */}
                <div className="w-14 shrink-0 flex justify-end">
                    <div className={`px-1.5 py-0.5 rounded text-[11px] font-bold tabular-nums text-right
                        ${isPositive
                            ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                            : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        }`}
                    >
                        {formatPercent(earning.percentChange)}
                    </div>
                </div>
            </div>
        </div>
    );
});

EarningsCardMobile.displayName = 'EarningsCardMobile';
