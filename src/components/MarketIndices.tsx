'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { MiniIntradayChart } from './MiniIntradayChart';

const INDICES = [
    { ticker: 'SPY', label: 'SPY' },
    { ticker: 'QQQ', label: 'QQQ' },
    { ticker: 'DIA', label: 'DIA' }
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

                // Fallback to Polygon intraday API if sessionPrice is empty
                const anyMissing = historyEntries.some(([, pts]) => pts.length === 0);
                let merged = historyEntries;
                if (anyMissing) {
                    try {
                        const polyRes = await fetch('/api/indices/intraday', { cache: 'no-store' });
                        if (polyRes.ok) {
                            const polyJson = await polyRes.json();
                            if (polyJson?.data) {
                                merged = historyEntries.map(([ticker, pts]) => {
                                    if (pts.length > 0) return [ticker, pts] as [string, { ts: string; price: number }[]];
                                    const fallback = (polyJson.data[ticker] as { ts: string; price: number }[]) ?? [];
                                    return [ticker, fallback] as [string, { ts: string; price: number }[]];
                                });
                            }
                        }
                    } catch (err) {
                        if (process.env.NODE_ENV === 'development') {
                            console.warn('Polygon intraday fallback error', err);
                        }
                    }
                }

                const histMap: Record<string, { ts: string; price: number }[]> = {};
                merged.forEach(([ticker, points]) => {
                    histMap[ticker] = [...points];
                });
                setHistory(histMap);
            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
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
        <div className="flex items-center gap-2 sm:gap-3">
            {INDICES.map(({ ticker, label }) => {
                const stock = data[ticker];
                const price = stock?.currentPrice;
                const change = stock?.percentChange;
                const isPositive = (change || 0) >= 0;

                return (
                    <div
                        key={ticker}
                        className="relative flex items-center gap-2.5 px-3 py-2 rounded-lg
                            bg-white/80 dark:bg-gray-800/60
                            backdrop-blur-sm
                            border border-gray-200/60 dark:border-gray-700/40
                            hover:border-gray-300 dark:hover:border-gray-600
                            transition-all duration-200 cursor-default
                            min-w-[150px] sm:min-w-[175px]"
                        title={`${label}`}
                    >
                        {/* Sparkline as background */}
                        <div className="absolute inset-0 overflow-hidden rounded-lg opacity-60 pointer-events-none flex items-end">
                            {history[ticker]?.length ? (
                                <MiniIntradayChart
                                    points={history[ticker]!}
                                    width={175}
                                    height={40}
                                    positive={isPositive}
                                />
                            ) : null}
                        </div>

                        {/* Content */}
                        <div className="relative z-10 flex items-center gap-2.5 w-full">
                            {/* Ticker badge */}
                            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold tracking-wide
                                ${isPositive
                                    ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-red-100/80 dark:bg-red-900/40 text-red-700 dark:text-red-300'
                                }`}>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d={isPositive ? 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6' : 'M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6'} />
                                </svg>
                                {label}
                            </div>

                            {/* Price + Change */}
                            <div className="flex flex-col items-end ml-auto">
                                {loading && !stock ? (
                                    <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 block rounded" />
                                ) : (
                                    <>
                                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono leading-tight tabular-nums">
                                            ${formatPrice(price)}
                                        </span>
                                        <span className={`text-[11px] font-bold leading-tight tabular-nums
                                            ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                                            {isPositive ? '+' : ''}{formatPercent(change)}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
