'use client';

import React, { memo } from 'react';
import { formatBillions, formatPercent } from '@/lib/utils/format';
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
}

interface EarningsCardMobileProps {
    earning: EarningsData;
    priority?: boolean;
}

export const EarningsCardMobile = memo(({ earning, priority = false }: EarningsCardMobileProps) => {
    const isPositive = (earning.percentChange ?? 0) >= 0;
    const capDiffIsPositive = (earning.marketCapDiff ?? 0) >= 0;

    const formatMarketCapDiff = (value: number | null): string => {
        if (value === null) return '-';
        // Format: +1.2B or -500M
        const absVal = Math.abs(value);
        const sign = value >= 0 ? '+' : '-';

        if (absVal >= 1000000000) {
            return `${sign}${(absVal / 1000000000).toFixed(1)}B`;
        }
        if (absVal >= 1000000) {
            return `${sign}${(absVal / 1000000).toFixed(0)}M`;
        }
        return `${sign}${absVal.toFixed(0)}`;
    };

    return (
        <div
            className="px-3 py-2 active:bg-gray-50 dark:active:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 last:border-0"
            role="row"
            style={{
                WebkitTapHighlightColor: 'transparent',
                touchAction: 'manipulation'
            }}
        >
            {/* Grid matching other mobile cards (No Logo) */}
            <div className="grid items-center gap-x-2 min-w-0 [grid-template-columns:minmax(56px,1fr)_72px_72px_56px]">
                {/* Ticker */}
                <div className="min-w-0 flex items-center gap-2 text-left">
                    <CompanyLogo ticker={earning.ticker} {...(earning.logoUrl ? { logoUrl: earning.logoUrl } : {})} size={28} className="rounded-sm shrink-0" />
                    <div className="min-w-0 overflow-hidden">
                        <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100 tracking-tight truncate">
                            {earning.ticker}
                        </h3>
                        <div className="text-[10px] text-gray-500 truncate">
                            {getCompanyName(earning.ticker)}
                        </div>
                    </div>
                </div>

                {/* Market Cap */}
                <div className="text-center">
                    <div className="font-mono font-semibold text-gray-900 dark:text-gray-100 text-sm tabular-nums">
                        {earning.marketCap !== null ? formatBillions(earning.marketCap) : '-'}
                    </div>
                </div>

                {/* % Change */}
                <div className={`text-xs font-semibold text-center tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {formatPercent(earning.percentChange)}
                </div>

                {/* Cap Diff */}
                <div className={`text-xs font-semibold text-center tabular-nums ${capDiffIsPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {formatMarketCapDiff(earning.marketCapDiff)}
                </div>
            </div>
        </div>
    );
});

EarningsCardMobile.displayName = 'EarningsCardMobile';
