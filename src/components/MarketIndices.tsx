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
            // Abort previous request if still pending
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
                // Silently handle abort errors
                if (err.name === 'AbortError' || err.message?.includes('aborted')) {
                    return;
                }

                // Handle network errors gracefully - don't log to console in production
                const isNetworkError = err.message?.includes('Failed to fetch') ||
                    err.message?.includes('NetworkError') ||
                    !err.message;

                if (isNetworkError) {
                    // Only log in development mode
                    if (process.env.NODE_ENV === 'development') {
                        logger.warn('MarketIndices: Network error - server may be unavailable');
                    }
                } else {
                    // Only log unexpected errors in development
                    if (process.env.NODE_ENV === 'development') {
                        logger.error('MarketIndices: Failed to fetch indices', err, { tickers });
                    }
                }
                // Keep existing data if available, don't clear on error
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        // Auto-refresh every minute
        const interval = setInterval(fetchIndices, 60000);
        return () => {
            clearInterval(interval);
            if (abortController) {
                abortController.abort();
            }
        };
    }, []);

    return (
        <div className="flex items-center">
            <div className="flex items-center gap-1.5 sm:gap-6 w-full justify-start sm:justify-center px-1 lg:px-0">
                <div className="flex gap-1.5 sm:gap-3 flex-nowrap">
                    {INDICES.map(({ ticker, name }) => {
                        const stock = data[ticker];
                        const price = stock?.currentPrice;
                        const change = stock?.percentChange;
                        // Default to positive (green) if 0 or unknown, similar to placeholder style
                        const isPositive = (change || 0) >= 0;

                        return (
                            <div key={ticker} className="flex flex-col bg-[var(--clr-bg)] border border-[var(--clr-border-subtle)] rounded-md px-2 sm:px-3 py-1.5 min-w-[80px] sm:min-w-[100px] transition-all duration-200 cursor-default relative overflow-hidden hover:border-blue-500/40 hover:bg-[var(--clr-bg-hover)] animate-in fade-in duration-500" title={`${name} (${ticker})`}>
                                <div className="flex items-center gap-1.5 mb-1">
                                    <CompanyLogo ticker={ticker} size={16} className="rounded-sm" />
                                    <span className="text-[0.6875rem] sm:text-xs font-bold text-[var(--clr-text)] m-0 tracking-wide">{ticker}</span>
                                </div>
                                <div className="mt-1">
                                    <div className="text-[0.8125rem] sm:text-[0.9375rem] font-extrabold text-[var(--clr-text)] font-mono my-0.5 sm:my-1 leading-tight tracking-tight">
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-6 w-24 block rounded"></span>
                                        ) : (
                                            `$${formatPrice(price)}`
                                        )}
                                    </div>
                                    <div className={`flex items-center gap-1 text-[0.6875rem] sm:text-[0.8125rem] font-bold tracking-wide mt-0.5 ${isPositive ? 'text-[var(--clr-positive)]' : 'text-[var(--clr-negative)]'}`}>
                                        {isPositive ? (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="18 15 12 9 6 15" />
                                            </svg>
                                        ) : (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="6 9 12 15 18 9" />
                                            </svg>
                                        )}
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 block rounded mt-1"></span>
                                        ) : (
                                            <span>{formatPercent(change)}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
