'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { logger } from '@/lib/utils/logger';
import CompanyLogo from './CompanyLogo';

const INDICES = [
    { ticker: 'SPY', name: 'S&P 500' },
    { ticker: 'QQQ', name: 'NASDAQ' },
    { ticker: 'DIA', name: 'DOW' }
];

export function MarketIndices() {
    const [data, setData] = useState<Record<string, StockData>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let abortController: AbortController | null = null;

        const fetchIndices = async () => {
            if (abortController) {
                abortController.abort();
            }
            abortController = new AbortController();

            const tickers = INDICES.map(i => i.ticker).join(',');

            try {
                const res = await fetch(`/api/stocks?tickers=${tickers}`, {
                    signal: abortController.signal,
                    cache: 'no-store',
                });

                if (!res.ok) {
                    throw new Error(`API returned ${res.status}: ${res.statusText}`);
                }

                const json = await res.json();
                if (json.data && Array.isArray(json.data)) {
                    const map: Record<string, StockData> = {};
                    json.data.forEach((stock: StockData) => {
                        map[stock.ticker] = stock;
                    });
                    setData(map);
                }
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
                // Silent error handling in production
                if (process.env.NODE_ENV === 'development') {
                    console.warn('MarketIndices fetch error:', err);
                }
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        const interval = setInterval(fetchIndices, 60000);
        return () => {
            clearInterval(interval);
            if (abortController) (abortController as AbortController).abort();
        };
    }, []);

    return (
        <div className="flex items-center">
            <div className="flex items-center gap-3 w-full justify-start sm:justify-center px-1 lg:px-0">
                {INDICES.map(({ ticker, name }) => {
                    const stock = data[ticker];
                    const price = stock?.currentPrice;
                    const change = stock?.percentChange;
                    const isPositive = (change || 0) >= 0;

                    return (
                        <div
                            key={ticker}
                            className="group flex flex-col justify-between
                                bg-gray-50 dark:bg-white/5 
                                hover:bg-white dark:hover:bg-white/10
                                rounded-xl 
                                px-4 py-2.5 
                                min-w-[110px] sm:min-w-[130px] 
                                transition-all duration-300 ease-out
                                cursor-default 
                                relative overflow-hidden
                                shadow-sm hover:shadow-md
                                border border-transparent hover:border-gray-100 dark:hover:border-white/10"
                            title={`${name} (${ticker})`}
                        >
                            {/* Header: Logo + Ticker */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <CompanyLogo ticker={ticker} size={20} className="rounded-md" />
                                    <span className="text-sm font-bold text-[var(--clr-text)] tracking-tight">{ticker}</span>
                                </div>
                                {/* Placeholder for sparkline or mini-indicator */}
                            </div>

                            {/* Price Section */}
                            <div className="flex flex-col items-start gap-0.5">
                                <span className="text-lg font-bold text-[var(--clr-text)] font-mono leading-none tracking-tight">
                                    {loading && !stock ? (
                                        <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-5 w-20 block rounded"></span>
                                    ) : (
                                        `$${formatPrice(price)}`
                                    )}
                                </span>

                                <span className={`flex items-center gap-1 text-xs font-bold leading-none
                                    ${isPositive ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}
                                >
                                    {loading && !stock ? (
                                        <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 w-12 block rounded mt-1"></span>
                                    ) : (
                                        <>
                                            <span>{isPositive ? '+' : ''}{formatPercent(change)}</span>
                                        </>
                                    )}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
