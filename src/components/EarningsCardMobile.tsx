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
    return formatBillions(value);
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
            {/* Row 1: Logo + Ticker + Company Name | % Change badge */}
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <CompanyLogo
                        ticker={earning.ticker}
                        size={28}
                        className="rounded-sm shrink-0"
                        priority={priority}
                    />
                    <div className="min-w-0 overflow-hidden">
                        <div className="flex items-baseline gap-1.5">
                            <span className="font-bold text-sm text-gray-900 dark:text-gray-100 tracking-tight">
                                {earning.ticker}
                            </span>
                            <span className="text-[10px] text-gray-400 truncate">
                                {getCompanyName(earning.ticker)}
                            </span>
                        </div>
                    </div>
                </div>
                {/* % Change badge */}
                <div className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-bold tabular-nums
                    ${isPositive
                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                    }`}
                >
                    {formatPercent(earning.percentChange)}
                </div>
            </div>

            {/* Row 2: EPS and Revenue side by side */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] tabular-nums">
                {/* EPS column */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">EPS</div>
                    <div className="flex items-center gap-1">
                        <span className="text-gray-500 dark:text-gray-400">Est</span>
                        <span className="text-gray-700 dark:text-gray-200">{formatEps(earning.epsEstimate)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-gray-500 dark:text-gray-400">Rep</span>
                        <span className={getBeatMissClass(earning.epsActual, earning.epsEstimate)}>
                            {formatEps(earning.epsActual)}
                        </span>
                    </div>
                </div>
                {/* Revenue column */}
                <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mb-0.5">Revenue</div>
                    <div className="flex items-center gap-1">
                        <span className="text-gray-500 dark:text-gray-400">Est</span>
                        <span className="text-gray-700 dark:text-gray-200">{formatRevenue(earning.revenueEstimate)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-gray-500 dark:text-gray-400">Rep</span>
                        <span className={getBeatMissClass(earning.revenueActual, earning.revenueEstimate)}>
                            {formatRevenue(earning.revenueActual)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
});

EarningsCardMobile.displayName = 'EarningsCardMobile';
