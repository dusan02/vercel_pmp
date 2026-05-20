'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { MiniIntradayChart } from './MiniIntradayChart';

const INDICES = [
    { ticker: 'SPY', label: 'SPY' },
    { ticker: 'QQQ', label: 'QQQ' },
    { ticker: 'DIA', label: 'DIA' },
];

export function MarketIndices() {
    const [data, setData]       = useState<Record<string, StockData>>({});
    const [history, setHistory] = useState<Record<string, { ts: string; price: number }[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let abortController: AbortController | null = null;

        const fetchIndices = async () => {
            if (abortController) abortController.abort();
            abortController = new AbortController();
            const tickers = INDICES.map(i => i.ticker).join(',');

            try {
                // ── Quotes ──────────────────────────────────────────────────
                const res = await fetch(`/api/stocks?tickers=${tickers}`, {
                    signal: abortController.signal,
                    cache: 'no-store',
                });
                if (!res.ok) throw new Error(`API ${res.status}`);
                const json = await res.json();
                if (json.data && Array.isArray(json.data)) {
                    const map: Record<string, StockData> = {};
                    json.data.forEach((s: StockData) => { map[s.ticker] = s; });
                    setData(map);
                }

                // ── Intraday history ─────────────────────────────────────────
                const histEntries = await Promise.all(
                    INDICES.map(async ({ ticker }) => {
                        try {
                            const hRes = await fetch(`/api/history?ticker=${ticker}&limit=180`, {
                                signal: abortController?.signal ?? null,
                                cache: 'no-store',
                            });
                            if (!hRes.ok) throw new Error(`history ${hRes.status}`);
                            const hJson = await hRes.json();
                            const pts = Array.isArray(hJson.data)
                                ? (hJson.data as { timestamp: string; price: number }[])
                                    .filter(p => p.price)
                                    .map(p => ({ ts: p.timestamp, price: p.price }))
                                    .reverse()
                                : [];
                            return [ticker, pts] as const;
                        } catch {
                            return [ticker, []] as const;
                        }
                    })
                );

                // ── Polygon fallback ─────────────────────────────────────────
                const anyMissing = histEntries.some(([, pts]) => pts.length === 0);
                let merged = histEntries;
                if (anyMissing) {
                    try {
                        const polyRes = await fetch('/api/indices/intraday', { cache: 'no-store' });
                        if (polyRes.ok) {
                            const polyJson = await polyRes.json();
                            if (polyJson?.data) {
                                merged = histEntries.map(([t, pts]) => {
                                    if (pts.length > 0) return [t, pts] as [string, { ts: string; price: number }[]];
                                    return [t, (polyJson.data[t] ?? [])] as [string, { ts: string; price: number }[]];
                                });
                            }
                        }
                    } catch { /* silent */ }
                }

                const histMap: Record<string, { ts: string; price: number }[]> = {};
                merged.forEach(([t, pts]) => { histMap[t] = [...pts]; });
                setHistory(histMap);

            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        const interval = setInterval(fetchIndices, 60_000);
        return () => {
            clearInterval(interval);
            abortController?.abort();
        };
    }, []);

    return (
        <div className="flex items-center gap-2 sm:gap-3">
            {INDICES.map(({ ticker, label }) => {
                const stock      = data[ticker];
                const price      = stock?.currentPrice;
                const change     = stock?.percentChange;
                const isPositive = (change ?? 0) >= 0;
                const pts        = history[ticker] ?? [];

                return (
                    <div
                        key={ticker}
                        className="flex flex-col gap-0.5
                            bg-white/80 dark:bg-gray-800/60
                            backdrop-blur-sm
                            border border-gray-200/60 dark:border-gray-700/40
                            hover:border-gray-300 dark:hover:border-gray-600
                            rounded-lg px-2.5 pt-1.5 pb-1.5
                            min-w-[130px] sm:min-w-[155px]
                            transition-all duration-200 cursor-default"
                        title={label}
                    >
                        {/* ── Row 1: label left · % change right ── */}
                        <div className="flex items-center justify-between">
                            <span className={`
                                text-[11px] font-bold tracking-wide px-1.5 py-0.5 rounded
                                ${isPositive
                                    ? 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-red-100/80 dark:bg-red-900/40 text-red-700 dark:text-red-300'}
                            `}>
                                {label}
                            </span>

                            {loading && !stock ? (
                                <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 w-10 rounded" />
                            ) : (
                                <span className={`text-[11px] font-bold tabular-nums
                                    ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                                >
                                    {isPositive ? '+' : ''}{formatPercent(change)}
                                </span>
                            )}
                        </div>

                        {/* ── Row 2: sparkline — full card width ── */}
                        <div className="w-full" style={{ height: 40 }}>
                            {pts.length > 0 ? (
                                <MiniIntradayChart
                                    points={pts}
                                    width={148}
                                    height={40}
                                    positive={isPositive}
                                />
                            ) : (
                                <div className="w-full h-full rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
                            )}
                        </div>

                        {/* ── Row 3: price ── */}
                        {loading && !stock ? (
                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-16 rounded" />
                        ) : (
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 font-mono tabular-nums leading-tight">
                                ${formatPrice(price)}
                            </span>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
