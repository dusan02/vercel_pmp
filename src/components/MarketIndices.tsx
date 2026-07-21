'use client';

import React, { useEffect, useState } from 'react';
import { StockData } from '@/lib/types';
import { formatPrice, formatPercent } from '@/lib/utils/format';
import { MiniIntradayChart } from './MiniIntradayChart';

// SPY & QQQ are ETFs fetched from Polygon via /api/stocks
// DJIA is the actual Dow Jones Industrial Average index fetched from Yahoo Finance
const ETF_INDICES = [
    { ticker: 'SPY', label: 'SPY' },
    { ticker: 'QQQ', label: 'QQQ' },
];

interface DjiaData {
    price: number;
    previousClose: number;
    dollarChange: number;
    percentChange: number;
    intraday: { ts: string; price: number }[];
}

export function MarketIndices() {
    const [data, setData]       = useState<Record<string, StockData>>({});
    const [history, setHistory] = useState<Record<string, { ts: string; price: number }[]>>({});
    const [djia, setDjia]       = useState<DjiaData | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let abortController: AbortController | null = null;

        const fetchIndices = async () => {
            if (abortController) abortController.abort();
            abortController = new AbortController();
            const tickers = ETF_INDICES.map(i => i.ticker).join(',');

            try {
                // ── ETF Quotes (SPY, QQQ) from Polygon via /api/stocks ──
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

                // ── Intraday from Polygon (SPY, QQQ 5-min bars) ──
                try {
                    const polyRes = await fetch('/api/indices/intraday', {
                        signal: abortController?.signal ?? null,
                        cache: 'no-store',
                    });
                    if (polyRes.ok) {
                        const polyJson = await polyRes.json();
                        if (polyJson?.data) {
                            const histMap: Record<string, { ts: string; price: number }[]> = {};
                            ETF_INDICES.forEach(({ ticker }) => {
                                histMap[ticker] = polyJson.data[ticker] ?? [];
                            });
                            setHistory(histMap);
                        }
                    }
                } catch { /* silent — chart stays empty, quotes still show */ }

                // ── DJIA index from Yahoo Finance ──
                try {
                    const djiaRes = await fetch('/api/indices/djia', {
                        signal: abortController?.signal ?? null,
                        cache: 'no-store',
                    });
                    if (djiaRes.ok) {
                        const djiaJson = await djiaRes.json();
                        if (djiaJson?.price) {
                            setDjia(djiaJson);
                        }
                    }
                } catch { /* silent */ }

            } catch (err: any) {
                if (err.name === 'AbortError' || err.message?.includes('aborted')) return;
            } finally {
                setLoading(false);
            }
        };

        fetchIndices();
        const interval = setInterval(fetchIndices, 5 * 60_000);
        return () => {
            clearInterval(interval);
            abortController?.abort();
        };
    }, []);

    type CardProps = {
        label: string;
        price: number | null;
        dollarChg: number | null;
        percentChg: number | null;
        pts: { ts: string; price: number }[];
        isIndex?: boolean;
    };

    const renderCard = ({ label, price, dollarChg, percentChg, pts, isIndex }: CardProps) => {
        const isPositive = (percentChg ?? 0) >= 0;
        const hasData = price != null && price > 0;

        return (
            <div
                key={label}
                className={`
                    flex-1 flex flex-col gap-1
                    bg-white dark:bg-gray-900
                    border border-gray-200 dark:border-gray-700
                    border-l-[3px]
                    ${isPositive
                        ? 'border-l-emerald-500'
                        : 'border-l-red-500'}
                    rounded-lg px-3 pt-2 pb-2
                    transition-all duration-200 cursor-default
                    hover:shadow-sm
                `}
                title={label}
            >
                {/* ── Row 1: label · % change · $ change ── */}
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold tracking-widest uppercase text-gray-500 dark:text-gray-400">
                        {label}
                    </span>

                    <div className="flex items-center gap-1.5">
                        {loading && !hasData ? (
                            <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-3 w-12 rounded" />
                        ) : (
                            <>
                                {dollarChg !== null && (
                                    <span className={`text-[11px] font-medium tabular-nums hidden sm:inline
                                        ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                                        {isPositive ? '+' : ''}{dollarChg.toFixed(isIndex ? 0 : 2)}
                                    </span>
                                )}
                                <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded
                                    ${isPositive
                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400'}`}>
                                        {formatPercent(percentChg)}
                                </span>
                            </>
                        )}
                    </div>
                </div>

                {/* ── Row 2: sparkline ── */}
                <div className="w-full" style={{ height: 56 }}>
                    {pts.length > 0 ? (
                        <MiniIntradayChart
                            points={pts}
                            height={56}
                            positive={isPositive}
                        />
                    ) : (
                        <div className="w-full h-full rounded bg-gray-100 dark:bg-white/5 animate-pulse" />
                    )}
                </div>

                {/* ── Row 3: price ── */}
                {loading && !hasData ? (
                    <span className="animate-pulse bg-gray-200 dark:bg-gray-700 h-5 w-20 rounded" />
                ) : (
                    <span className="text-base font-bold text-gray-900 dark:text-white font-mono tabular-nums leading-tight">
                        {isIndex ? formatPrice(price) : `$${formatPrice(price)}`}
                    </span>
                )}
            </div>
        );
    };

    return (
        <div className="flex items-stretch gap-2 sm:gap-3 w-full">
            {ETF_INDICES.map(({ ticker, label }) => {
                const stock = data[ticker];
                const price = stock?.currentPrice ?? null;
                const close = stock?.closePrice ?? null;
                const change = stock?.percentChange ?? null;
                const pts = history[ticker] ?? [];
                const dollarChg = (price != null && close != null) ? price - close : null;

                return renderCard({ label, price, dollarChg, percentChg: change, pts });
            })}

            {renderCard({
                label: 'DJIA',
                price: djia?.price ?? null,
                dollarChg: djia?.dollarChange ?? null,
                percentChg: djia?.percentChange ?? null,
                pts: djia?.intraday ?? [],
                isIndex: true,
            })}
        </div>
    );
}
