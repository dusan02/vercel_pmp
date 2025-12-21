'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { logger } from '@/lib/utils/logger';

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
                
                // Handle network errors gracefully
                const isNetworkError = err.message?.includes('Failed to fetch') || 
                                      err.message?.includes('NetworkError') ||
                                      !err.message;
                
                if (isNetworkError) {
                    logger.warn('MarketIndices: Network error - server may be unavailable');
                } else {
                    logger.error('MarketIndices: Failed to fetch indices', err, { tickers });
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
        <div className="market-indicators-section">
            <div className="market-indicators-container">
                <div className="market-indicators">
                    {INDICES.map(({ ticker, name }) => {
                        const stock = data[ticker];
                        const price = stock?.currentPrice;
                        const change = stock?.percentChange;
                        // Default to positive (green) if 0 or unknown, similar to placeholder style
                        const isPositive = (change || 0) >= 0;

                        return (
                            <div key={ticker} className="market-indicator animate-in fade-in duration-500" title={`${name} (${ticker})`}>
                                <span className="indicator-name">{ticker}</span>
                                <div className="indicator-values">
                                    <div className="indicator-price">
                                        {loading && !stock ? (
                                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-6 w-24 block rounded"></span>
                                        ) : (
                                            `$${formatPrice(price)}`
                                        )}
                                    </div>
                                    <div className={`indicator-change ${isPositive ? 'positive' : 'negative'}`}>
                                        {isPositive ? (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="18 15 12 9 6 15"/>
                                            </svg>
                                        ) : (
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <polyline points="6 9 12 15 18 9"/>
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
