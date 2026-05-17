'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { logger } from '@/lib/utils/logger';
import { TrendingUp } from 'lucide-react';
import { MiniIntradayChart } from './MiniIntradayChart';


const INDICES = [
    { ticker: 'SPY', name: 'S&P 500' },
    { ticker: 'QQQ', name: 'NASDAQ' },
    { ticker: 'DIA', name: 'DOW' }
];

export function MarketIndices() {
    const [data, setData] = useState<Record<string, StockData>>({});
    const [history, setHistory] = useState<Record<string, { ts: string; price: number }[]>>({});
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
                // Fetch quotes
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

                // Fetch intraday history (sessionPrice) for sparklines
                const historyEntries = await Promise.all(
                    INDICES.map(async ({ ticker }) => {
                        try {
                            const hRes = await fetch(`/api/history?ticker=${ticker}&limit=180`, {
                                signal: abortController?.signal ?? null,
                                cache: 'no-store',
                            });
                            if (!hRes.ok) throw new Error(`history ${hRes.status}`);
                            const hJson = await hRes.json();
                            const points = Array.isArray(hJson.data)
                                ? (hJson.data as { timestamp: string; price: number }[])
                                    .filter(p => p.price)
                                    .map(p => ({ ts: p.timestamp, price: p.price }))
                                    .reverse() // API returns desc; sparkline needs asc
                                : [];
                            return [ticker, points] as const;
                        } catch (err) {
                            if (process.env.NODE_ENV === 'development') {
                                console.warn('History fetch error', ticker, err);
                            }
                            return [ticker, []] as const;
                        }
                    })
                );

                const histMap: Record<string, { ts: string; price: number }[]> = {};
                historyEntries.forEach(([ticker, points]) => {
                    histMap[ticker] = [...points];
                });
                setHistory(histMap);
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
                                    <div className="p-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                        <TrendingUp size={16} />
                                    </div>
                                    <span className="text-sm font-bold text-[var(--clr-text)] tracking-tight">{ticker}</span>
                                </div>
                                <div className="w-24 h-12 hidden sm:block">
                                    {history[ticker]?.length ? (
                                        <MiniIntradayChart points={history[ticker]!} width={96} height={48} />
                                    ) : (
                                        <div className="w-full h-full bg-gray-100 dark:bg-white/5 rounded-md animate-pulse" />
                                    )}
                                </div>
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
